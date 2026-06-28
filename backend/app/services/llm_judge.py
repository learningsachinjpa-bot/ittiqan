"""
Pluggable LLM judge — supports Anthropic, OpenAI, Gemini, Mistral, Groq, Ollama.

ARCH-06: All provider calls retry up to 3 times with exponential backoff.
         Transient failures (429, 500, 529) are retried. Auth failures (401, 403) are not.
"""
from typing import Optional
import asyncio
import httpx

RETRYABLE_STATUS = {429, 500, 502, 503, 529}  # rate limit, server error, overloaded

async def _with_retry(fn, max_attempts: int = 3):
    last_exc = None
    for attempt in range(max_attempts):
        try:
            return await fn()
        except ValueError as e:
            # Parse the status from the message to decide if retryable
            msg = str(e)
            is_retryable = any(str(s) in msg for s in RETRYABLE_STATUS)
            if not is_retryable or attempt == max_attempts - 1:
                raise
            wait = 2 ** attempt  # 1s, 2s, 4s
            await asyncio.sleep(wait)
            last_exc = e
        except httpx.TransportError as e:
            if attempt == max_attempts - 1:
                raise ValueError(f"Network error after {max_attempts} attempts: {e}")
            await asyncio.sleep(2 ** attempt)
            last_exc = e
    raise last_exc


def _extract_error(resp: httpx.Response, provider: str) -> str:
    """Parse provider-specific error messages so users see actionable text."""
    try:
        body = resp.json()
    except Exception:
        return f"HTTP {resp.status_code}: {resp.text[:200]}"

    if provider == "anthropic":
        err = body.get("error", {})
        msg = err.get("message", "")
        if resp.status_code == 401:
            return "Invalid API key. Check your Anthropic key at console.anthropic.com."
        if resp.status_code == 400 and "model" in msg.lower():
            return f"Model not found: {msg}"
        if resp.status_code == 400:
            return f"Bad request: {msg or body}"
        if resp.status_code == 429:
            return "Rate limit hit. Your Anthropic account may need credit."
        return f"Anthropic error {resp.status_code}: {msg or body}"

    if provider in ("openai", "azure_openai", "groq"):
        err = body.get("error", {})
        msg = err.get("message", "")
        if resp.status_code == 401:
            return "Invalid API key."
        if resp.status_code == 404:
            return f"Model not found: {msg}"
        if resp.status_code == 429:
            return "Rate limit or quota exceeded."
        return f"API error {resp.status_code}: {msg or body}"

    if provider == "gemini":
        err = body.get("error", {})
        msg = err.get("message", "")
        if resp.status_code == 400 and "API_KEY_INVALID" in str(body):
            return "Invalid Gemini API key. Get one at aistudio.google.com."
        if resp.status_code == 404:
            return f"Model not found or API not enabled: {msg}"
        return f"Gemini error {resp.status_code}: {msg or body}"

    if provider == "mistral":
        msg = body.get("message", str(body))
        if resp.status_code == 401:
            return "Invalid Mistral API key."
        return f"Mistral error {resp.status_code}: {msg}"

    return f"HTTP {resp.status_code}: {str(body)[:200]}"


class LLMJudge:
    def __init__(self, provider: str, model: str, api_key: str, base_url: Optional[str] = None):
        self.provider = provider
        self.model = model
        self.api_key = api_key
        self.base_url = base_url

    async def complete(self, system_prompt: str, user_prompt: str) -> str:
        return await _with_retry(lambda: self._complete_once(system_prompt, user_prompt))

    async def _complete_once(self, system_prompt: str, user_prompt: str) -> str:
        if self.provider == "anthropic":
            return await self._anthropic(system_prompt, user_prompt)
        elif self.provider in ("openai", "azure_openai"):
            return await self._openai(system_prompt, user_prompt)
        elif self.provider == "gemini":
            return await self._gemini(system_prompt, user_prompt)
        elif self.provider == "mistral":
            return await self._mistral(system_prompt, user_prompt)
        elif self.provider == "groq":
            return await self._groq(system_prompt, user_prompt)
        elif self.provider == "ollama":
            return await self._ollama(system_prompt, user_prompt)
        elif self.provider == "custom":
            return await self._openai(system_prompt, user_prompt)
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

    async def _anthropic(self, system_prompt: str, user_prompt: str) -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": 1024,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            if resp.status_code != 200:
                raise ValueError(_extract_error(resp, "anthropic"))
            return resp.json()["content"][0]["text"]

    async def _openai(self, system_prompt: str, user_prompt: str) -> str:
        base = self.base_url or "https://api.openai.com/v1"
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 1024,
                },
            )
            if resp.status_code != 200:
                raise ValueError(_extract_error(resp, "openai"))
            return resp.json()["choices"][0]["message"]["content"]

    async def _gemini(self, system_prompt: str, user_prompt: str) -> str:
        # MED-11: key goes in header, NOT the URL (URL is logged by proxies)
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent",
                headers={"x-goog-api-key": self.api_key, "Content-Type": "application/json"},
                json={
                    "system_instruction": {"parts": [{"text": system_prompt}]},
                    "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                },
            )
            if resp.status_code != 200:
                raise ValueError(_extract_error(resp, "gemini"))
            return resp.json()["candidates"][0]["content"]["parts"][0]["text"]

    async def _mistral(self, system_prompt: str, user_prompt: str) -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.mistral.ai/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
            if resp.status_code != 200:
                raise ValueError(_extract_error(resp, "mistral"))
            return resp.json()["choices"][0]["message"]["content"]

    async def _groq(self, system_prompt: str, user_prompt: str) -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
            if resp.status_code != 200:
                raise ValueError(_extract_error(resp, "groq"))
            return resp.json()["choices"][0]["message"]["content"]

    async def _ollama(self, system_prompt: str, user_prompt: str) -> str:
        base = self.base_url or "http://localhost:11434"
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{base}/api/chat",
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "stream": False,
                },
            )
            if resp.status_code != 200:
                raise ValueError(f"Ollama error {resp.status_code}: {resp.text[:200]}")
            return resp.json()["message"]["content"]

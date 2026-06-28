"""
Column-level AES-256 encryption for sensitive test case fields.

Strategy (backward-compatible, no schema change):
  - Text fields (input, expected_output): store ciphertext directly.
    On read, try decrypt; if it fails (old plaintext row), return as-is.
  - JSON fields (retrieval_context, context): wrap as {"_enc": "<ciphertext>"}
    so SQLAlchemy's JSON column stores a dict that signals encryption.
    On read, check for the "_enc" key and decrypt+parse.
"""

import json
import logging
from app.core.security import encrypt_secret, decrypt_secret

logger = logging.getLogger(__name__)

_MARKER = "_enc"


# ── Text field helpers ────────────────────────────────────────────────────────

def encrypt_text(value: str | None) -> str | None:
    if value is None:
        return None
    return encrypt_secret(value)


def decrypt_text(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return decrypt_secret(value)
    except Exception:
        # Pre-encryption row — return plaintext as-is
        return value


# ── JSON field helpers ────────────────────────────────────────────────────────

def encrypt_json(value: object | None) -> dict | None:
    """Serialize and encrypt a JSON-able value. Returns {"_enc": ciphertext}."""
    if value is None:
        return None
    try:
        return {_MARKER: encrypt_secret(json.dumps(value, ensure_ascii=False))}
    except Exception:
        logger.warning("field_encryption: failed to encrypt JSON field, storing plaintext")
        return value  # type: ignore[return-value]


def decrypt_json(value: object | None) -> object | None:
    """Decrypt a value previously encrypted with encrypt_json. Falls back to plaintext."""
    if value is None:
        return None
    if isinstance(value, dict) and _MARKER in value:
        try:
            return json.loads(decrypt_secret(value[_MARKER]))
        except Exception:
            logger.warning("field_encryption: failed to decrypt JSON field")
            return None
    # Pre-encryption row — return as-is
    return value

# Ittiqan — Master QA Process

> **Rule:** A feature is not done when it is built. A feature is done when every gate below passes with zero Critical or High issues. No exceptions. No skipping gates. No "I think it works."

---

## How to Use This Document

Run gates in order. Each gate is a hard blocker — if it fails, stop and fix before continuing.

```
Gate 0: Static Analysis        ← automated, run in 60 seconds. STOP if it fails.
        ↓
Gate 1: Code Review            ← read every line of every changed file
        ↓
Gate 2: Backend Contract       ← verify backend correctness and security
        ↓
Gate 3: API Contract           ← verify frontend ↔ backend field-by-field
        ↓
Gate 4: Full Functional Test   ← click every button, fill every form, test every error
        ↓
Gate 5: Cross-Cutting QA       ← security, performance, accessibility, encoding
        ↓
        FEATURE DONE

Gate 6: Pre-Deploy             ← run before every production deployment
```

**Severity definitions:**
- **Critical** — feature is broken, data is wrong, security hole, crash. Fix immediately.
- **High** — significant functionality missing or wrong, user will hit it. Fix before moving on.
- **Medium** — degraded experience, cosmetic defect with functional impact. Log and fix in current sprint.
- **Low** — purely cosmetic, no functional impact. Log for cleanup.

---

## Gate 0 — Static Analysis (Run First, Takes 60 Seconds)

Run all of these before touching any other gate. If any fail, stop.

### 0.1 Frontend Build

```powershell
cd "C:\Users\Sachin Patil\Documents\ittiqan\frontend"

# TypeScript — zero type errors
npx tsc --noEmit
# Expected: exits 0, no output

# Vite build — catches parse errors tsc misses (oxc parser is stricter)
npx vite build 2>&1 | Select-Object -First 40
# Expected: exits 0, no PARSE_ERROR, no Transform failed

# Encoding — every TSX/TS file must be clean UTF-8
python -c "
import glob, sys
errors = []
for f in glob.glob('src/**/*.tsx', recursive=True) + glob.glob('src/**/*.ts', recursive=True):
    try:
        open(f,'rb').read().decode('utf-8')
    except Exception as e:
        errors.append(f'{f}: {e}')
if errors:
    print('ENCODING ERRORS:')
    [print(e) for e in errors]
    sys.exit(1)
else:
    print('All files clean UTF-8')
"
# Expected: "All files clean UTF-8"

# Mojibake scan — detect corrupted byte sequences from past encoding scripts
python -c "
import glob
BAD = [b'\xc3\xa2\xc2\x80', b'\xc3\x83\xc2\xa2']
found = []
for f in glob.glob('src/**/*.tsx', recursive=True):
    raw = open(f,'rb').read()
    for b in BAD:
        if b in raw:
            found.append(f)
            break
if found:
    print('MOJIBAKE DETECTED IN:')
    [print(f) for f in found]
else:
    print('No mojibake patterns found')
"
```

### 0.2 Backend Syntax

```powershell
cd "C:\Users\Sachin Patil\Documents\ittiqan\backend"

# Python syntax check on all routers
python -m py_compile app/routers/agents.py app/routers/auth.py app/routers/datasets.py app/routers/evaluations.py app/routers/security.py app/routers/llm_providers.py app/routers/organizations.py app/routers/observability.py
# Expected: no output (silence = success)

# Import check — catches missing imports, circular deps
python -c "import app.routers.agents; import app.routers.evaluations; import app.routers.datasets; print('Imports OK')"
```

### 0.3 Pass Criteria

| Check | Must pass |
|---|---|
| `tsc --noEmit` | Exit 0, zero errors |
| `vite build` | Exit 0, no PARSE_ERROR |
| UTF-8 encoding | Zero files with decode errors |
| Mojibake scan | Zero files flagged |
| Python py_compile | Silent (no errors) |
| Python import check | "Imports OK" |

**All 6 must pass. If any fail — fix and re-run from the top before opening any other gate.**

---

## Gate 1 — Code Review

Read every line of every changed file. Not skim — read.

### 1.1 TypeScript Quality

For every `.tsx` / `.ts` file changed:

- [ ] Zero `any` types — run `grep -n ": any\|as any\|<any>" file.tsx` — must return nothing (catch blocks `catch (e: any)` are acceptable)
- [ ] All `useState` have typed generics: `useState<Agent[]>([])` not `useState([])`
- [ ] All `useRef` have typed generics: `useRef<HTMLInputElement>(null)`
- [ ] All props have explicit interface definitions — no implicit `{}` props
- [ ] All API response assignments typed against `src/types/index.ts` — no inline guessing
- [ ] No `// @ts-ignore` or `// @ts-expect-error` comments
- [ ] No `console.log` left in — only `console.error` in catch blocks
- [ ] No TODO comments that affect runtime behaviour
- [ ] No dead code: functions defined but never called, variables assigned but never read
- [ ] No duplicate state: same value stored in two `useState` — pick one source of truth

### 1.2 React Patterns

- [ ] `useEffect` dependency array is complete and correct — no missing deps, no suppressed lint warnings
- [ ] No infinite render loops: no object/array literals created inside render that feed `useEffect` deps
- [ ] All async operations in `useEffect` properly cleaned up (cancelled on unmount) where they update state
- [ ] Lists use stable `key` prop from `item.id`, never array index
- [ ] No state mutations: `state.push(x)` is wrong — must be `setState([...state, x])`
- [ ] Forms use controlled inputs: `value={state}` + `onChange` — no mixing with uncontrolled
- [ ] `loading` state set to `false` in both success and error paths — never left spinning

### 1.3 API Integration

- [ ] Every API call uses a function from `src/lib/api.ts` — zero raw `fetch()` calls in page components
- [ ] Every `await api.*()` call is inside a `try/catch`
- [ ] Error message shown to user via UI element — not just `console.error(e)` and silence
- [ ] Loading spinner/disabled button shown while API call is in flight
- [ ] Success: UI reflects new state (item added to list, form cleared, drawer closed)
- [ ] No API call on every keystroke — debounce search inputs, call on submit for forms
- [ ] No API calls fired before user has authenticated (`useAuth()` user is not null)
- [ ] `useEffect` API calls have the correct dependency array so they don't fire 100 times

### 1.4 Form Validation

- [ ] Required fields: client-side check before calling API — empty submit shows field-level error
- [ ] Email: `type="email"` or regex validation before API call
- [ ] Password: minimum 8 chars enforced client-side
- [ ] URL fields: basic format check before submitting
- [ ] Submit button `disabled` while `loading === true` — prevents double-submit
- [ ] Fields NOT cleared when API returns error (user must be able to fix and retry)
- [ ] Fields cleared after successful create/submit
- [ ] Server validation errors (422/400) mapped to field-level display, not just a generic banner

### 1.5 Data Display

- [ ] `null` / `undefined` never rendered as text — all optionals use `?? '—'` or conditional render
- [ ] Dates: formatted as human-readable via `toLocaleDateString()` or `toLocaleString()` — no raw ISO strings shown to users
- [ ] Numbers: use `toLocaleString()` for counts, `.toFixed(1)` for percentages
- [ ] Metric scores: multiplied by 100 before display (`score * 100` → `"73%"`) — never shown as `0.73`
- [ ] Long strings: `truncate` class or `line-clamp` applied — no text overflowing containers
- [ ] Empty list: meaningful empty state component with icon + message, not blank space
- [ ] Loading: skeleton or spinner visible while data fetches, not blank/undefined
- [ ] Error state: actionable error message with retry option where applicable

### 1.6 Security (in Frontend Code)

- [ ] No secrets, API keys, or tokens hardcoded in TSX/TS files
- [ ] `localStorage` only used for: `ittiqan_access_token`, `ittiqan_refresh_token` — nothing else sensitive
- [ ] No `dangerouslySetInnerHTML` usage (XSS risk)
- [ ] User-supplied text rendered as React children (escaped by default) — never concatenated into `innerHTML`
- [ ] File upload: client-side extension check before sending (`.json`, `.csv` only for datasets)

### 1.7 Ittiqan-Specific Patterns

- [ ] Metric display names: always `metricRegistry[id]?.name || id` — never render raw metric IDs
- [ ] Evaluation status badges: always from `STATUS_BADGE` map, not inline `if/else` color strings
- [ ] WebSocket URLs: always `getWsUrl(path)` from `api.ts` — never `ws://localhost:8000` hardcoded
- [ ] Agent capabilities → metrics filter is strict: only metrics for selected capabilities shown by default
- [ ] `confidence < 0.7` → low-confidence badge shown on metric result
- [ ] Scores `< threshold` → fail badge; `>= threshold` → pass badge

---

## Gate 2 — Backend Code Review

Read every changed Python file. Run on every router, model, or service file changed.

### 2.1 Authentication & Authorization

- [ ] **Every endpoint** (except `/auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/google`) has `Depends(get_current_user)` or `Depends(require_role(...))`
- [ ] Every endpoint that modifies data uses `require_role("owner","admin","developer")` or stricter
- [ ] Every delete endpoint uses `require_role("owner","admin")`
- [ ] **Every DB query** filters by `org_id` — user can only see their own org's data. Check: `db.query(Model).filter(Model.org_id == m.org_id)`
- [ ] `OrgMember` lookup happens before any DB query that returns data
- [ ] WebSocket endpoints: auth validation happens **before** `await websocket.accept()` — never after
- [ ] No endpoint returns data from a different org under any path manipulation

### 2.2 Error Handling

- [ ] `HTTPException` raised with meaningful `detail` string for every 400/403/404/422 case
- [ ] External HTTP calls (LLM API, agent endpoint) wrapped in `try/except httpx.*` with specific messages per error type: `ConnectError` → "Cannot connect...", `TimeoutException` → "Timed out...", `InvalidURL` → "Invalid URL..."
- [ ] DB `db.commit()` calls wrapped in `try/except` with `db.rollback()` in except block
- [ ] Background tasks (`asyncio.create_task`, `BackgroundTasks`) have their own `try/except` that sets job status to `'failed'` with `error_message` and `error_action`
- [ ] No raw Python tracebacks in response bodies — `str(e)` is acceptable, `traceback.format_exc()` in response is not
- [ ] `_action_for_error(e)` pattern used to give users actionable next steps, not just raw error text

### 2.3 Serialization (Most Common Failure Mode)

For every `*_to_dict()` function:

- [ ] Open `frontend/src/types/index.ts` — list every field in the corresponding TS interface
- [ ] Verify every field is present in the dict — one-by-one, field name matches exactly (snake_case both sides)
- [ ] `datetime` fields: serialized as `.isoformat()` — never raw `datetime` object
- [ ] `enum` fields: serialized as `.value` — never raw enum object (e.g. `a.status.value` not `a.status`)
- [ ] Optional fields on old DB rows: `getattr(obj, "field", None)` not `obj.field` (avoids AttributeError on rows missing the column)
- [ ] Arrays: return `[]` not `null` when empty — use `a.field or []`
- [ ] Dicts: return `{}` not `null` when empty — use `a.field or {}`
- [ ] Nested objects: `metric_results` inner structure matches `MetricResult` TS interface field-for-field

### 2.4 Encryption

- [ ] Test case `input`: `encrypt_text()` on write, `decrypt_text()` on read before returning to frontend
- [ ] Test case `expected_output`: same as above
- [ ] Test case `context`: `encrypt_json()` on write, `decrypt_json()` on read
- [ ] Test case `retrieval_context`: same as above
- [ ] `decrypt_text()` / `decrypt_json()` must not crash on unencrypted legacy rows (fallback to plaintext)
- [ ] Agent `api_key_encrypted`: `encrypt_secret()` on write, `decrypt_secret()` before passing to LLM client — never stored or logged in plaintext
- [ ] LLM provider `api_key_encrypted`: same as above
- [ ] Encrypted fields never appear in audit logs, error messages, or any response body

### 2.5 Database Integrity

- [ ] No N+1 queries: loops that call DB inside are caught — use `.in_()` filter or `joinedload()`
- [ ] `db.commit()` followed immediately by `db.refresh(obj)` before returning the object — never return stale pre-commit state
- [ ] Version increments on Dataset use SQL expression: `Dataset.version + 1` not Python `dataset.version + 1` (avoids race conditions)
- [ ] `AuditLog` entry created for: agent create, agent update, agent delete, evaluation create, dataset upload, dataset delete, results export
- [ ] Background task starts only after `db.commit()` — transaction must be committed before background work references the row
- [ ] `last_evaluated_at` on `Agent` updated when evaluation status changes to `completed`
- [ ] `agent_endpoint_snapshot` stored on evaluation create — immutable at eval time even if agent is later edited
- [ ] `dataset_version` stored on evaluation create — reproducibility audit trail
- [ ] `judge_prompt_version = JUDGE_PROMPT_VERSION` constant stored on evaluation create

### 2.6 Input Validation

- [ ] Every request body uses a Pydantic model — zero `body: dict` parameters
- [ ] `name` fields: `len(v.strip()) >= 1` and `<= 200` validated with `@field_validator`
- [ ] `endpoint_url` fields: `validate_url()` SSRF check called before any outbound connection or storage
- [ ] File uploads: extension validated (`.json`, `.csv` only), content-type validated, max size enforced
- [ ] Enum fields automatically validated by Pydantic — but verify the enum values match what frontend sends
- [ ] `llm_judge_provider_id` FK validated — if provided, the provider must exist in the same org

### 2.7 Performance

- [ ] List endpoints paginated: `?limit=N&offset=N` supported — no endpoint returning unlimited rows
- [ ] Expensive computations (metric scoring, attack generation) run in background tasks, not in request handlers
- [ ] No synchronous `time.sleep()` in async handlers
- [ ] DB session properly closed: `finally: db.close()` in background tasks that create their own session

---

## Gate 3 — API Contract Verification

For every endpoint touched by the feature, compare frontend and backend side-by-side.

### 3.1 URL and Method Match

Open `frontend/src/lib/api.ts` and `backend/app/routers/*.py` side by side:

| Check | How to verify |
|---|---|
| URL path matches exactly | `api.ts` `'/agents'` = router `prefix="/agents"` + `@router.get("")` |
| HTTP method matches | `api.ts` `{ method: 'POST' }` = `@router.post("")` |
| Path params match | `api.ts` `/agents/${id}` = router `/{agent_id}` |
| Query params match | `api.ts` `?limit=${n}` = router `limit: int = Query(100)` |

### 3.2 Request Body — Field by Field

For each `POST` / `PUT` call, open both files and check every field:

| Field check | TS side | Python side |
|---|---|---|
| Field name | key in body object | Pydantic field name |
| Type | `string` | `str` / `Optional[str]` |
| Optional | `field?:` | `Optional[...] = None` |
| Default | omitted from body | has `= default` |

Run this for: `CreateAgentBody`, `RunEvaluationBody`, `CreateAssessmentBody`, `CreateProviderBody`, `AddTestCaseBody`.

### 3.3 Response Body — Field by Field

Open the TS interface from `src/types/index.ts` and the Python `*_to_dict()` function.
Check every field in the TS interface exists in the Python dict with exact name:

**Agent contract:**
| TS field | Python dict key | Type check |
|---|---|---|
| `id` | `"id"` | string |
| `org_id` | `"org_id"` | string |
| `name` | `"name"` | string |
| `description` | `"description"` | string or null |
| `tags` | `"tags"` | array, `[]` if empty |
| `status` | `"status"` | enum `.value` string |
| `endpoint_url` | `"endpoint_url"` | string |
| `http_method` | `"http_method"` | enum `.value` string |
| `headers` | `"headers"` | dict, `{}` if empty |
| `payload_template` | `"payload_template"` | string or null |
| `response_path` | `"response_path"` | string or null |
| `has_api_key` | `"has_api_key"` | bool |
| `enable_multi_turn` | `"enable_multi_turn"` | bool |
| `enable_trace_metrics` | `"enable_trace_metrics"` | bool |
| `metrics_config` | `"metrics_config"` | dict, `{}` if empty |
| `default_metrics` | `"default_metrics"` | array, `[]` if empty |
| `llm_judge_provider` | `"llm_judge_provider"` | string |
| `llm_judge_model` | `"llm_judge_model"` | string |
| `llm_judge_provider_id` | `"llm_judge_provider_id"` | string or null |
| `last_evaluated_at` | `"last_evaluated_at"` | ISO string or null |
| `created_at` | `"created_at"` | ISO string |

Repeat the same table exercise for: `Evaluation`, `EvaluationResult`, `Dataset`, `LLMProvider`, `SecurityAssessment`, `Organization`, `User`.

### 3.4 Error Shape

- [ ] All error responses are `{"detail": "message string"}` — FastAPI default
- [ ] Frontend `request()` in `api.ts` reads `err.detail` — confirmed
- [ ] `401` → `tryRefresh()` attempted → if fails, redirect to `/login`
- [ ] `403` → user sees "You don't have permission" — not blank screen
- [ ] `404` → user sees "Not found" message — not blank screen or crash
- [ ] `422` (Pydantic validation) → user sees which field failed
- [ ] `500` → user sees "Something went wrong, try again" — no raw Python traceback

### 3.5 Ittiqan Historical Contract Failures

These have broken before. Check explicitly every time:

| Frontend reads | Backend must return | File | Verified |
|---|---|---|---|
| `agent.default_metrics` | `"default_metrics"` in `agent_to_dict()` as `[]` if null | agents.py | [ ] |
| `agent.llm_judge_provider_id` | `"llm_judge_provider_id"` in `agent_to_dict()` | agents.py | [ ] |
| `provider.base_url` | `"base_url"` in `provider_to_dict()` | llm_providers.py | [ ] |
| `provider.total_calls` | `"total_calls"` in `provider_to_dict()` | llm_providers.py | [ ] |
| `evaluation.dataset_version` | `"dataset_version"` in `eval_to_dict()` | evaluations.py | [ ] |
| `evaluation.judge_prompt_version` | `"judge_prompt_version"` in `eval_to_dict()` | evaluations.py | [ ] |
| `result.failure_types` | `"failure_types"` NOT `"failure_taxonomy"` | evaluations.py | [ ] |
| `metricRegistry[id].name` | `"name"` in `/evaluations/metrics` response | evaluations.py | [ ] |
| `dataset.version` | `"version"` in dataset dict | datasets.py | [ ] |
| `org.region` | `"region"` in org dict | organizations.py | [ ] |

---

## Gate 4 — Full Functional Test

**This gate is manual. You must open the browser and test every item below with your own hands.**

Every checkbox = one physical action you performed and observed. If you did not do it, do not check it.

### Pre-Flight (Do This First)

- [ ] Backend is running: `python -m uvicorn main:app --reload --port 8000` — no startup errors in terminal
- [ ] Frontend is running: `npm run dev` — no errors in terminal
- [ ] `F12 → Console` open on `http://localhost:3000` — watching for errors throughout all tests below
- [ ] `F12 → Network` open — watching for failed requests throughout all tests below

---

### PAGE 1: LandingPage (`/`)

**Layout & Content:**
- [ ] Page loads without errors — no blank screen, no console errors
- [ ] Ittiqan logo and name visible in top-left navbar
- [ ] Navigation links ("Platform", "How it Works", "Integrate") visible
- [ ] Hero headline visible with "Trusted Agentic AI" text
- [ ] Stats row shows: `99.9%`, `70+`, `46`, `6`, `5`, `360°`, `150+`, `10K+`
- [ ] No `360Â°` or `â€"` mojibake characters visible (must be clean `360°`, `—`)

**Actions:**
- [ ] Click "Login" link → navigates to `/login`
- [ ] Click "Sign Up" link → navigates to `/signup`
- [ ] Click "Request Demo" button → navigates to `/signup`
- [ ] Click "Explore Platform" button → navigates to `/signup`
- [ ] Click "Platform" nav anchor → page scrolls to platform section
- [ ] Click "How it Works" anchor → page scrolls to how-it-works section

---

### PAGE 2: LoginPage (`/login`)

**Layout:**
- [ ] Page loads clean — no console errors, no network errors
- [ ] Email field, password field, and "Sign In" button all visible
- [ ] "Sign up" link visible in footer area
- [ ] Google sign-in button visible

**Validation — test each in isolation:**
- [ ] Submit with email empty, password filled → error shown below email field ("Email is required" or similar)
- [ ] Submit with email `notanemail`, password filled → error shown ("Invalid email format")
- [ ] Submit with email filled, password empty → error shown below password field
- [ ] Submit button disabled / shows spinner while API call is in progress (cannot double-click)

**Happy path:**
- [ ] Submit valid credentials → redirected to `/dashboard`
- [ ] Token stored: `localStorage.getItem('ittiqan_access_token')` returns a JWT (not null)
- [ ] Refresh page at `/dashboard` → stays on dashboard (not bounced to login)

**Error path:**
- [ ] Submit wrong password → error banner "Invalid credentials" (or equivalent) — form NOT cleared
- [ ] Backend returns 500 → user sees error banner, not blank screen

**Session:**
- [ ] While already logged in, navigate to `/login` → redirected to `/dashboard`
- [ ] After login, press browser Back → stays on `/dashboard` (login not re-enterable via back button)

---

### PAGE 3: SignupPage (`/signup`)

**Layout:**
- [ ] Name, email, password fields visible plus "Create Account" button
- [ ] "Sign in" link visible

**Validation:**
- [ ] Submit empty name → error below name field
- [ ] Submit empty email → error below email field
- [ ] Submit `notanemail` as email → email format error
- [ ] Submit password of 7 chars → "Minimum 8 characters" error
- [ ] Button disabled / shows spinner during API call

**Happy path:**
- [ ] Submit valid name + email + password → `POST /auth/signup` fires → redirected to `/onboarding`
- [ ] Token stored in localStorage after successful signup

**Error path:**
- [ ] Submit email already registered → "Email already registered" error shown — form NOT cleared (email still in field)
- [ ] Network error → error banner shown, user can retry

---

### PAGE 4: OnboardingPage (`/onboarding`)

**Layout:**
- [ ] Page loads with region selection visible
- [ ] UAE, Europe, US cards visible with flags/icons
- [ ] Plan selection cards (Free, Pro, Enterprise) visible
- [ ] Department and use-case input fields visible

**Actions:**
- [ ] Click UAE card → card gets highlighted border/color, PDPL badge shown
- [ ] Click Europe card → highlights, replaces UAE highlight
- [ ] Click US card → highlights, replaces Europe highlight
- [ ] Click Free plan card → highlighted
- [ ] Click Pro plan card → highlighted, replaces Free
- [ ] Click Enterprise card → highlighted, replaces Pro
- [ ] Type into Department field → value updates
- [ ] Type into Use Case field → value updates
- [ ] Submit without selecting region → shows error or defaults to UAE (not crashes)
- [ ] Submit with all valid → `POST /organizations` fires with correct `region`, `plan`, `department`, `use_case`
- [ ] On success → redirected to `/dashboard`
- [ ] On API error → error shown to user, form not cleared

---

### PAGE 5: AgentsRegistryPage (`/dashboard`)

**Layout:**
- [ ] Page loads without errors
- [ ] "Connect Agent" button visible in top-right area
- [ ] Page heading visible

**Empty state:**
- [ ] When no agents exist: empty state message visible ("Connect your first agent" or equivalent) — not blank space

**With agents:**
- [ ] Each agent card shows: agent name, status badge, last evaluated date
- [ ] Status badge `active` → green color
- [ ] Status badge `inactive` → gray color
- [ ] Status badge `degraded` → red or orange color
- [ ] `last_evaluated_at` = null → shows "Never" or "Not evaluated yet" — NOT "undefined" or blank
- [ ] `last_evaluated_at` = date → shows formatted date or relative time ("2 hours ago")
- [ ] Click agent card → navigates to `/project/{agent_id}/overview`

**Actions:**
- [ ] Click "Connect Agent" button → navigates to `/dashboard/connect-agent`

---

### PAGE 6: ConnectAgentPage (`/dashboard/connect-agent`)

**Step indicator:**
- [ ] Page loads on Step 1 — no Vite error overlay, no console errors
- [ ] Step indicator shows 5 steps, Step 1 active/highlighted

**Step 1 — Basics:**
- [ ] Name field visible and focused
- [ ] Description field visible (optional)
- [ ] Tags field visible — click to add a tag, tag appears as chip, click chip to remove
- [ ] Capabilities multi-select visible: RAG, Agentic, Multi-Turn, Conversational + any others
- [ ] Select multiple capabilities simultaneously → all stay selected
- [ ] Click "Next" with empty name → error "Name is required"
- [ ] Click "Next" with name filled → advances to Step 2

**Step 2 — Metrics:**
- [ ] Selected capabilities filter the metrics list — only relevant metrics shown by default
- [ ] Universal safety metrics (bias, toxicity, pii_leakage, prompt_injection) always shown regardless of capabilities
- [ ] Metric display names are human-readable ("Faithfulness", "Answer Relevancy") — not raw IDs
- [ ] Each metric has a checkbox — clicking toggles it
- [ ] "Show all metrics" toggle visible — when clicked, all metrics appear with amber/warning indicator
- [ ] Count of selected metrics shown ("X metrics selected")
- [ ] Back button → returns to Step 1, all Step 1 data preserved
- [ ] Next → advances to Step 3

**Step 3 — Connection:**
- [ ] Endpoint URL field visible
- [ ] HTTP method dropdown (GET/POST/PUT) — can change
- [ ] "Add Header" button → adds key/value row — can fill both fields
- [ ] Remove header button (×) on each header row — removes the row
- [ ] Payload template field editable — can type in it
- [ ] Response path field optional
- [ ] API key field masked (`type="password"`)
- [ ] Back → Step 2, data preserved
- [ ] Next with empty URL → error shown
- [ ] Next with valid URL → advances to Step 4

**Step 4 — Test Connection:**
- [ ] "Test Connection" button visible
- [ ] Click test: `POST /agents/{id}/test-connection` fires — network tab shows the call
- [ ] Success: green tick shown + response preview text + latency in ms
- [ ] Failure (wrong URL): red error shown with specific message ("Cannot connect to...", not just "Error")
- [ ] Failure (timeout): "Request timed out after 15 seconds" shown
- [ ] Failure (invalid URL format): "Invalid URL format" shown
- [ ] Can skip test and click Next → advances to Step 5

**Step 5 — Judge:**
- [ ] LLM Judge dropdown shows providers from API (not hardcoded)
- [ ] If a default judge exists → pre-selected in dropdown
- [ ] Can change to any provider
- [ ] "Finish" button visible
- [ ] Click Finish → `POST /agents` fires with body including `default_metrics` array and `llm_judge_provider_id`
- [ ] Verify in Network tab: `default_metrics` field present in request payload
- [ ] Verify in Network tab: `llm_judge_provider_id` field present in request payload
- [ ] Success → redirected to `/dashboard`, new agent visible in the agents list
- [ ] Failure → error shown to user, NOT redirected, form data preserved

---

### PAGE 7: ModelsPage (`/dashboard/models`)

**Layout:**
- [ ] Page loads — no errors, no "undefined" text
- [ ] "Add Provider" button visible

**Empty state:**
- [ ] When no providers: empty state message — not blank space

**Provider cards:**
- [ ] Each provider shows: name, provider type, model name
- [ ] `base_url` shown for Ollama/Azure/Custom/Bedrock providers — not shown for OpenAI/Anthropic/etc.
- [ ] `total_calls`, `total_tokens_used`, `total_cost_usd` shown as numbers — NOT `0` if data exists, NOT `NaN`
- [ ] `is_default_judge: true` → star or "Default Judge" badge shown
- [ ] `is_default_attacker: true` → badge shown

**Add Provider drawer:**
- [ ] Click "Add Provider" → drawer slides open
- [ ] Provider type dropdown visible with all 15 provider types (Anthropic, OpenAI, Gemini, Mistral, Groq, Ollama, Azure OpenAI, Bedrock, Vertex AI, Together, Perplexity, xAI, Cerebras, Cohere, Custom)
- [ ] Select Anthropic → model dropdown shows Anthropic models (claude-opus-4-8, claude-sonnet-4-6, etc.)
- [ ] Select OpenAI → model dropdown shows OpenAI models (gpt-4o, gpt-4o-mini, etc.)
- [ ] Select Ollama → `base_url` field appears
- [ ] Select Azure OpenAI → `base_url` field appears
- [ ] Select Custom → `base_url` field appears
- [ ] Select Anthropic → `base_url` field NOT shown
- [ ] Name field required — submit empty → error shown
- [ ] API key field masked
- [ ] "Set as default judge" toggle works
- [ ] "Set as default attacker" toggle works
- [ ] Save → `POST /llm-providers` fires → provider appears in list → drawer closes
- [ ] Save fails → error shown in drawer, drawer stays open

**Test connection:**
- [ ] Click test icon/button on provider → `POST /llm-providers/{id}/test` fires
- [ ] Success → "Connected" indicator + response snippet shown
- [ ] Failure → specific error message shown

**Edit provider:**
- [ ] Edit inline or via edit button → can update model name, base_url, API key
- [ ] Save edit → `PUT /llm-providers/{id}` fires → card updates

**Delete provider:**
- [ ] Click delete → confirmation dialog appears ("Are you sure?")
- [ ] Confirm → `DELETE /llm-providers/{id}` fires → provider removed from list
- [ ] Cancel → provider NOT deleted

**Default judge:**
- [ ] Set Provider A as default judge → A gets star badge
- [ ] Set Provider B as default judge → B gets star badge, A loses star badge (only one default at a time)

---

### PAGE 8: DatasetsPage (`/project/{id}/datasets`)

**Layout:**
- [ ] Page loads with datasets list from API
- [ ] Empty state when no datasets
- [ ] "Upload Dataset" button visible

**Dataset cards:**
- [ ] Each card shows: dataset name, version badge (`v1`, `v2`, etc.), row count
- [ ] Version badge is numeric — not "undefined", not `v0`
- [ ] Row count is a number — not "undefined", not "NaN"

**Upload drawer:**
- [ ] Click "Upload Dataset" → drawer opens
- [ ] File picker present — click it → OS file dialog opens
- [ ] Select a `.json` file → file name shown in UI
- [ ] Select a `.csv` file → file name shown in UI
- [ ] Select a `.txt` file → error "Only .json and .csv supported"
- [ ] Name field required — submit without name → error shown
- [ ] Description field optional
- [ ] "Download template" link → downloads sample JSON (do NOT throw 404)
- [ ] Upload valid JSON → multipart `POST /datasets/upload` fires → dataset appears in list with `v1` badge
- [ ] Upload empty file → error shown ("File cannot be empty")
- [ ] Upload invalid JSON (malformed) → error shown

**Test cases:**
- [ ] Click expand on dataset card → test cases load from API and display
- [ ] Each test case shows: input text, expected output (if present)
- [ ] Encrypted data decrypted correctly — no garbled text shown

**Add test case:**
- [ ] Click "Add test case" → drawer opens
- [ ] Input field required — submit empty → error
- [ ] Expected output optional
- [ ] Retrieval context optional (multi-value input)
- [ ] Save → `POST /datasets/{id}/test-cases` fires → test case appears in list → `row_count` increments by 1 → version badge increments (`v1 → v2`)

**Delete test case:**
- [ ] Hover test case row → delete icon/button appears
- [ ] Click delete → `DELETE /datasets/{id}/test-cases/{case_id}` fires → test case removed → `row_count` decrements → version bumps

**Delete dataset:**
- [ ] Click delete on dataset → confirmation appears
- [ ] Confirm → `DELETE /datasets/{id}` fires → dataset removed from list
- [ ] Cancel → NOT deleted

---

### PAGE 9: EvaluationsPage (`/project/{id}/evaluations`)

**Layout:**
- [ ] Page loads — evaluations list from API
- [ ] Empty state shown when no evaluations
- [ ] "Run Evaluation" button visible

**Evaluation cards:**
- [ ] Each card shows: name, status badge, overall score (if completed), date
- [ ] Status `pending` → gray/neutral badge
- [ ] Status `running` → blue/animated badge
- [ ] Status `judge_running` → purple/animated badge
- [ ] Status `completed` → green badge
- [ ] Status `failed` → red badge
- [ ] Overall score shown as percentage (`73%`) not decimal (`0.73`) — CRITICAL

**Run Evaluation drawer:**
- [ ] Click "Run Evaluation" → drawer opens
- [ ] Dataset dropdown populated from API — shows name + version + row count for each dataset
- [ ] LLM Judge dropdown populated from API — default judge pre-selected
- [ ] Metrics checklist shows human-readable display names (not IDs) — from `/evaluations/metrics` registry
- [ ] Agent's `default_metrics` pre-selected in checklist
- [ ] Can deselect pre-selected metrics
- [ ] Can select additional metrics
- [ ] Submit with no dataset selected → error "Select a dataset"
- [ ] Submit with no metrics selected → error "Select at least one metric"
- [ ] Submit valid → `POST /evaluations` fires → new evaluation appears in list with `pending` status
- [ ] Drawer closes on success

**Live progress:**
- [ ] Evaluation card shows progress bar when status is `running` or `judge_running`
- [ ] Progress bar updates as cases complete (WebSocket connection visible in Network tab as `ws://...`)
- [ ] `X / total_cases` counter updates in real time
- [ ] Cost counter updates in real time (if visible)
- [ ] On completion → status badge changes to green "Completed", score appears
- [ ] On failure → status badge changes to red "Failed", error message + action message shown

**Results (completed evaluation):**
- [ ] Click completed evaluation → results expand or navigate to results view
- [ ] Results list shows each test case: input, pass/fail icon, latency
- [ ] Click individual result row → expands to show: actual output, expected output, per-metric scores
- [ ] Metric names in results are display names NOT raw IDs — check against `/evaluations/metrics` registry
- [ ] Scores per metric shown as `73%` NOT `0.73` — CRITICAL
- [ ] Score bar (progress bar) uses correct color: green ≥ threshold, amber near threshold, red below
- [ ] `confidence < 0.7` → low-confidence badge/indicator shown on that metric result
- [ ] `failure_types` shown as chips/badges (e.g. "Incorrect Response", "Missing Context")
- [ ] `failure_attribution` shown ("model_quality" / "data_quality" / "context_quality")
- [ ] `criteria_scores` breakdown shown as sub-chips if present

**Retry failed evaluation:**
- [ ] Failed evaluation shows "Retry" button or actionable error text
- [ ] Retry button fires new `POST /evaluations` or re-queues existing

---

### PAGE 10: SecurityFrameworksPage (`/project/{id}/security`)

**Layout:**
- [ ] Page loads — no console errors
- [ ] 4 framework cards visible: "OWASP Top 10 for LLMs", "OWASP Top 10 for Agents", "NIST AI Risk Management Framework", "MITRE ATLAS"
- [ ] 5th card: "Custom Framework Builder" dashed border card visible
- [ ] **No mojibake characters** — framework icons must render as actual icons/emoji, not `ð¡`, `ð¤`, `ð`, `ð¯`

**Framework cards:**
- [ ] Each card shows: framework name, version badge, description, category count, vulnerability type count
- [ ] Category count correct: OWASP LLMs=10, OWASP Agents=10, NIST=4, MITRE=6
- [ ] Vuln type count correct: OWASP LLMs=114, OWASP Agents=84, NIST=77, MITRE=57
- [ ] Layer badges visible: "App Layer", "Synthetic Prompts"

**Actions:**
- [ ] Click OWASP LLMs card → navigates to `/project/{id}/security/assessments`
- [ ] Click OWASP Agents card → navigates to `/project/{id}/security/assessments`
- [ ] Click NIST card → navigates to `/project/{id}/security/assessments`
- [ ] Click MITRE card → navigates to `/project/{id}/security/assessments`
- [ ] Click "Open Builder →" on custom card → does NOT crash (may show "Coming soon" or open something)

---

### PAGE 11: SecurityAssessmentsPage (`/project/{id}/security/assessments`)

**Layout:**
- [ ] Page loads — past assessments listed
- [ ] Empty state shown when no assessments
- [ ] "New Assessment" button visible

**New Assessment flow:**
- [ ] Click "New Assessment" → framework selector or modal opens
- [ ] All 4 frameworks shown with descriptions
- [ ] Click framework card → framework selected/highlighted
- [ ] Category checkboxes appear for selected framework
- [ ] Can select/deselect categories
- [ ] Number of attacks per category input — can set value (e.g. 5, 10)
- [ ] Attacker provider dropdown populated from LLM providers
- [ ] Judge provider dropdown populated from LLM providers
- [ ] Start → `POST /security` fires → assessment appears in list with `running` status

**Live progress:**
- [ ] Progress bar updates during attack generation (WebSocket)
- [ ] Completed attacks counter increments
- [ ] On completion → status → "Completed", risk score shown

**Findings:**
- [ ] Click completed assessment → findings list appears
- [ ] Each finding shows: attack type, prompt used, response received, severity badge
- [ ] Severity badges: `critical`=red, `high`=orange, `medium`=yellow, `low`=blue, `info`=gray
- [ ] Filter "Show vulnerable only" → only `is_vulnerable: true` findings shown

**Failed assessment:**
- [ ] Failed assessment shows error message and action guidance

---

### PAGE 12: ProjectOverviewPage (`/project/{id}/overview`)

**Layout:**
- [ ] Page loads — no errors
- [ ] Agent name visible
- [ ] Agent status badge visible (correct color)

**Content:**
- [ ] Recent evaluations section shows last 3–5 evaluations (from API, not hardcoded)
- [ ] Each recent evaluation shows: name, date, status, score
- [ ] If no evaluations yet → empty state message (not blank space)
- [ ] Score trend / chart visible if evaluations exist (or appropriate empty state)

**Actions:**
- [ ] "Run Evaluation" quick action button → opens evaluation run drawer or navigates to evaluations page

---

### PAGE 13: SchedulePage (`/project/{id}/schedule`)

**Layout:**
- [ ] Page loads — no console errors
- [ ] **No mojibake characters** — "⏸ Pause all" button must show actual pause icon, not `â¸`; modal close button must show `×` not `Ã`; empty state icon must show real icon not `ð`
- [ ] "Add Schedule" button visible
- [ ] "Pause all" button visible

**Empty state:**
- [ ] When no schedules: empty state with icon + "No schedules configured" message
- [ ] "Add Schedule" button in empty state also works

**Add Schedule modal:**
- [ ] Click "Add Schedule" → modal opens
- [ ] Name field visible (required)
- [ ] Frequency dropdown shows preset cron options
- [ ] Dataset dropdown visible
- [ ] LLM Judge dropdown visible
- [ ] Click × (close) → modal closes without creating schedule
- [ ] Submit with empty name → no schedule created (if/cron guard in handleCreate)
- [ ] Submit with name + cron → schedule appears in list

**Schedules list:**
- [ ] Each schedule row shows: name, cron expression, dataset, judge, status
- [ ] Status shows "Active" in green

**Known limitation (document, do not fail QA):**
- [ ] NOTE: Schedules currently save to local React state only — not persisted to backend. Refresh loses all schedules. This is a known stub — will be wired to backend in a future sprint.

---

### PAGE 14: MetricsConfigPage (`/project/{id}/metrics`)

**Layout:**
- [ ] Page loads — no errors
- [ ] Metrics table visible with 31 metrics across 4 categories
- [ ] Filter input visible
- [ ] Source filter dropdown visible
- [ ] "Edit Mode" toggle button visible

**Filter:**
- [ ] Type "Faithfulness" in filter → only Faithfulness metric shown
- [ ] Clear filter → all metrics return
- [ ] Select "RAG" from source dropdown → only RAG metrics shown
- [ ] Select "All Sources" → all metrics return
- [ ] Combined filter: type "Turn" + select "Multi-Turn Conversation" → only matching metrics

**Edit mode:**
- [ ] Click "Edit Mode" button → button label changes to "Save Mode"
- [ ] Click "Save Mode" → reverts to "Edit Mode"

**Metric rows:**
- [ ] Each row shows: metric name, source badge (correct color), threshold value, enabled status
- [ ] Source badge colors: Multi-Turn=blue, RAG=purple, Safety/Security=red, Agentic=green
- [ ] Threshold values correct: Safety metrics default `0.80`, others `0.70`
- [ ] Hallucination Rate threshold `0.30` (lower is better — inverted)
- [ ] Enabled column shows "Active" in green for all 31 metrics

**Known limitation (document, do not fail QA):**
- [ ] NOTE: Edit Mode does not save threshold changes to backend. This is a known stub. Local state only.

---

### PAGE 15: TeamPage (`/dashboard/team`)

**Layout:**
- [ ] Page loads — no errors
- [ ] "Invite Team Member" section visible
- [ ] Email input + role dropdown + "Send Invite" button visible
- [ ] Members list shows current user (logged-in user's name and email)

**Actions:**
- [ ] Type email in invite field → value updates
- [ ] Change role dropdown → value updates
- [ ] Click "Send Invite" → (currently no API wired — known stub)

**Known limitation (document, do not fail QA):**
- [ ] NOTE: "Send Invite" does not call an API. Members list is hardcoded to show only the current user. Will be wired to backend invite endpoint in a future sprint.

---

### PAGE 16: UsagePage (`/dashboard/usage`)

**Layout:**
- [ ] Page loads — no errors
- [ ] 4 usage cards: Evaluations Run, Agents Connected, Datasets Uploaded, Security Scans
- [ ] Each card shows: label, `used / limit` counter, progress bar, remaining count
- [ ] Progress bar width matches `(used/limit) * 100%`
- [ ] Reset period section visible with date text

**Known limitation (document, do not fail QA):**
- [ ] NOTE: Usage data is hardcoded (Evaluations=0, Agents=1, Datasets=0, Scans=0). Not fetched from backend. Will be wired in a future sprint.

---

### PAGE 17: CurrentPlanPage (`/dashboard/plan`)

**Layout:**
- [ ] Page loads — no errors
- [ ] 3 plan cards visible: Free, Pro, Enterprise
- [ ] Free card highlighted with "Current" badge (cyan border)
- [ ] Each card shows: plan name, price, description, feature list
- [ ] Free card "Current Plan" button is disabled (gray, not clickable)
- [ ] Pro card "Upgrade" button visible and cyan
- [ ] Enterprise card "Upgrade" button visible
- [ ] Feature lists correct: Free has 4 features, Pro has 5, Enterprise has 5

**Actions:**
- [ ] Click "Upgrade" on Pro → (no API wired — expected behavior: nothing or "Coming soon")
- [ ] Click "Upgrade" on Enterprise → same

---

### GLOBAL: Auth & Session (Test on Every Page)

- [ ] Open any `/dashboard/*` URL in a fresh browser (no token) → redirected to `/login`
- [ ] Open any `/project/*` URL in a fresh browser (no token) → redirected to `/login`
- [ ] Open `/` (landing) without token → stays on landing (not redirected)
- [ ] After login, press Back → does NOT go back to login page
- [ ] Logout button (in sidebar/navbar) → `localStorage` cleared → redirected to `/login`
- [ ] After logout, press Back in browser → still on `/login` or redirected back to it
- [ ] Refresh any logged-in page → stays on page, data reloads from API
- [ ] Wait for token to expire → next API call triggers refresh → if refresh fails → redirect to `/login`

---

### GLOBAL: Console & Network Audit (Every Page)

After visiting each page above, verify:

- [ ] `F12 → Console` shows **zero red errors** — not a single uncaught error or unhandled rejection
- [ ] `F12 → Console` shows no `Warning: Each child in a list should have a unique "key" prop`
- [ ] `F12 → Console` shows no `Warning: Can't perform a React state update on an unmounted component`
- [ ] `F12 → Network` shows **zero failed (red) requests** on page load
- [ ] No text `undefined` visible anywhere on any page
- [ ] No text `NaN` visible in any number or score field
- [ ] No text `[object Object]` visible anywhere
- [ ] No text `null` visible (should be `—` or hidden)
- [ ] No raw metric IDs visible (e.g. `answer_relevancy`) — must be display names

---

## Gate 5 — Cross-Cutting QA

### 5.1 Security Audit

Run from project root (`ittiqan/`):

```powershell
# No hardcoded secrets
grep -rn "api_key\s*=\s*['\"]" backend/app/ --include="*.py"
grep -rn "password\s*=\s*['\"]" backend/app/ --include="*.py"
grep -rn "SECRET_KEY\s*=" backend/app/ --include="*.py"
# All must return nothing (no matches)

# No secrets in frontend
grep -rn "sk-" frontend/src/ --include="*.ts" --include="*.tsx"
grep -rn "Bearer " frontend/src/ --include="*.ts" --include="*.tsx"
# Must return nothing

# .env not committed
git ls-files | findstr ".env$"
# Must return nothing (no .env files tracked)
```

- [ ] CORS `allow_origins` is `["http://localhost:3000"]` in dev, NOT `["*"]`
- [ ] All LLM provider API keys only in `.env`, never in `backend/app/` files
- [ ] Redis used for token blacklist — `GET ittiqan:blacklist:{token}` returns `"1"` after logout
- [ ] Security headers present on all responses: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`

### 5.2 Performance Spot Checks

- [ ] AgentsRegistry list loads in < 1 second (network tab timing)
- [ ] EvaluationsPage loads in < 2 seconds
- [ ] DatasetsPage with 10 datasets loads in < 2 seconds
- [ ] No request fires more than once on page load (no duplicate API calls in network tab)
- [ ] WebSocket connects in < 500ms when evaluation starts

### 5.3 Encoding Final Sweep

```powershell
cd "C:\Users\Sachin Patil\Documents\ittiqan\frontend"
python -c "
import glob, re
# Check for common mojibake patterns visible in rendered text
PATTERNS = ['Ã', 'â€', 'ð', 'Â°', 'Â©', 'â¸', 'Ã—']
for f in glob.glob('src/**/*.tsx', recursive=True):
    content = open(f, encoding='utf-8').read()
    for p in PATTERNS:
        if p in content:
            print(f'MOJIBAKE [{p}] in {f}')
"
```

- [ ] Zero mojibake patterns found
- [ ] Emoji characters render correctly in browser (not as `ð` boxes)
- [ ] Special characters render correctly: `°`, `→`, `—`, `©`, `×`

### 5.4 Accessibility Baseline

- [ ] Every `<img>` has an `alt` attribute
- [ ] Every form `<input>` has an associated `<label>` (via `htmlFor`) or `aria-label`
- [ ] Interactive elements (buttons, links) have visible focus rings when tabbed
- [ ] Color alone is not the only indicator of status (status badge has text + color, not just color)
- [ ] Error messages are not only red — also have text description

### 5.5 Responsive Check

- [ ] Open DevTools → toggle responsive mode → test at 375px (mobile), 768px (tablet), 1280px (desktop)
- [ ] At 375px: no horizontal scroll, text readable, buttons tappable (not tiny)
- [ ] At 768px: layout works, no overflow
- [ ] At 1280px: layout uses space well, not stretched to full width on all breakpoints

---

## Gate 6 — Pre-Deploy Checklist

Run before every production VPS deployment. Nothing ships with a Critical or High issue.

### 6.1 Build Clean

```powershell
cd "C:\Users\Sachin Patil\Documents\ittiqan\frontend"
npm run build
# Must exit 0 with no errors

npx tsc --noEmit
# Must exit 0

cd "C:\Users\Sachin Patil\Documents\ittiqan\backend"
python -m py_compile app/routers/agents.py app/routers/evaluations.py app/routers/datasets.py app/routers/security.py app/routers/llm_providers.py app/routers/organizations.py app/routers/auth.py
# Must be silent
```

### 6.2 Secrets Audit

- [ ] No `.env` file committed to git: `git ls-files | findstr ".env"` → empty
- [ ] `.env.example` committed with all variable names but NO values
- [ ] `DEBUG=False` in production `.env`
- [ ] `SECRET_KEY` is a long random string (not `"secret"` or `"dev"`)
- [ ] `ENCRYPTION_KEY` is a 32-byte Fernet key
- [ ] `FRONTEND_URL` set to production domain (not `localhost:3000`)
- [ ] CORS `allow_origins` set to production domain (not `["*"]`)

### 6.3 Database

- [ ] All column migrations in `_run_column_migrations()` have `IF NOT EXISTS` — safe to run on existing DB
- [ ] `agents` table has columns: `default_metrics` (JSON), `llm_judge_provider_id` (VARCHAR FK)
- [ ] No ORM model references a column that doesn't exist in the table
- [ ] Redis reachable: `redis-cli ping` → `PONG`

### 6.4 Docker / Server

- [ ] `docker compose up` starts all services (backend, redis) with no errors
- [ ] `/health` endpoint returns `{"status": "healthy"}`
- [ ] Frontend `npm run build` output served at production domain

### 6.5 Smoke Test (Post-Deploy, Production)

Perform every step below on the live production URL — not localhost:

- [ ] Landing page loads
- [ ] Sign up with a test email → redirected to onboarding
- [ ] Complete onboarding (select UAE region, Free plan) → redirected to dashboard
- [ ] Navigate to Models → Add Anthropic provider with real API key → test connection → "Connected"
- [ ] Navigate to Dashboard → Connect Agent → complete all 5 steps → agent appears in list
- [ ] Navigate to Datasets → Upload a 5-row JSON file → dataset appears with `v1` badge, row count = 5
- [ ] Navigate to Evaluations → Run Evaluation using uploaded dataset → progress bar appears → completes
- [ ] View results → scores shown as percentages, metric names human-readable
- [ ] Navigate to Security → click framework → New Assessment → complete → findings appear
- [ ] Logout → redirected to `/login` → try accessing `/dashboard` → redirected back to `/login`

---

## Known Stubs (Do Not Fail QA — Document Instead)

These pages exist but are not yet wired to a backend. They render correctly but have no real data. Document these in the test run notes — do not mark them as failures.

| Page | What's stubbed | When to fix |
|---|---|---|
| TeamPage | Invite button does nothing; members list is hardcoded to current user only | Sprint: Team Management |
| UsagePage | All usage counters hardcoded (Evaluations=0, Agents=1, etc.); no API call | Sprint: Usage Tracking |
| SchedulePage | Schedules stored in React state only; lost on page refresh; no backend persistence | Sprint: Scheduling Engine |
| MetricsConfigPage | Edit mode does not persist threshold changes to backend | Sprint: Metrics Config API |
| OverviewPage (`/dashboard/overview`) | Shows empty state hardcoded; "Connect Agent" button routes to wrong path (`/dashboard/agents/connect` vs `/dashboard/connect-agent`) | Sprint: Operations Dashboard |
| CurrentPlanPage | "Upgrade" buttons do nothing; plan is hardcoded to Free | Sprint: Billing Integration |

---

## Common Failure Modes — Check These First

These have already broken in this project:

| Failure | Gate that catches it |
|---|---|
| Vite PARSE_ERROR despite `tsc` passing (oxc stricter than tsc) | Gate 0: `vite build` |
| Encoding fix script corrupts emoji/block chars (`█░🛡`) | Gate 0: UTF-8 + mojibake scan |
| Smart/curly quote bytes in TSX cause parse error | Gate 0: mojibake scan |
| Field in TS interface missing from `*_to_dict()` | Gate 3: contract table |
| `failure_taxonomy` vs `failure_types` field name mismatch | Gate 3: historical contracts |
| `useState<any[]>` instead of typed state | Gate 1: TypeScript check |
| Endpoint missing `Depends(get_current_user)` | Gate 2: auth checklist |
| WebSocket `accept()` before auth validation | Gate 2: auth checklist |
| `decrypt_text()` not called before passing data to eval engine | Gate 2: encryption checklist |
| `db.commit()` without `db.refresh()` returns stale object | Gate 2: database checklist |
| Metric IDs shown instead of display names in results | Gate 4: EvaluationsPage results |
| Scores shown as `0.73` instead of `73%` | Gate 4: EvaluationsPage results |
| `last_evaluated_at` shows "undefined" instead of "Never" | Gate 4: AgentsRegistryPage |
| Mojibake in SecurityFrameworksPage icons (`ð¡`, `ð¤`) | Gate 4: SecurityFrameworksPage |
| Mojibake in SchedulePage controls (`â¸`, `Ã`, `ð`) | Gate 4: SchedulePage |
| `new Set<string>(() => {...}())` — IIFE in Set constructor invalid in oxc | Gate 0: `vite build` |
| N+1 DB queries in list endpoints | Gate 2: performance check |
| Background task launches before `db.commit()` (FK not found) | Gate 2: database checklist |
| OverviewPage "Connect Agent" routes to wrong path | Known stub — document |
| UsagePage shows 0/1 hardcoded data, not real values | Known stub — document |

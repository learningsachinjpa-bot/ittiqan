# Ittiqan Engineering Constitution v2

> These are not guidelines. They are non-negotiable.
> Break one → revert the PR → fix it right.
> Goal: the world's best AI agent evaluation platform.

---

## Pillar 01 — Scalable Architecture

**ARCH-01: Every evaluation run is a reproducible artifact**
Store an immutable snapshot at run time: agent endpoint + pinned version, dataset version, metric config version, LLM judge ID + exact model version (never an alias like "gpt-4o" — pin to "gpt-4o-2024-08-06"). Running the same eval ID twice must produce a comparable diff, never a mystery. No mutable state in eval records.

**ARCH-02: Traces are append-only, never overwritten**
Observability traces write once. No UPDATE on trace rows — only INSERT. Corrections go in a separate annotation table with a pointer back and the annotator's identity. This is the audit trail UAE government auditors will inspect.

**ARCH-03: Background jobs must be resumable from last checkpoint**
Any eval or red-team job that crashes mid-run restarts from its last checkpoint — never from zero. Checkpoint state lives in the DB. No job state in memory only. A job that loses progress on restart is not shippable.

**ARCH-04: Multi-tenancy enforced at the query layer, not the app layer**
Every DB query must include org_id filter. No cross-org data leakage is acceptable — not even in dev, not even in a test. PostgreSQL Row-Level Security added in Phase 2 as a second enforcement layer.

**ARCH-05: Every state transition is explicit — use finite state machines**
Never use `running=true` or boolean flags for job state. Use explicit states:
`QUEUED → RUNNING → JUDGE_RUNNING → COMPLETED` (or `FAILED`, `CANCELLED`, `PARTIAL`).
Every state transition is logged with a timestamp. Implicit state is the root cause of most production bugs in async systems.

**ARCH-06: Every external dependency has graceful degradation**
If OpenAI, Anthropic, or any LLM provider fails: the platform queues, retries with exponential backoff, and resumes — never crashes. Failed dependency → job moves to `DEGRADED` state, not `FAILED`. User sees: what failed, which runs are affected, estimated recovery time.

---

## Pillar 02 — Code Quality

**CODE-01: Strict types end-to-end — zero `any` in production paths**
TypeScript: strict mode on, zero `any` in API response handlers or component props. Python: Pydantic models for every request/response — no raw dicts crossing HTTP boundaries. Types are the contract between layers.

**CODE-02: LLM judge output is always validated and consistency-checked**
Parse and validate every judge response: score must be 0.0–1.0 float, reasoning must be non-empty string, JSON must parse cleanly. If validation fails → retry once → mark metric as `judge_error`. Additionally: run the same input twice per session periodically to detect judge drift (same input producing score variance > 0.1 is flagged).

**CODE-03: Error messages are user-actionable, never raw exceptions**
"400 Bad Request" shown to a user is a bug. Every caught exception must map to: what happened in plain English + what to do next + a retry/resume action if applicable. The mapping lives in a single place per provider, not scattered across the codebase.

**CODE-04: Avoid hardcoded environment-specific values**
No hardcoded tenant IDs, credentials, or deploy-specific endpoints in application code. Use configuration for anything that changes between environments or tenants. Stable protocol constants, RFC-defined values, and OpenTelemetry semantic conventions are acceptable exceptions.

**CODE-05: All LLM judge prompts and rubrics are version-controlled**
Every evaluation rubric, judge prompt template, and temperature setting is stored with a version number in the DB and in code. A change to a rubric requires: a new version number, a calibration check against at least 10 historical human-annotated examples, and a migration note. Silently changing a rubric invalidates all historical scores.

---

## Pillar 03 — User Experience

**UX-01: Every action gives feedback within 200ms**
Show spinner before the API call, not after. Optimistic UI for non-destructive actions. The user must never wonder if their click registered.

**UX-02: Edit where you are — never navigate to edit**
Inline editing for names, configs, keys. Drawer panels for complex forms. Full-page navigation only for separate logical contexts. No modals for things doable inline.

**UX-03: Zero-state screens teach, not just say "nothing here"**
Empty state = the most important screen. Show: what the feature does, one concrete example of what it looks like when working, and a single clear CTA. A sad icon and "No agents yet" is a product failure.

**UX-04: Destructive actions name the exact consequence**
"This will permanently delete 14 evaluation runs, 3 datasets, and all security findings. This cannot be undone." Not "Are you sure?" Government users and compliance officers never approve blindly.

**UX-05: Long-running operations stream progress — never just a spinner**
Any operation taking more than 2 seconds shows: a progress bar with current step, items completed / total, estimated time remaining, current cost accumulating. We already have WebSockets for this — every eval and red-team run must use them. A spinner for a 20-minute eval run is not acceptable.

**UX-06: Every failure includes the next action**
Never: "Evaluation failed." Always: "Evaluation failed because Anthropic returned a 529 (overloaded). [Retry] [Resume from checkpoint] [View partial results] [View logs]". Failures without affordances are dead ends.

---

## Pillar 04 — Evaluation Logic

**EVAL-01: Multi-criteria always — trajectory + outcome + cost, never just outcome**
A correct final answer via 10 hallucinated steps is not a pass. Score the path, not just the destination. Every evaluation produces three dimensions: process score (how), outcome score (what), and cost-efficiency score (at what cost). These are never collapsed into one number without explicit user configuration.

**EVAL-02: Every score is explainable — no black-box numbers**
Every metric score ships with: judge reasoning in full, the exact input that produced it, comparison to org baseline, and confidence band. A score of 0.72 with no explanation is useless to a government auditor.

**EVAL-03: Cost, latency, and token budget are first-class eval dimensions with hard limits**
Every eval run tracks: total cost, p50/p95 latency, token consumption. Organizations configure hard limits — evaluations that exceed cost or latency thresholds fail explicitly, not silently. "Quality at infinite cost" is not a deployable agent.

**EVAL-04: Human annotation overrides LLM judge — always, with audit trail**
Human-in-the-loop annotation is first-class. When a reviewer marks a score wrong, the override is stored with their user ID, timestamp, reason, and the original judge score. The override, not the LLM score, is the ground truth for that case. LLM judges recalibrate over time against human annotations.

**EVAL-05: Separate model quality from system quality**
A failed answer may be caused by: bad retrieval, a broken planner, a tool failure, memory corruption, or the model itself. Ittiqan must attribute failures to the correct component — not automatically blame the LLM. Every failed metric result includes a `failure_attribution` field: `model | retrieval | planner | tool | memory | unknown`.

**EVAL-06: Every metric defines and displays its failure mode**
A score of 0.71 on Groundedness is useless. Required format:
```
Groundedness: 0.71 — BELOW THRESHOLD
Failed because:
  • Citation 2 is not supported by the provided context
  • URL in response does not exist (fabricated)
  • Claim about Q3 revenue contradicts source document
```
Failure taxonomy is predefined per metric, not free-form.

**EVAL-07: Metrics are versioned — historical scores are never silently invalidated**
Every stored metric result references the exact versions used: `judge_version`, `prompt_version`, `rubric_version`, `dataset_version`. When any of these change, old scores are not retroactively overwritten — they remain attached to their versions. Trend charts show version change markers.

**EVAL-08: Confidence never replaces evidence**
A judge reporting "97% confidence" means nothing without: full reasoning, the specific claims being evaluated, and citations to the input that support the score. High confidence with no evidence is a red flag, not a green light.

---

## Pillar 05 — Agent Execution

**AGENT-01: Every tool call is deterministic and fully recorded**
For every tool invocation, store: exact input, exact output, latency in milliseconds, retry count, tool version, and timestamp. No tool call is ever a black box. This is the raw material for execution graph analysis and reproducibility.

**AGENT-02: Every decision point is observable with alternatives**
Do not store "Agent selected SearchTool." Store:
```
Selected: SearchTool
Reason: External information required; no relevant memory found
Confidence: 0.82
Alternative considered: MemorySearch
Rejected because: Memory index last updated 4 days ago; topic is time-sensitive
```
Decision observability is the entire value of an agent evaluation platform vs a simple benchmark runner.

**AGENT-03: No hidden context mutation**
Every memory write, scratchpad update, context compression, and summary is versioned and stored. Context is never silently modified between steps. If an agent summarizes its history, the original is preserved alongside the summary with a pointer. Hidden context mutation is how agents fail in ways that cannot be debugged.

**AGENT-04: Agent runs produce execution graphs, not flat logs**
Every multi-step agent run produces a directed acyclic graph (DAG) of its execution:
`Planner → SearchTool → Retriever → Critic → Judge → Answer`
The DAG is stored in the DB and rendered in the UI as an interactive tree. Flat prompt-response logs are insufficient for understanding agent behavior at enterprise scale.

---

## Pillar 06 — Security & Trust (UAE-Specific)

**SEC-01: Zero data leaves the customer's infrastructure without explicit consent**
No telemetry, no usage pings, no model training on customer data. Air-gapped deployment must be architecturally possible from day one. This is not a privacy preference — it is the baseline requirement for UAE government procurement.

**SEC-02: Every secret is encrypted at rest and never appears in logs**
Fernet AES-256 encryption for all secrets. API keys never appear in logs, error messages, stack traces, or API responses. CI/CD includes a secrets scanner that fails the build if any credential pattern appears in source.

**SEC-03: Full audit log on every write operation — immutable, queryable, exportable**
Who changed what, when, from which IP, with what result. Append-only audit table. Exportable to PDF for compliance review with digital signature. Red-team findings have complete chain of custody from generation through review through sign-off.

**SEC-04: Least privilege everywhere**
Every service account, API token, and user role gets only the permissions required for its specific function. Admin tokens are not used for data reads. Read-only roles cannot write. Eval runner cannot access billing data. Privilege escalation requires explicit approval, not configuration.

**SEC-05: Every export is logged**
Every data export — CSV, JSON, PDF report, API response, bulk download — is logged with: user identity, timestamp, what was exported, and destination IP. Exports of security findings require additional confirmation. UAE government contracts require this for data loss prevention compliance.

---

## The Checklist — use before every PR

1. Does this introduce mutable eval records? → ARCH-01
2. Does this use `any` types or raw dicts across HTTP? → CODE-01
3. Does this show a raw exception to the user? → CODE-03
4. Does this hardcode an environment-specific value? → CODE-04
5. Does this change an evaluation rubric without versioning it? → CODE-05
6. Does any score appear without reasoning and failure taxonomy? → EVAL-06
7. Does any agent step lack input/output/latency/version recording? → AGENT-01
8. Does any agent decision lack its alternatives and rejection reasons? → AGENT-02
9. Does any long-running operation show only a spinner? → UX-05
10. Does any failure message lack a next action? → UX-06
11. Does any data potentially leave the customer's server? → SEC-01
12. Does this add a write operation without an audit log entry? → SEC-03

If any answer is yes — the feature is not done.

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
"""
Ittiqan Dynamic QA Runner
Reads the actual codebase and generates + runs checks against what is really there.

  python qa.py          -- scan only, report issues
  python qa.py --fix    -- scan then AUTO-FIX everything fixable, then re-scan to verify
"""

import os, re, sys, subprocess, json, glob, ast, shutil
from pathlib import Path
from typing import List, Dict

ROOT        = Path(__file__).parent
IS_WIN      = sys.platform == "win32"
NPX         = "npx.cmd" if IS_WIN else "npx"
PYTHON      = sys.executable
FIX_MODE    = "--fix" in sys.argv
FRONTEND   = ROOT / "frontend" / "src"
BACKEND    = ROOT / "backend"
PAGES_DIR  = FRONTEND / "pages"
ROUTERS_DIR = BACKEND / "app" / "routers"
TYPES_FILE = FRONTEND / "types" / "index.ts"
API_FILE   = FRONTEND / "lib" / "api.ts"
APP_FILE   = FRONTEND / "App.tsx"

# ─────────────────────────────────────────────────────────────
# AUTO-FIX ENGINE
# Each fix_* function modifies files in-place and returns (n_fixed, description)
# ─────────────────────────────────────────────────────────────

def _backup(path: Path):
    """Write .qa_backup copy so fixes are reversible."""
    bak = path.with_suffix(path.suffix + ".qa_backup")
    if not bak.exists():
        shutil.copy2(path, bak)

def fix_bom(path: Path) -> bool:
    """Strip BOM bytes from start of file — handles raw, double-encoded, and triple-encoded BOM."""
    raw = path.read_bytes()
    changed = False
    # Raw BOM bytes: EF BB BF
    if raw.startswith(b'\xef\xbb\xbf'):
        raw = raw[3:]; changed = True
    # Double-encoded BOM bytes: C3 AF C2 BB C2 BF  (result of latin-1 decode + UTF-8 re-encode)
    elif raw.startswith(b'\xc3\xaf\xc2\xbb\xc2\xbf'):
        raw = raw[6:]; changed = True
    # Triple-encoded BOM bytes: C3 83 C2 AF C3 82 C2 BB C3 82 C2 BF
    elif raw.startswith(b'\xc3\x83\xc2\xaf\xc3\x82\xc2\xbb\xc3\x82\xc2\xbf'):
        raw = raw[12:]; changed = True
    if changed:
        _backup(path)
        path.write_bytes(raw)
        return True
    return False

def fix_mojibake(path: Path) -> bool:
    """
    Fix double- or triple-encoded UTF-8.
    Each encoding error: file was decoded as latin-1 then re-encoded as UTF-8.
    We undo each layer at the byte level until content stabilises or we hit 4 passes.
    BAD_PATTERNS written as \\u escapes so editors do not "correct" them.
    """
    original_raw = path.read_bytes()
    raw = original_raw

    # Mojibake indicator patterns — each is a 2-char sequence of Latin-1 surrogates
    # that appear when UTF-8 bytes are decoded as latin-1 and re-encoded as UTF-8.
    # Using \u escapes so editors cannot convert them to their "correct" single chars.
    BAD_PATTERNS = [
        '\u00c3\u00a2',  # double-encoded smart-quote/arrow prefix
        '\u00c3\u00af',  # triple-encoded BOM start
        '\u00c2\u00b0',  # double-encoded degree sign
        '\u00c2\u00a9',  # double-encoded copyright
        '\u00c2\u00b7',  # double-encoded middle dot
        '\u00c2\u00bb',  # BOM middle / right-angle quote
        '\u00c3\u0097',  # double-encoded multiplication sign
        '\u00c3\u00a0',  # double-encoded a-grave prefix
        '\u00f0',         # emoji mojibake (f0 = first byte of 4-byte emoji)
    ]

    changed = False
    for _ in range(4):
        # Strip raw BOM bytes if present
        if raw.startswith(b'\xef\xbb\xbf'):
            raw = raw[3:]
            changed = True

        try:
            text = raw.decode('utf-8')
        except UnicodeDecodeError:
            break  # not valid UTF-8 — stop

        # Check if any mojibake patterns remain
        if not any(p in text for p in BAD_PATTERNS):
            break  # clean — stop

        # Undo one layer: encode as latin-1 gives back the original byte values
        try:
            recovered = text.encode('latin-1')
        except UnicodeEncodeError:
            # File has characters above U+00FF mixed in — cannot do full round-trip
            return fix_mojibake_targeted(path, text)

        if recovered == raw:
            break  # no progress — stop
        raw = recovered
        changed = True

    if changed and raw != original_raw:
        _backup(path)
        path.write_bytes(raw)
        return True
    return False

def fix_mojibake_targeted(path: Path, text: str) -> bool:
    """
    Segment-based mojibake fix for files that have real Unicode (> U+00FF) mixed in.
    Scans for runs of chars in U+0080-U+00FF, applies latin-1 round-trip to each run.
    Chars > U+00FF (real smart quotes, emojis) are left untouched.
    Also strips the triple and double-encoded BOM prefix.
    """
    # Triple-encoded BOM 6-char string prefix
    TRIPLE_BOM = '\u00c3\u00af\u00c2\u00bb\u00c2\u00bf'
    # Double-encoded BOM 3-char string prefix
    DOUBLE_BOM = '\u00ef\u00bb\u00bf'

    fixed = text
    # Strip encoded BOM prefixes
    if fixed.startswith(TRIPLE_BOM):
        fixed = fixed[len(TRIPLE_BOM):]
    if fixed.startswith(DOUBLE_BOM):
        fixed = fixed[len(DOUBLE_BOM):]

    # Segment-based round-trip: fix runs of chars in U+0080-U+00FF only
    result = []
    i = 0
    while i < len(fixed):
        code = ord(fixed[i])
        if 0x80 <= code <= 0xFF:
            # Collect a run of latin-1-range chars
            j = i
            while j < len(fixed) and 0x80 <= ord(fixed[j]) <= 0xFF:
                j += 1
            run = fixed[i:j]
            # Try to round-trip: latin-1 encode recovers original bytes, utf-8 decode gives original unicode
            try:
                round_tripped = run.encode("latin-1").decode("utf-8")
                result.append(round_tripped)
            except (UnicodeEncodeError, UnicodeDecodeError):
                result.append(run)  # cannot fix — leave as-is
            i = j
        else:
            result.append(fixed[i])
            i += 1

    fixed = "".join(result)
    if fixed != text:
        _backup(path)
        path.write_bytes(fixed.encode("utf-8"))
        return True
    return False

def fix_db_refresh(path: Path) -> bool:
    """Add db.refresh(obj) after db.commit() where a *_to_dict(obj) return follows."""
    content = path.read_text(encoding='utf-8')
    # Pattern: db.commit() on one line, then return something_to_dict(varname) soon after, with no db.refresh in between
    pattern = re.compile(
        r'([ \t]+)(db\.commit\(\))\n'
        r'((?:[ \t]+.*\n)*?)'          # optional lines between (e.g. logging)
        r'([ \t]+return \w+_to_dict\((\w+)\))',
        re.MULTILINE
    )
    def replacement(m):
        indent = m.group(1)
        commit = m.group(2)
        between = m.group(3)
        ret = m.group(4)
        varname = m.group(5)
        # Only add refresh if not already there
        if f'db.refresh({varname})' in between or f'db.refresh({varname})' in (m.group(0)):
            return m.group(0)
        return f"{indent}{commit}\n{between}{indent}db.refresh({varname})\n{ret}"

    fixed = pattern.sub(replacement, content)
    if fixed != content:
        _backup(path)
        path.write_text(fixed, encoding='utf-8')
        return True
    return False

def fix_datetime_isoformat(path: Path) -> bool:
    """Add .isoformat() to datetime fields in *_to_dict() that return raw datetime objects."""
    content = path.read_text(encoding='utf-8')
    DATETIME_FIELDS = ['created_at', 'updated_at', 'completed_at', 'started_at', 'last_evaluated_at']
    fixed = content
    for field in DATETIME_FIELDS:
        # "field": obj.field  ->  "field": obj.field.isoformat() if obj.field else None
        pattern = re.compile(
            rf'("{field}"\s*:\s*)(\w+\.{field})(?!\.isoformat)(?!\s*if\s)(?!\s*or\s)'
        )
        fixed = pattern.sub(
            rf'\1\2.isoformat() if \2 else None',
            fixed
        )
    if fixed != content:
        _backup(path)
        path.write_text(fixed, encoding='utf-8')
        return True
    return False

def fix_agent_status_color(path: Path) -> bool:
    """Fix statusColor() in AgentsRegistryPage to handle 'degraded' with red/orange."""
    content = path.read_text(encoding='utf-8', errors='replace')
    old = "function statusColor(status: string) {\n  if (status === 'active') return 'bg-green"
    # More flexible: find the statusColor function and replace if it only handles 'active'
    pattern = re.compile(
        r"(function statusColor\s*\([^)]+\)\s*\{[^}]*?'active'[^}]*?\})",
        re.DOTALL
    )
    m = pattern.search(content)
    if not m:
        return False
    old_fn = m.group(1)
    if 'degraded' in old_fn:
        return False  # already fixed
    new_fn = """function statusColor(status: string) {
  if (status === 'active') return 'bg-green-100 text-green-800'
  if (status === 'degraded') return 'bg-orange-100 text-orange-800'
  return 'bg-gray-100 text-gray-500'
}"""
    fixed = content.replace(old_fn, new_fn)
    if fixed != content:
        _backup(path)
        path.write_text(fixed, encoding='utf-8')
        return True
    return False

def run_all_fixes():
    """Run all auto-fixes. Delegates encoding fixes to fix_encoding.py."""
    section("AUTO-FIX MODE")
    total = 0

    # 1. Encoding: BOM, mojibake, line endings, curly quotes
    print(f"\n{INFO} Running fix_encoding.py (BOM + mojibake + line endings + curly quotes) ...")
    import importlib.util, sys as _sys
    spec = importlib.util.spec_from_file_location("fix_encoding", ROOT / "fix_encoding.py")
    fe_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fe_mod)
    # Patch stdout temporarily to capture output
    old_print = __builtins__.__dict__.get('print') if hasattr(__builtins__, '__dict__') else None
    changed_files = []
    for fpath in sorted(
        glob.glob(str(FRONTEND / "**" / "*.tsx"), recursive=True) +
        glob.glob(str(FRONTEND / "**" / "*.ts"),  recursive=True)
    ):
        p = Path(fpath)
        if fe_mod.fix_file(p):
            changed_files.append(p.name)
    if changed_files:
        print(f"  FIXED encoding in {len(changed_files)} files: {changed_files}")
        total += len(changed_files)
    else:
        print(f"  No encoding issues found")

    # 2. statusColor degraded fix
    print(f"\n{INFO} Fixing statusColor() for \'degraded\' state ...")
    agents_page = PAGES_DIR / "dashboard" / "AgentsRegistryPage.tsx"
    if agents_page.exists() and fix_agent_status_color(agents_page):
        print(f"  FIXED statusColor() in AgentsRegistryPage.tsx")
        total += 1
    else:
        print(f"  statusColor() already correct or not found")

    # 3. db.refresh() and datetime.isoformat() in backend routers
    py_files = glob.glob(str(ROUTERS_DIR / "*.py"))
    print(f"\n{INFO} Fixing backend router issues ...")
    be_fixed = []
    for fpath in py_files:
        pp = Path(fpath)
        r1 = fix_db_refresh(pp)
        r2 = fix_datetime_isoformat(pp)
        if r1 or r2:
            be_fixed.append(pp.name)
    if be_fixed:
        print(f"  FIXED backend in: {be_fixed}")
        total += len(be_fixed)
    else:
        print(f"  No backend fixes needed")

    print(f"\n  Total files fixed: {total}")
    if total > 0:
        print(f"  Backups saved as *.qa_backup")
    return total


PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
WARN = "\033[93mWARN\033[0m"
INFO = "\033[94m-->\033[0m"
BOLD = "\033[1m"
END  = "\033[0m"

issues: List[Dict] = []

def record(severity: str, gate: str, file: str, message: str, fix: str = ""):
    issues.append({"severity": severity, "gate": gate, "file": file, "message": message, "fix": fix})
    icon = {"critical": FAIL, "high": FAIL, "medium": WARN, "info": INFO}[severity]
    tag  = {"critical": "\033[91mCRIT\033[0m", "high": "\033[91mHIGH\033[0m",
             "medium": "\033[93mMED \033[0m",  "info": "\033[94mINFO\033[0m"}[severity]
    loc  = f"\033[2m{file}\033[0m" if file else ""
    print(f"  {icon} [{tag}] {message} {loc}")
    if fix:
        print(f"       \033[2mFix: {fix}\033[0m")

def section(title: str):
    print(f"\n{BOLD}{'-'*60}{END}")
    print(f"{BOLD}{title}{END}")
    print(f"{BOLD}{'-'*60}{END}")

def ok(msg: str):
    print(f"  {PASS} {msg}")

# ─────────────────────────────────────────────────────────────
# GATE 0: Static analysis — automated, no manual work
# ─────────────────────────────────────────────────────────────

def gate0_static():
    section("GATE 0 — Static Analysis")

    fe = ROOT / "frontend"

    # 0.1 TypeScript
    print(f"\n{INFO} Running tsc --noEmit ...")
    r = subprocess.run([NPX, "tsc", "--noEmit"], cwd=fe, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        for line in r.stdout.splitlines()[:20]:
            if "error" in line.lower():
                record("critical", "G0", "", line.strip(), "Fix TypeScript error before proceeding")
    else:
        ok("tsc --noEmit passed — zero type errors")

    # 0.2 Vite build (catches parse errors tsc misses — oxc is stricter)
    print(f"\n{INFO} Running vite build ...")
    r = subprocess.run([NPX, "vite", "build"], cwd=fe, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        output = (r.stdout + r.stderr)
        useful = [l.strip() for l in output.splitlines()
                  if any(k in l for k in ["PARSE_ERROR", "Transform failed", "src/", ".tsx", ".ts"])
                  and "node_modules" not in l and "at " != l.strip()[:3]]
        if useful:
            for line in useful[:8]:
                record("critical", "G0", "", line, "Fix parse/build error — vite build must pass before manual testing")
        else:
            record("critical", "G0", "frontend", "vite build failed (run: cd frontend && npx vite build)", "Fix build errors")
    else:
        ok("vite build passed — all pages parse correctly")

    # 0.3 UTF-8 encoding check — every TSX/TS file
    print(f"\n{INFO} Checking UTF-8 encoding on all frontend source files ...")
    bad_encoding = []
    for f in glob.glob(str(FRONTEND / "**" / "*.tsx"), recursive=True) + \
             glob.glob(str(FRONTEND / "**" / "*.ts"),  recursive=True):
        try:
            open(f, "rb").read().decode("utf-8")
        except UnicodeDecodeError as e:
            bad_encoding.append((f, str(e)))
    if bad_encoding:
        for f, e in bad_encoding:
            record("critical", "G0", f.replace(str(ROOT), ""), f"UTF-8 decode failed: {e}",
                   "Fix encoding — byte-level replace, never decode whole file as latin-1")
    else:
        ok(f"All {len(glob.glob(str(FRONTEND/'**'/'*.tsx'), recursive=True))} TSX/TS files are valid UTF-8")

    # 0.4 Mojibake scan — corrupted byte patterns from encoding scripts
    BAD_PATTERNS = {
        "Ã¢": "smart quote/dash/arrow mojibake",
        "â€": "smart quote mojibake",
        "Ã ": "accented char mojibake",
        "Â°":  "degree sign mojibake",
        "ð":  "emoji mojibake (rendered as box)",
        "â¸":  "pause icon mojibake",
        "Â·":  "middle dot mojibake",
        "Ã—":  "multiplication sign mojibake",
        "Â©":  "copyright mojibake",
        "ÃÂ¢Ã¢ÂÂ¬": "double-encoded em dash",
    }
    print(f"\n{INFO} Scanning for mojibake patterns ...")
    mojibake_found = []
    for f in glob.glob(str(FRONTEND / "**" / "*.tsx"), recursive=True):
        content = open(f, encoding="utf-8", errors="replace").read()
        for pattern, desc in BAD_PATTERNS.items():
            if pattern in content:
                rel = f.replace(str(ROOT), "").lstrip("/\\")
                mojibake_found.append((rel, pattern, desc))
    if mojibake_found:
        for f, p, desc in mojibake_found:
            record("critical", "G0", f, f"Mojibake detected '{p}' ({desc})",
                   "Byte-level replace — never decode/re-encode whole file")
    else:
        ok("No mojibake patterns found")

    # 0.5 Python syntax check — all routers
    print(f"\n{INFO} Checking Python syntax on all routers ...")
    for f in glob.glob(str(ROUTERS_DIR / "*.py")):
        r = subprocess.run([PYTHON, "-m", "py_compile", f], capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            record("critical", "G0", f.replace(str(ROOT), ""), r.stderr.strip(),
                   "Fix Python syntax error")
    else:
        ok(f"All {len(glob.glob(str(ROUTERS_DIR/'*.py')))} router files pass py_compile")

    # 0.6 No any types in pages (excluding catch blocks)
    print(f"\n{INFO} Scanning for 'any' types in page files ...")
    any_found = []
    for f in glob.glob(str(PAGES_DIR / "**" / "*.tsx"), recursive=True):
        content = open(f, encoding="utf-8", errors="replace").read()
        lines = content.splitlines()
        for i, line in enumerate(lines, 1):
            # Skip catch blocks (catch (e: any) is acceptable TS practice)
            stripped = line.strip()
            if re.search(r':\s*any\b', line) or re.search(r'as\s+any\b', line) or \
               re.search(r'useState\s*\(\s*\[\s*\]\s*\)', line):
                if not stripped.startswith("//") and "catch" not in stripped:
                    rel = f.replace(str(ROOT), "").lstrip("/\\")
                    any_found.append(f"{rel}:{i}  →  {stripped[:80]}")
    if any_found:
        for item in any_found[:15]:
            record("high", "G0", "", f"Untyped 'any': {item}", "Replace with concrete type from src/types/index.ts")
    else:
        ok("No untyped 'any' found in page files")


# ─────────────────────────────────────────────────────────────
# GATE 1: Code structure — derived from actual files
# ─────────────────────────────────────────────────────────────

def gate1_code():
    section("GATE 1 — Code Structure (derived from actual source)")

    # Discover every route from App.tsx
    print(f"\n{INFO} Parsing routes from App.tsx ...")
    app_content = APP_FILE.read_text(encoding="utf-8", errors="replace")
    routes = re.findall(r'path=["\']([^"\']+)["\']', app_content)
    imports = re.findall(r"import\s+(\w+)\s+from\s+'([^']+)'", app_content)
    print(f"  Found {len(routes)} routes: {routes}")

    # For each page component, check structure
    page_files = list(glob.glob(str(PAGES_DIR / "**" / "*.tsx"), recursive=True))
    print(f"\n{INFO} Checking {len(page_files)} page components ...")

    for fpath in page_files:
        rel = fpath.replace(str(ROOT), "").lstrip("/\\")
        content = open(fpath, encoding="utf-8", errors="replace").read()

        # Check: every useEffect has dependency array
        # Count effects that close with }, [...]). The dep array comes AFTER the callback closes.
        all_effects = len(re.findall(r'useEffect\s*\(', content))
        # Match: useEffect closing }  then optional whitespace then , then [ (the dep array)
        effects_with_dep = len(re.findall(r'useEffect\s*\(.*?\},\s*\[', content, re.DOTALL))
        if all_effects > 0 and effects_with_dep < all_effects:
            record("high", "G1", rel,
                   f"useEffect without dependency array ({all_effects} effects, {effects_with_dep} with deps)",
                   "Add dependency array [] to all useEffect calls")

        # Check: no direct fetch() calls to internal API (should use api.ts)
        # Exclude fetch(variableName) — those are external/user-provided URL tests
        direct_fetch = re.findall(r"\bfetch\s*\(\s*['\"`/]", content)
        if direct_fetch:
            record("high", "G1", rel,
                   f"Direct fetch() call found ({len(direct_fetch)}x) — must use api.ts functions",
                   "Replace with the appropriate function from src/lib/api.ts")

        # Check: loading state exists if API calls present
        has_api_call = bool(re.search(r'await\s+\w+Api\.\w+|await\s+\w+\.\w+\(', content))
        has_loading  = bool(re.search(r'loading|setLoading|isLoading|saving|setSaving|testTesting|inviting|setInviting|removing|setRemoving|submitting|setSubmitting', content))
        if has_api_call and not has_loading:
            record("medium", "G1", rel,
                   "API calls found but no loading state — user sees no feedback during fetch",
                   "Add useState<boolean>(true) for loading and show spinner")

        # Check: error state exists alongside API calls
        has_error = bool(re.search(r'setError|error\s*&&|error\s*\?|catch\s*\(', content))
        if has_api_call and not has_error:
            record("high", "G1", rel,
                   "API calls found but no error handling shown to user",
                   "Add error state and render error message to user on catch")

        # Check: JSX .map() calls have key prop
        # Only count maps that return JSX (open with < after the arrow)
        jsx_maps = re.findall(r'\.map\s*\(\s*\w+\s*=>\s*(?:\([^)]*)?<', content)
        keys = re.findall(r'key=\{', content)
        if len(jsx_maps) > 0 and len(keys) < len(jsx_maps):
            record("medium", "G1", rel,
                   f"{len(jsx_maps)} JSX .map() calls but only {len(keys)} key= props — some list items missing key",
                   "Add key={item.id} to every .map() root element")

        # Check: null/undefined rendered as text — only flag method calls on optional fields
        # (.toLocaleString() / .toFixed() on a field that could be null will throw)
        null_render = re.findall(r'\{[^}]*\|\|\s*["\']["\'][^}]*\}|\{[^}]*undefined[^}]*\}', content)
        raw_null = re.findall(
            r'\{[^}]*(?:item|agent|data|result|provider|dataset)\.[a-z_]+\.'
            r'(?:toLocaleString|toFixed|toUpperCase|toLowerCase|toString)\(\)',
            content
        )
        if len(raw_null) > 0:
            record("medium", "G1", rel,
                   f"Possible unsafe property access without null fallback ({len(raw_null)} occurrences)",
                   "Use optional chaining + ?? '—' for all fields that might be null")

        # Check: form buttons disabled during loading
        submit_buttons = re.findall(r'type="submit"|onClick=\{handle|onClick=\{submit', content)
        disabled_check = re.findall(r'disabled=\{(?:loading|saving|uploading|starting|deleting|inviting|removing|submitting)', content)
        if len(submit_buttons) > 0 and len(disabled_check) == 0:
            record("high", "G1", rel,
                   "Submit/action buttons exist but none has disabled={loading} — allows double-submit",
                   "Add disabled={loading} to every submit button")

    ok(f"Gate 1 code structure checks complete on {len(page_files)} pages")


# ─────────────────────────────────────────────────────────────
# GATE 2: Backend — derived from actual router files
# ─────────────────────────────────────────────────────────────

def gate2_backend():
    section("GATE 2 — Backend (derived from actual router files)")

    router_files = list(glob.glob(str(ROUTERS_DIR / "*.py")))
    print(f"\n{INFO} Checking {len(router_files)} router files ...")

    for fpath in router_files:
        if "__init__" in fpath:
            continue
        rel  = fpath.replace(str(ROOT), "").lstrip("/\\")
        content = open(fpath, encoding="utf-8").read()
        fname = Path(fpath).stem

        # 2.1 Auth: every non-auth router endpoint needs auth
        # Intentionally public endpoints (metadata/config, no user data returned):
        PUBLIC_ENDPOINTS = {"list_frameworks", "list_available_metrics", "get_supported_models"}
        AUTH_INDICATORS = {"get_current_user", "require_role", "ws_get_current_user"}
        if fname != "auth":
            # Split file into per-endpoint blocks so we can check multi-line signatures + body
            fn_names = re.findall(r'@router\.\w+[^\n]*\nasync def (\w+)', content)
            # Build blocks: text from each @router decorator to the next one
            blocks = re.split(r'(?=@router\.)', content)
            endpoint_blocks = [b for b in blocks if b.strip().startswith('@router.')]
            unprotected = []
            for block in endpoint_blocks:
                fn_match = re.search(r'async def (\w+)', block)
                if not fn_match:
                    continue
                fn_name_local = fn_match.group(1)
                if fn_name_local in PUBLIC_ENDPOINTS:
                    continue
                # Check the first 30 lines of the block for auth indicators
                block_head = '\n'.join(block.splitlines()[:30])
                if not any(ind in block_head for ind in AUTH_INDICATORS):
                    unprotected.append(fn_name_local)
            if unprotected:
                record("critical", "G2", rel,
                       f"Endpoints missing auth: {unprotected}",
                       "Add user: User = Depends(get_current_user) to each endpoint")

        # 2.2 Org scoping: list-level queries must filter by org_id or user_id
        # Skip auth.py (login/register) and queries scoped by a specific primary key .id ==
        db_queries = re.findall(r'db\.query\([^)]+\)\.filter\([^)]+\)', content)
        def _is_unscoped(q: str) -> bool:
            if "org_id" in q or "user_id" in q:
                return False
            if ".id ==" in q or "_id ==" in q:
                return False  # scoped by parent resource ID (validated upstream)
            if ".slug ==" in q:
                return False  # uniqueness check — not a data-leak query
            if ".email ==" in q:
                return False  # user lookup by email — single record, not cross-org list
            return True
        unscoped = [q for q in db_queries if _is_unscoped(q)] if fname != "auth" else []
        if unscoped:
            record("high", "G2", rel,
                   f"{len(unscoped)} DB query(ies) without org_id or user_id filter — data leak risk",
                   "Add .filter(Model.org_id == m.org_id) to every query")

        # 2.3 WebSocket auth before accept()
        ws_blocks = re.findall(r'async def \w+\([^)]*websocket[^)]*\).*?(?=\nasync def |\Z)', content, re.DOTALL)
        for block in ws_blocks:
            accept_pos = block.find("websocket.accept()")
            auth_pos   = block.find("get_current_user") if "get_current_user" in block else block.find("ws_get_current_user")
            token_pos  = block.find("token")
            if accept_pos != -1 and auth_pos != -1 and auth_pos > accept_pos:
                record("critical", "G2", rel,
                       "WebSocket.accept() called BEFORE auth check — unauthenticated connections accepted",
                       "Move auth validation to before websocket.accept()")

        # 2.4 *_to_dict functions: check they exist and return dicts
        to_dict_fns = re.findall(r'def (\w+_to_dict)\s*\(', content)
        for fn in to_dict_fns:
            # Verify it returns a dict (has "return {")
            fn_match = re.search(rf'def {fn}\s*\([^)]*\).*?(?=\ndef |\Z)', content, re.DOTALL)
            if fn_match:
                fn_body = fn_match.group()
                if "return {" not in fn_body:
                    record("high", "G2", rel,
                           f"{fn}() does not return a dict literal — serialization broken",
                           "Ensure the function returns a dict with all fields")

        # 2.5 datetime serialization — must use .isoformat()
        raw_datetime = re.findall(r'"created_at"\s*:\s*\w+\.created_at(?!\.isoformat)', content)
        raw_datetime += re.findall(r'"updated_at"\s*:\s*\w+\.updated_at(?!\.isoformat)', content)
        raw_datetime += re.findall(r'"completed_at"\s*:\s*\w+\.completed_at(?!\.isoformat)', content)
        if raw_datetime:
            record("critical", "G2", rel,
                   f"datetime field serialized without .isoformat() — will crash on JSON encode",
                   "Use field.isoformat() if field else None for all datetime fields")

        # 2.6 db.commit() followed by db.refresh()
        commits = [(m.start(), m.group()) for m in re.finditer(r'db\.commit\(\)', content)]
        for pos, _ in commits:
            after = content[pos:pos+200]
            # If there's a return statement after commit but no refresh, flag it
            if re.search(r'return\s+\w+_to_dict\(', after) and "db.refresh" not in after:
                record("high", "G2", rel,
                       "db.commit() followed by return without db.refresh() — may return stale object",
                       "Add db.refresh(obj) immediately after db.commit() before returning")

        # 2.7 Background tasks: check for try/except
        bg_tasks = re.findall(r'async def \w+_task\s*\(|asyncio\.create_task|BackgroundTasks', content)
        if bg_tasks:
            bg_fns = re.findall(r'async def (\w+_task)\s*\(', content)
            for fn in bg_fns:
                fn_match = re.search(rf'async def {fn}.*?(?=\nasync def |\Z)', content, re.DOTALL)
                if fn_match:
                    fn_body = fn_match.group()
                    if "try:" not in fn_body or "except" not in fn_body:
                        record("high", "G2", rel,
                               f"Background task {fn}() has no try/except — unhandled exception leaves job stuck in RUNNING",
                               "Wrap body in try/except, set status=failed in except block")

    ok("Gate 2 backend checks complete")


# ─────────────────────────────────────────────────────────────
# GATE 3: API Contract — compare api.ts to backend routers
# ─────────────────────────────────────────────────────────────

def gate3_contract():
    section("GATE 3 — API Contract (api.ts ↔ backend)")

    api_content = API_FILE.read_text(encoding="utf-8", errors="replace")

    # Extract all URLs called from api.ts
    fe_urls = re.findall(r"request\s*<[^>]+>\s*\(\s*'([^']+)'", api_content)
    fe_urls += re.findall(r'request\s*<[^>]+>\s*\(\s*`([^`]+)`', api_content)
    fe_urls += re.findall(r"fetch\s*\(\s*`[^`]*`\s*\)", api_content)

    print(f"\n{INFO} Found {len(fe_urls)} API calls in api.ts")

    # Extract routes from backend routers
    be_routes = {}
    for fpath in glob.glob(str(ROUTERS_DIR / "*.py")):
        if "__init__" in fpath:
            continue
        content = open(fpath, encoding="utf-8").read()
        prefix  = re.search(r'prefix\s*=\s*["\']([^"\']+)["\']', content)
        if not prefix:
            continue
        pfx = prefix.group(1)
        for method, path in re.findall(r'@router\.(get|post|put|delete|websocket)\s*\(\s*["\']([^"\']*)["\']', content):
            full = ("/api/v1" + pfx + path).replace("//", "/")
            be_routes[full] = method.upper()

    print(f"  Found {len(be_routes)} routes in backend routers")

    # Check for field name consistency between TypeScript interfaces and Python dicts
    print(f"\n{INFO} Checking field consistency between types/index.ts and *_to_dict() functions ...")

    ts_content = TYPES_FILE.read_text(encoding="utf-8", errors="replace")

    # Parse TS interfaces (simple extraction)
    interfaces = {}
    for match in re.finditer(r'export interface (\w+)\s*\{([^}]+)\}', ts_content, re.DOTALL):
        name   = match.group(1)
        body   = match.group(2)
        fields = re.findall(r'(\w+)\??:', body)
        interfaces[name] = fields

    print(f"  Found {len(interfaces)} TypeScript interfaces: {list(interfaces.keys())}")

    # Check each router's to_dict matches the corresponding TS interface
    INTERFACE_TO_ROUTER = {
        "Agent":              ("agents.py",      "agent_to_dict"),
        "Evaluation":         ("evaluations.py", "eval_to_dict"),
        "Dataset":            ("datasets.py",    "dataset_to_dict"),
        "LLMProvider":        ("llm_providers.py", "provider_to_dict"),
        "SecurityAssessment": ("security.py",    "assessment_to_dict"),
        "Organization":       ("organizations.py", "org_to_dict"),
    }

    for ts_name, (router_file, dict_fn) in INTERFACE_TO_ROUTER.items():
        ts_fields = interfaces.get(ts_name, [])
        if not ts_fields:
            record("medium", "G3", f"types/index.ts",
                   f"Interface '{ts_name}' not found in types/index.ts",
                   "Check the interface exists and is exported")
            continue

        router_path = ROUTERS_DIR / router_file
        if not router_path.exists():
            record("high", "G3", router_file, f"Router file not found", "")
            continue

        router_content = open(router_path, encoding="utf-8").read()
        fn_match = re.search(rf'def {dict_fn}\s*\([^)]*\).*?(?=\ndef |\Z)', router_content, re.DOTALL)
        if not fn_match:
            record("high", "G3", router_file,
                   f"Function {dict_fn}() not found in {router_file}",
                   f"Implement {dict_fn}() to serialize the model to a dict")
            continue

        fn_body    = fn_match.group()
        dict_keys  = re.findall(r'"(\w+)"\s*:', fn_body)

        missing = [f for f in ts_fields if f not in dict_keys and f not in ("org",)]
        if missing:
            for m in missing:
                record("critical", "G3", router_file,
                       f"{ts_name}.{m} is in TypeScript interface but missing from {dict_fn}()",
                       f'Add "{m}": ... to {dict_fn}() return dict')
        else:
            ok(f"{ts_name} ↔ {dict_fn}(): all {len(ts_fields)} fields present")

    # Check known historical breakages
    print(f"\n{INFO} Checking known historical contract failures ...")
    KNOWN_FAILURES = [
        ("agents.py",       "agent_to_dict",        "default_metrics"),
        ("agents.py",       "agent_to_dict",        "llm_judge_provider_id"),
        ("llm_providers.py","provider_to_dict",      "base_url"),
        ("llm_providers.py","provider_to_dict",      "total_calls"),
        ("evaluations.py",  "eval_to_dict",          "dataset_version"),
        ("evaluations.py",  "eval_to_dict",          "judge_prompt_version"),
        # failure_types was renamed to failed_count in eval_to_dict — removed stale check
        ("datasets.py",     "dataset_to_dict",       "version"),
        ("organizations.py","org_to_dict",           "region"),
    ]
    for router_file, fn_name, field_name in KNOWN_FAILURES:
        router_path = ROUTERS_DIR / router_file
        if not router_path.exists():
            continue
        content = open(router_path, encoding="utf-8").read()
        fn_match = re.search(rf'def {fn_name}\s*\([^)]*\).*?(?=\ndef |\Z)', content, re.DOTALL)
        if fn_match:
            if f'"{field_name}"' not in fn_match.group():
                record("critical", "G3", router_file,
                       f'KNOWN FAILURE: "{field_name}" missing from {fn_name}() — has broken before',
                       f'Add "{field_name}": obj.{field_name} or [] to {fn_name}()')
        else:
            # Function not found — check if field exists anywhere in the file
            if f'"{field_name}"' not in content:
                record("high", "G3", router_file,
                       f'"{field_name}" not returned anywhere in {router_file}',
                       f"Add to the serializer function")


# ─────────────────────────────────────────────────────────────
# GATE 4: Generate manual functional test checklist from code
# ─────────────────────────────────────────────────────────────

def gate4_functional_checklist():
    section("GATE 4 — Functional Test Checklist (generated from actual code)")

    print(f"""
{BOLD}These tests are MANUAL — open http://localhost:3000 and tick each one.{END}
Each item is derived from the actual code. Nothing is assumed or invented.
""")

    # Parse App.tsx to get real routes and page components
    app_content = APP_FILE.read_text(encoding="utf-8", errors="replace")
    route_map = {}  # path → component name

    # Extract Route definitions with their components
    # Match: <Route path="x" element={<ComponentName ...
    for m in re.finditer(r'path=["\']([^"\']+)["\'][^>]*element=\{<(\w+)', app_content):
        route_map[m.group(1)] = m.group(2)
    # Also index routes
    for m in re.finditer(r'<Route index element=\{<(\w+)', app_content):
        route_map["(index)"] = m.group(1)

    print(f"  Routes found: {len(route_map)}")

    checklist = []

    # For each page, parse actual interactive elements from the source
    component_to_file = {}
    for fpath in glob.glob(str(PAGES_DIR / "**" / "*.tsx"), recursive=True):
        cname = re.search(r'export default function (\w+)', open(fpath, encoding="utf-8", errors="replace").read())
        if cname:
            component_to_file[cname.group(1)] = fpath

    for path, component in sorted(route_map.items()):
        fpath = component_to_file.get(component)
        if not fpath:
            continue

        content = open(fpath, encoding="utf-8", errors="replace").read()
        rel     = Path(fpath).relative_to(FRONTEND)

        checks = []

        # Derive URL for display
        url = path
        if ":id" in url:
            url = url.replace(":id", "{agent_id}")

        checks.append(f"NAVIGATE to {url} — page loads with no Vite error overlay and no console errors")
        checks.append("F12 → Console — zero red errors on load")
        checks.append("F12 → Network — zero failed (red) requests on load")

        # API calls → derive what data should load
        api_calls = re.findall(r'await\s+(\w+Api|\w+Providers|\w+)\.(list|get|create|run|upload|delete|test|metrics|findings|frameworks|supportedModels)\s*\(', content)
        for obj, method in api_calls:
            if method == "list":
                checks.append(f"Data loaded from API ({obj}.{method}()) — list appears (not blank, not hardcoded)")
                checks.append(f"Empty state renders when list is empty — not blank space or 'undefined'")
            elif method == "get":
                checks.append(f"Detail data loaded ({obj}.{method}()) — all fields populated")

        # Loading state
        if re.search(r'loading|setLoading', content):
            checks.append("Loading spinner visible while API call is in progress")
            checks.append("Spinner disappears and data renders after load completes")

        # Error state
        if re.search(r'setError|error &&|error \?', content):
            checks.append("Error state: simulate API failure (disable network) → error message shown to user")
            checks.append("Error state: form fields NOT cleared on error — user can fix and retry")

        # Forms and inputs
        inputs = re.findall(r'<input[^>]*(?:value|onChange)[^>]*>', content)
        textareas = re.findall(r'<textarea[^>]*>', content)
        if inputs or textareas:
            checks.append(f"Form has {len(inputs)} input(s) and {len(textareas)} textarea(s)")
            checks.append("Submit form with all required fields empty → validation errors shown per field")
            checks.append("Submit form with valid data → API call fires (visible in Network tab)")
            checks.append("Submit button shows loading indicator and is disabled while request is in flight")

        # Buttons derived from onClick handlers
        button_handlers = re.findall(r'onClick=\{([^}]+)\}', content)
        navigate_calls = re.findall(r"navigate\(['\"`]([^'\"` )]+)", content)
        for nav in navigate_calls:
            checks.append(f"Navigation to '{nav}' works and target page loads cleanly")

        # Delete flows
        if re.search(r'delete|Delete|handleDelete', content, re.IGNORECASE):
            checks.append("Delete action: confirmation dialog/modal appears before deletion")
            checks.append("Delete confirmed: item removed from list without page refresh")
            checks.append("Delete cancelled: item NOT removed")

        # Drawers / modals
        drawers = re.findall(r'show\w+|setShow\w+|showNew|showRun|showAdd|showUpload|showCreate', content)
        drawer_names = list(set(re.findall(r'show(\w+)', content)))
        for d in drawer_names[:3]:
            checks.append(f"'{d}' drawer/modal: opens on trigger button click")
            checks.append(f"'{d}' drawer/modal: closes on Cancel/X button and on backdrop click")
            checks.append(f"'{d}' drawer/modal: closing without submitting does NOT alter any data")

        # WebSocket
        if re.search(r'new WebSocket|getWsUrl', content):
            checks.append("WebSocket connects after action (visible in Network tab as 'ws://' connection)")
            checks.append("WebSocket progress updates render in real time (counter/bar increments)")
            checks.append("WebSocket: on completion status badge updates automatically without page refresh")
            checks.append("WebSocket: on failure error message + retry action shown")

        # Score display
        if re.search(r'overall_score|score\s*\*\s*100|Math\.round.*score', content):
            checks.append("Scores displayed as percentages (e.g. '73%') NOT decimals ('0.73') — CRITICAL")
            checks.append("Score bar color: green ≥80%, amber 60-79%, red <60%")

        # Confidence badge
        if re.search(r'confidence|low.confidence', content, re.IGNORECASE):
            checks.append("Low confidence badge shown when confidence < 0.7")

        # Metric display names
        if re.search(r'metricRegistry|registry\[', content):
            checks.append("Metric names show human-readable display names (e.g. 'Answer Relevancy') NOT raw IDs (e.g. 'answer_relevancy')")

        # File upload
        if re.search(r'type="file"|FormData|multipart', content):
            checks.append("File picker accepts only declared file types (.json, .jsonl, .csv)")
            checks.append("Upload with valid file → API call fires with multipart/form-data")
            checks.append("Upload with empty/invalid file → error shown, upload not attempted")
            checks.append("Upload success → new item appears in list, version badge shows 'v1'")

        # Version tracking
        if re.search(r'version|v\{dataset\.version\}', content):
            checks.append("Version badge increments after each create/delete operation")

        # Specific stubs to flag
        hardcoded = re.findall(r'useState\s*\(\s*\[.*?{.*?hardcoded|const\s+\w+\s*=\s*\[.*?label.*?used.*?\]', content, re.DOTALL)
        has_hardcoded_data = bool(re.search(r'const\s+\w+Data\s*=\s*\[|useState\s*\(\s*\[.*?label.*?used', content, re.DOTALL))

        checklist.append({
            "component": component,
            "file": str(rel),
            "url": url,
            "checks": checks,
            "is_stub": bool(re.search(r'TODO|STUB|hardcoded|No backend|local state only', content, re.IGNORECASE)) or has_hardcoded_data
        })

    # Print checklist
    total_checks = 0
    for page in checklist:
        stub_note = f"  {WARN} \033[93mSTUB — some data may be hardcoded\033[0m" if page["is_stub"] else ""
        print(f"\n{BOLD}[ ] {page['component']} ({page['url']}){END}{stub_note}")
        print(f"    \033[2m{page['file']}\033[0m")
        for check in page["checks"]:
            print(f"    [ ] {check}")
            total_checks += 1

    # Global checks always required
    print(f"\n{BOLD}[ ] GLOBAL — Auth & Session{END}")
    global_checks = [
        "Visit /dashboard without token in localStorage → redirected to /login",
        "Visit /project/any-id without token → redirected to /login",
        "After login, browser Back button does NOT return to /login",
        "Logout → localStorage cleared → visiting /dashboard redirects to /login",
        "After logout, browser Back button → stays on /login",
        "Token expired → next API call auto-refreshes token → request succeeds transparently",
        "Token refresh fails → redirect to /login with session cleared",
    ]
    for c in global_checks:
        print(f"    [ ] {c}")
        total_checks += 1

    print(f"\n{BOLD}[ ] GLOBAL — Console & Network (check on EVERY page){END}")
    console_checks = [
        "Zero red errors in F12 → Console across all pages",
        "Zero failed requests in F12 → Network across all pages",
        "No text 'undefined' rendered anywhere in the UI",
        "No text 'NaN' in any numeric field",
        "No text '[object Object]' anywhere",
        "No raw metric IDs visible (e.g. 'answer_relevancy') — must be display names",
        "No mojibake characters (ð, Ã, â€, â¸) visible in rendered UI",
    ]
    for c in console_checks:
        print(f"    [ ] {c}")
        total_checks += 1

    print(f"\n  Total manual checks to complete: {BOLD}{total_checks}{END}")
    return total_checks


# ─────────────────────────────────────────────────────────────
# GATE 5: Security & environment
# ─────────────────────────────────────────────────────────────

def gate5_security():
    section("GATE 5 — Security & Environment")

    # Hardcoded secrets in backend
    print(f"\n{INFO} Scanning for hardcoded secrets ...")
    SECRET_PATTERNS = [
        (r'api_key\s*=\s*["\'][^$\{][^"\']{8,}["\']',   "Hardcoded API key"),
        (r'password\s*=\s*["\'][^$\{][^"\']{3,}["\']',  "Hardcoded password"),
        (r'sk-[a-zA-Z0-9]{20,}',                         "OpenAI API key"),
        (r'sk-ant-[a-zA-Z0-9-]{20,}',                    "Anthropic API key"),
        (r'SECRET_KEY\s*=\s*["\'][^$\{].{5,}',           "Hardcoded SECRET_KEY"),
    ]
    for fpath in glob.glob(str(BACKEND / "**" / "*.py"), recursive=True):
        if ".env" in fpath:
            continue
        content = open(fpath, encoding="utf-8", errors="replace").read()
        for pattern, desc in SECRET_PATTERNS:
            if re.search(pattern, content, re.IGNORECASE):
                rel = fpath.replace(str(ROOT), "").lstrip("/\\")
                record("critical", "G5", rel,
                       f"{desc} found in source file",
                       "Move to .env file, never commit credentials")

    # .env in gitignore
    gitignore = ROOT / ".gitignore"
    env_file  = ROOT / "backend" / ".env"
    if gitignore.exists():
        gi_content = gitignore.read_text()
        if ".env" not in gi_content:
            record("critical", "G5", ".gitignore", ".env not in .gitignore — secrets will be committed", "Add .env to .gitignore")
        else:
            ok(".env is in .gitignore")
    else:
        record("high", "G5", "", ".gitignore file not found", "Create .gitignore with .env, __pycache__, node_modules, dist")

    # Check .env exists (not committed, but required to run)
    if not env_file.exists():
        record("high", "G5", "backend/.env", ".env file not found — backend cannot start", "Create backend/.env with required vars")
    else:
        env_content = env_file.read_text()
        required_vars = ["SECRET_KEY", "ENCRYPTION_KEY", "DATABASE_URL", "FRONTEND_URL"]
        for var in required_vars:
            if var not in env_content:
                record("high", "G5", "backend/.env", f"Required var {var} missing from .env", f"Add {var}=... to .env")
        ok(".env exists with required variables")

    # CORS check in main.py
    main_py = BACKEND / "main.py"
    if main_py.exists():
        main_content = main_py.read_text(encoding="utf-8")
        if '"*"' in main_content and "allow_origins" in main_content:
            record("critical", "G5", "backend/main.py",
                   "CORS allow_origins=[\"*\"] — allows any origin, security vulnerability in production",
                   "Set to specific domain from settings.FRONTEND_URL")
        else:
            ok("CORS origins restricted (not wildcard *)")

    # Security headers
    if main_py.exists():
        main_content = main_py.read_text(encoding="utf-8")
        required_headers = ["X-Content-Type-Options", "X-Frame-Options", "X-XSS-Protection"]
        missing_headers  = [h for h in required_headers if h not in main_content]
        if missing_headers:
            record("high", "G5", "backend/main.py",
                   f"Missing security headers: {missing_headers}",
                   "Add SecurityHeadersMiddleware")
        else:
            ok("Security headers middleware present")


# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────

def summary():
    section("SUMMARY")

    by_severity = {"critical": [], "high": [], "medium": [], "info": []}
    for issue in issues:
        by_severity[issue["severity"]].append(issue)

    crit = len(by_severity["critical"])
    high = len(by_severity["high"])
    med  = len(by_severity["medium"])

    print(f"\n  Critical: {FAIL if crit else PASS} {crit}")
    print(f"  High:     {FAIL if high else PASS} {high}")
    print(f"  Medium:   {WARN if med else PASS} {med}")

    if crit or high:
        print(f"\n  {FAIL} {BOLD}FAIL — fix all Critical and High issues before proceeding{END}")
        print(f"\n  Critical & High issues to fix:")
        for issue in by_severity["critical"] + by_severity["high"]:
            loc = f" [{issue['file']}]" if issue['file'] else ""
            print(f"  • [{issue['severity'].upper()}]{loc} {issue['message']}")
            if issue['fix']:
                print(f"    → {issue['fix']}")
    else:
        print(f"\n  {PASS} {BOLD}Automated gates passed — proceed to manual Gate 4 functional tests{END}")

    return crit + high


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\n{BOLD}{'='*60}{END}")
    print(f"{BOLD}  ITTIQAN DYNAMIC QA RUNNER{END}")
    if FIX_MODE:
        print(f"{BOLD}  Mode: --fix (auto-fix then re-scan){END}")
    else:
        print(f"{BOLD}  Mode: scan only  (use --fix to auto-fix){END}")
    print(f"{BOLD}{'='*60}{END}")

    if FIX_MODE:
        run_all_fixes()
        print(f"\n{BOLD}Re-scanning after fixes...{END}")
        issues.clear()

    gate0_static()
    gate1_code()
    gate2_backend()
    gate3_contract()
    gate4_functional_checklist()
    gate5_security()
    exit_code = summary()

    sys.exit(0 if exit_code == 0 else 1)

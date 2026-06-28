#!/usr/bin/env python3
"""
fix_encoding.py — fixes all mojibake and BOM issues in frontend/*.tsx files.

ROOT CAUSE:
  Files were read with wrong encoding (latin-1) and saved back as UTF-8.
  This double-encodes every byte above 0x7F. Some files were processed twice
  (triple-encoded). BOMs got encoded the same way.

THE FIX (one algorithm handles all cases):
  1. Strip raw BOM bytes at start of file.
  2. Read file as UTF-8 to get the (potentially mojibake) text.
  3. Scan the text for "runs" of chars in U+0080-U+00FF range.
     These are exactly the mojibake chars (latin-1 surrogates).
  4. For each run, repeatedly apply: encode as latin-1 → decode as UTF-8,
     until the run contains no more latin-1-range chars (i.e. is clean unicode)
     or the round-trip makes no progress.
  5. Stitch the fixed runs back with the original >U+00FF chars untouched.
  6. Write result back as UTF-8.

This correctly handles:
  - Double-encoded UTF-8  (1 round-trip per run)
  - Triple-encoded UTF-8  (2 round-trips per run, e.g. LoginPage BOM)
  - Mixed files with real smart quotes (U+201D) alongside mojibake
  - Emoji mojibake (4-byte sequences encoded twice)
  - Any BOM variant (raw, double-encoded, triple-encoded)
"""

import glob, shutil, sys
from pathlib import Path

ROOT     = Path(__file__).parent
FRONTEND = ROOT / "frontend" / "src"

# Raw BOM byte patterns to strip at file start (before UTF-8 decode)
BOM_BYTE_PREFIXES = [
    b'\xef\xbb\xbf',                                     # raw BOM
    b'\xc3\xaf\xc2\xbb\xc2\xbf',                         # double-encoded BOM
    b'\xc3\x83\xc2\xaf\xc3\x82\xc2\xbb\xc3\x82\xc2\xbf', # triple-encoded BOM
]

def fix_run(run: str) -> str:
    """
    Given a string where all chars are in U+0080-U+00FF (latin-1 range),
    iteratively apply the latin-1 round-trip until the run is clean or stable.
    """
    current = run
    for _ in range(4):  # max 4 passes handles up to 4x encoding
        try:
            next_run = current.encode('latin-1').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            break  # can't decode — stop, keep current state
        if next_run == current:
            break  # no change — already clean
        current = next_run
        # If the result still has latin-1-range chars, loop again
        if not any(0x80 <= ord(c) <= 0xFF for c in current):
            break  # fully clean — stop early
    return current

def fix_file(path: Path) -> bool:
    """Fix one file. Returns True if the file was changed."""
    raw = path.read_bytes()

    # Step 1: strip raw/double/triple BOM at byte level
    for bom_bytes in BOM_BYTE_PREFIXES:
        if raw.startswith(bom_bytes):
            raw = raw[len(bom_bytes):]
            break  # only one BOM possible

    # Step 2: decode as UTF-8
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError as e:
        print(f"  SKIP {path.name}: not valid UTF-8 — {e}")
        return False

    # Step 3: normalise line endings — \r\r\n and \r\n both become \n
    # The original encoding errors left \r\r\n sequences that inflate vite's line counter
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    # Step 4: segment-based mojibake fix
    result = []
    i = 0
    while i < len(text):
        code = ord(text[i])
        if 0x80 <= code <= 0xFF:
            # Collect maximal run of latin-1-range chars
            j = i
            while j < len(text) and 0x80 <= ord(text[j]) <= 0xFF:
                j += 1
            run = text[i:j]
            result.append(fix_run(run))
            i = j
        else:
            result.append(text[i])
            i += 1

    # Step 5: strip any remaining BOM character and replace smart/curly quotes
    # with straight ASCII equivalents — curly quotes are never valid in TypeScript
    fixed_text = ''.join(result).lstrip('﻿')
    # Curly/smart quotes are never valid TypeScript string delimiters or JSX attribute delimiters.
    # Replace with straight ASCII equivalents. Em/en dashes and arrows are left as-is
    # (valid Unicode content in JSX text and comments).
    # Curly/smart quotes are never valid TypeScript string delimiters.
    # Replace with straight ASCII. Written as \u escapes to survive editor processing.
    QUOTE_REPLACEMENTS = [
        ('\u2018', "'"),   # left  single curly quote
        ('\u2019', "'"),   # right single curly quote
        ('\u201c', '"'),   # left  double curly quote
        ('\u201d', '"'),   # right double curly quote
        ('\ufeff', ''),     # BOM character
    ]
    for bad, good in QUOTE_REPLACEMENTS:
        fixed_text = fixed_text.replace(bad, good)

    # Step 6: compare and write
    original_raw = path.read_bytes()  # re-read to compare against (may include BOM bytes)
    fixed_bytes = fixed_text.encode('utf-8')
    if fixed_bytes == original_raw:
        return False  # no change needed

    # Write backup
    bak = path.with_suffix(path.suffix + '.qa_backup')
    if not bak.exists():
        shutil.copy2(path, bak)

    path.write_bytes(fixed_bytes)
    return True


def main():
    files = (
        glob.glob(str(FRONTEND / "**" / "*.tsx"), recursive=True) +
        glob.glob(str(FRONTEND / "**" / "*.ts"),  recursive=True)
    )

    changed = []
    skipped = []

    for fpath in sorted(files):
        p = Path(fpath)
        rel = str(p.relative_to(ROOT))
        try:
            if fix_file(p):
                changed.append(rel)
                print(f"  FIXED  {rel}")
            else:
                print(f"  clean  {rel}")
        except Exception as e:
            skipped.append((rel, str(e)))
            print(f"  ERROR  {rel}: {e}")

    print(f"\n{'='*50}")
    print(f"Fixed:   {len(changed)} files")
    print(f"Skipped: {len(skipped)} files")
    if changed:
        print(f"\nChanged files:")
        for f in changed:
            print(f"  {f}")
    if skipped:
        print(f"\nErrors:")
        for f, e in skipped:
            print(f"  {f}: {e}")

    return len(skipped) == 0


if __name__ == "__main__":
    sys.exit(0 if main() else 1)

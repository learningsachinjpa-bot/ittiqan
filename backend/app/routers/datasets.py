import json
import csv
import io
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import get_current_user, require_role, get_client_ip
from app.core.field_encryption import encrypt_text, decrypt_text, encrypt_json, decrypt_json
from app.models.user import User
from app.models.dataset import Dataset, TestCase
from app.models.organization import OrgMember, AuditLog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/datasets", tags=["datasets"])

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB hard cap
MAX_ROWS = 50_000
_WRITE_ROLES = ("owner", "admin", "developer")
_ADMIN_ROLES = ("owner", "admin")

def get_user_org_member(db: Session, user_id: str) -> OrgMember:
    m = db.query(OrgMember).filter(OrgMember.user_id == user_id).first()
    if not m:
        raise HTTPException(status_code=403, detail="No organization")
    return m

def testcase_to_dict(c: TestCase) -> dict:
    return {
        "id": c.id,
        "input": decrypt_text(c.input),
        "expected_output": decrypt_text(c.expected_output),
        "context": decrypt_json(c.context),
        "retrieval_context": decrypt_json(c.retrieval_context),
    }

def dataset_to_dict(d: Dataset) -> dict:
    return {
        "id": d.id, "name": d.name, "description": d.description,
        "file_format": d.file_format, "row_count": d.row_count,
        "version": getattr(d, "version", 1),
        "columns": d.columns or [], "sample_rows": d.sample_rows or [],
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }

@router.get("")
async def list_datasets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = get_user_org_member(db, user.id)
    datasets = db.query(Dataset).filter(Dataset.org_id == m.org_id).all()
    return [dataset_to_dict(d) for d in datasets]

@router.post("/upload")
async def upload_dataset(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form(...),
    description: Optional[str] = Form(None),
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_user_org_member(db, user.id)

    # HIGH-6: enforce file size cap before reading into memory
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum upload size is {MAX_UPLOAD_BYTES // 1024 // 1024} MB."
        )

    filename = file.filename or "dataset"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "json"

    rows: list = []
    columns: list = []

    try:
        if ext == "csv":
            reader = csv.DictReader(io.StringIO(content.decode("utf-8", errors="replace")))
            rows = list(reader)
            columns = list(reader.fieldnames or [])
        elif ext in ("json", "jsonl"):
            text = content.decode("utf-8", errors="replace").strip()
            if ext == "jsonl" or (text and text[0] != "["):
                rows = [json.loads(line) for line in text.splitlines() if line.strip()]
            else:
                data = json.loads(text)
                rows = data if isinstance(data, list) else [data]
            columns = list(rows[0].keys()) if rows else []
        else:
            raise HTTPException(status_code=400, detail="Unsupported format. Use CSV, JSON, or JSONL.")
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {str(e)[:200]}")

    if len(rows) > MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Dataset too large — {len(rows)} rows exceeds maximum of {MAX_ROWS:,}. Split into smaller files."
        )

    if not rows:
        raise HTTPException(status_code=400, detail="File contains no rows.")

    dataset = Dataset(
        org_id=m.org_id, name=name[:200], description=description,
        file_format=ext, row_count=len(rows),
        columns=columns[:50],  # cap columns stored
        sample_rows=rows[:5],
        created_by=user.id,
    )
    db.add(dataset)
    db.flush()

    for row in rows:
        raw_input = str(row.get("input") or row.get("query") or row.get("question") or row.get("prompt") or "")[:10000]
        raw_expected = str(row.get("expected_output") or row.get("answer") or row.get("expected") or "")[:10000] or None
        raw_context = row.get("context")
        raw_retrieval = row.get("retrieval_context") or row.get("contexts")
        tc = TestCase(
            dataset_id=dataset.id,
            input=encrypt_text(raw_input),
            expected_output=encrypt_text(raw_expected),
            context=encrypt_json(raw_context),
            retrieval_context=encrypt_json(raw_retrieval),
            extra_data={k: v for k, v in row.items() if k not in ["input", "expected_output", "context", "retrieval_context"]},
        )
        db.add(tc)

    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="dataset.upload", resource_type="dataset", resource_id=dataset.id,
        details=f"Uploaded dataset '{name}': {len(rows)} rows, format={ext}",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(dataset)
    return dataset_to_dict(dataset)

@router.get("/{dataset_id}")
async def get_dataset(dataset_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = get_user_org_member(db, user.id)
    d = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.org_id == m.org_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset_to_dict(d)

@router.get("/{dataset_id}/test-cases")
async def get_test_cases(
    dataset_id: str,
    limit: int = 100,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # HIGH-8: cap limit
    limit = max(1, min(limit, 500))
    m = get_user_org_member(db, user.id)
    d = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.org_id == m.org_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dataset not found")
    cases = db.query(TestCase).filter(TestCase.dataset_id == dataset_id).offset(offset).limit(limit).all()
    return [testcase_to_dict(c) for c in cases]

class TestCaseCreate(BaseModel):
    input: str
    expected_output: Optional[str] = None
    context: Optional[dict] = None
    retrieval_context: Optional[list] = None


@router.post("/{dataset_id}/test-cases")
async def add_test_cases(
    dataset_id: str,
    request: Request,
    body: list[TestCaseCreate],
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    """Add one or more test cases to an existing dataset. Bumps dataset.version."""
    if not body:
        raise HTTPException(status_code=400, detail="Provide at least one test case.")
    if len(body) > 1000:
        raise HTTPException(status_code=400, detail="Maximum 1000 test cases per request.")

    m = get_user_org_member(db, user.id)
    d = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.org_id == m.org_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dataset not found")

    for tc in body:
        db.add(TestCase(
            dataset_id=dataset_id,
            input=encrypt_text(tc.input[:10000]),
            expected_output=encrypt_text(tc.expected_output[:10000]) if tc.expected_output else None,
            context=encrypt_json(tc.context),
            retrieval_context=encrypt_json(tc.retrieval_context),
        ))

    # Atomic version bump + row count update
    db.query(Dataset).filter(Dataset.id == dataset_id).update({
        "version": Dataset.version + 1,
        "row_count": Dataset.row_count + len(body),
    })
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="dataset.add_cases", resource_type="dataset", resource_id=dataset_id,
        details=f"Added {len(body)} test case(s) — new version after commit",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(d)
    return dataset_to_dict(d)


@router.delete("/{dataset_id}/test-cases/{case_id}")
async def delete_test_case(
    dataset_id: str,
    case_id: str,
    request: Request,
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    """Remove a single test case. Bumps dataset.version."""
    m = get_user_org_member(db, user.id)
    d = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.org_id == m.org_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dataset not found")

    tc = db.query(TestCase).filter(TestCase.id == case_id, TestCase.dataset_id == dataset_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")

    db.delete(tc)
    db.query(Dataset).filter(Dataset.id == dataset_id).update({
        "version": Dataset.version + 1,
        "row_count": Dataset.row_count - 1,
    })
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="dataset.remove_case", resource_type="dataset", resource_id=dataset_id,
        details=f"Removed test case {case_id}",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(d)
    return dataset_to_dict(d)


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    request: Request,
    user: User = Depends(require_role(*_ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_user_org_member(db, user.id)
    d = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.org_id == m.org_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dataset not found")

    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="dataset.delete", resource_type="dataset", resource_id=dataset_id,
        details=f"Deleted dataset '{d.name}' ({d.row_count} rows)",
        ip_address=get_client_ip(request),
    ))
    db.query(TestCase).filter(TestCase.dataset_id == dataset_id).delete()
    db.delete(d)
    db.commit()
    return {"success": True}

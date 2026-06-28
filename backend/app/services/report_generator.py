"""
PDF report generator for evaluation results.
Uses reportlab (already in requirements.txt).
"""
import io
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# Brand colours
CYAN = colors.HexColor("#0e7490")
CYAN_LIGHT = colors.HexColor("#cffafe")
RED = colors.HexColor("#ef4444")
GREEN = colors.HexColor("#22c55e")
AMBER = colors.HexColor("#f59e0b")
GRAY = colors.HexColor("#6b7280")
GRAY_LIGHT = colors.HexColor("#f3f4f6")
WHITE = colors.white
BLACK = colors.HexColor("#111827")

W, H = A4
MARGIN = 20 * mm


def _score_color(score: float | None) -> colors.Color:
    if score is None:
        return GRAY
    if score >= 0.8:
        return GREEN
    if score >= 0.6:
        return AMBER
    return RED


def _pct(v: float | None) -> str:
    return f"{v * 100:.1f}%" if v is not None else "—"


def _fmt_dt(dt: datetime | None) -> str:
    return dt.strftime("%Y-%m-%d %H:%M UTC") if dt else "—"


def generate_evaluation_report(
    evaluation: object,
    agent_name: str,
    org_name: str,
    results: list,
) -> bytes:
    """
    Returns PDF bytes for a completed evaluation.
    evaluation — SQLAlchemy Evaluation object
    results    — list of EvaluationResult objects
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title=f"Evaluation Report — {evaluation.name}",
        author="Ittiqan",
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=CYAN, fontSize=20, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=BLACK, fontSize=13, spaceBefore=12, spaceAfter=4)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=9, textColor=BLACK, leading=14)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=GRAY, leading=12)
    label = ParagraphStyle("label", parent=styles["Normal"], fontSize=8, textColor=GRAY, spaceAfter=1)
    value = ParagraphStyle("value", parent=styles["Normal"], fontSize=10, textColor=BLACK, spaceBefore=0)

    elements = []

    # ── Header ──────────────────────────────────────────────────────────────
    elements.append(Paragraph("Ittiqan", ParagraphStyle("brand", parent=h1, fontSize=10, textColor=GRAY)))
    elements.append(Paragraph("AI Agent Evaluation Report", h1))
    elements.append(Spacer(1, 2 * mm))
    elements.append(HRFlowable(width="100%", thickness=2, color=CYAN))
    elements.append(Spacer(1, 4 * mm))

    # ── Meta grid ───────────────────────────────────────────────────────────
    overall = evaluation.overall_score
    score_color = _score_color(overall)
    meta = [
        ["Agent", agent_name, "Organisation", org_name],
        ["Evaluation", evaluation.name, "Status", evaluation.status.value.upper()],
        ["Started", _fmt_dt(evaluation.started_at), "Completed", _fmt_dt(evaluation.completed_at)],
        ["Dataset", evaluation.dataset_id or "—", "Overall Score", _pct(overall)],
    ]
    meta_table = Table(meta, colWidths=[(W - 2 * MARGIN) * x for x in [0.15, 0.35, 0.15, 0.35]])
    meta_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (0, -1), GRAY),
        ("TEXTCOLOR", (2, 0), (2, -1), GRAY),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("FONTNAME", (3, 0), (3, -1), "Helvetica"),
        ("TEXTCOLOR", (3, 3), (3, 3), score_color),
        ("FONTNAME", (3, 3), (3, 3), "Helvetica-Bold"),
        ("FONTSIZE", (3, 3), (3, 3), 11),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [WHITE, GRAY_LIGHT]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 6 * mm))

    # ── Metric Scores ────────────────────────────────────────────────────────
    metric_scores = evaluation.metric_scores or {}
    if metric_scores:
        elements.append(Paragraph("Metric Scores", h2))
        elements.append(Spacer(1, 2 * mm))

        rows = [["Metric", "Score", "Pass / Fail"]]
        for metric, data in metric_scores.items():
            if isinstance(data, dict):
                sc = data.get("score")
                passed = data.get("passed")
            else:
                sc = data
                passed = sc >= 0.7 if sc is not None else None
            pass_label = ("✓ Pass" if passed else "✗ Fail") if passed is not None else "—"
            rows.append([metric.replace("_", " ").title(), _pct(sc), pass_label])

        col_w = [(W - 2 * MARGIN) * x for x in [0.55, 0.20, 0.25]]
        t = Table(rows, colWidths=col_w)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), CYAN),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, GRAY_LIGHT]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ]))
        # Colour pass/fail cells
        for i, (metric, data) in enumerate(metric_scores.items(), start=1):
            if isinstance(data, dict):
                passed = data.get("passed")
            else:
                passed = (data >= 0.7) if data is not None else None
            if passed is True:
                t.setStyle(TableStyle([("TEXTCOLOR", (2, i), (2, i), GREEN)]))
            elif passed is False:
                t.setStyle(TableStyle([("TEXTCOLOR", (2, i), (2, i), RED)]))
        elements.append(t)
        elements.append(Spacer(1, 6 * mm))

    # ── Per-result detail (up to 50) ─────────────────────────────────────────
    if results:
        elements.append(Paragraph("Sample Results", h2))
        elements.append(Spacer(1, 2 * mm))

        for idx, r in enumerate(results[:50], 1):
            input_text = str(r.input or "")[:300]
            output_text = str(r.output or "")[:300]
            mr = r.metric_results or {}

            block = []
            block.append(Paragraph(f"<b>#{idx}</b>", body))

            if input_text:
                block.append(Paragraph(f"<font color='#6b7280'>Input:</font> {input_text}", small))
            if output_text:
                block.append(Paragraph(f"<font color='#6b7280'>Output:</font> {output_text}", small))

            if mr:
                metric_rows = [["Metric", "Score", "Reason"]]
                for m_name, m_data in mr.items():
                    if isinstance(m_data, dict):
                        m_sc = m_data.get("score")
                        reason = str(m_data.get("reason", ""))[:120]
                    else:
                        m_sc = m_data
                        reason = ""
                    metric_rows.append([
                        m_name.replace("_", " ").title(),
                        _pct(m_sc),
                        Paragraph(reason, ParagraphStyle("tiny", fontSize=7, leading=9)),
                    ])
                mt = Table(metric_rows, colWidths=[(W - 2 * MARGIN) * x for x in [0.25, 0.12, 0.63]])
                mt.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), GRAY_LIGHT),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("ALIGN", (1, 0), (1, -1), "CENTER"),
                ]))
                block.append(Spacer(1, 1 * mm))
                block.append(mt)

            block.append(HRFlowable(width="100%", thickness=0.5, color=GRAY_LIGHT, spaceAfter=2))
            elements.append(KeepTogether(block))
            elements.append(Spacer(1, 2 * mm))

        if len(results) > 50:
            elements.append(Paragraph(
                f"<i>Showing 50 of {len(results)} results. Export CSV for the full dataset.</i>",
                small,
            ))

    # ── Footer note ─────────────────────────────────────────────────────────
    elements.append(Spacer(1, 8 * mm))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=GRAY_LIGHT))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(
        f"Generated by Ittiqan · {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        ParagraphStyle("footer", parent=small, alignment=TA_CENTER),
    ))

    doc.build(elements)
    buf.seek(0)
    return buf.read()

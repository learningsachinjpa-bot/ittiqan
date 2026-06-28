"""add webhook deliveries table

Revision ID: 8b3c4d5e6f78
Revises: 7a2b3c4d5e67
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa

revision = '8b3c4d5e6f78'
down_revision = '7a2b3c4d5e67'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'webhook_deliveries',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('org_id', sa.String(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('alert_id', sa.String(), sa.ForeignKey('alerts.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('url', sa.String(2048), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, default='pending'),  # success | failed | pending
        sa.Column('http_status', sa.Integer(), nullable=True),
        sa.Column('response_body', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('is_test', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_webhook_deliveries_org_created', 'webhook_deliveries', ['org_id', 'created_at'])


def downgrade():
    op.drop_table('webhook_deliveries')

"""add approval gateway

Revision ID: 3f8a1c2d9e45
Revises: 0dc658db1124
Create Date: 2026-06-28

"""
from alembic import op
import sqlalchemy as sa

revision = '3f8a1c2d9e45'
down_revision = '0dc658db1124'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add org API key columns
    op.add_column('organizations', sa.Column('api_key', sa.String(64), nullable=True))
    op.add_column('organizations', sa.Column('api_key_created_at', sa.DateTime(), nullable=True))
    op.create_unique_constraint('uq_organizations_api_key', 'organizations', ['api_key'])
    op.create_index('ix_organizations_api_key', 'organizations', ['api_key'])

    # Create approval_requests table
    op.create_table(
        'approval_requests',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('org_id', sa.String(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('agent_id', sa.String(), sa.ForeignKey('agents.id'), nullable=True),
        sa.Column('action_type', sa.String(100), nullable=False),
        sa.Column('action_title', sa.String(300), nullable=False),
        sa.Column('action_description', sa.Text(), nullable=True),
        sa.Column('action_payload', sa.JSON(), nullable=True),
        sa.Column('urgency', sa.String(20), nullable=False, server_default='normal'),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending', index=True),
        sa.Column('reviewed_by', sa.String(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('review_note', sa.Text(), nullable=True),
        sa.Column('callback_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, index=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_approval_requests_org_id', 'approval_requests', ['org_id'])
    op.create_index('ix_approval_requests_status', 'approval_requests', ['status'])
    op.create_index('ix_approval_requests_created_at', 'approval_requests', ['created_at'])


def downgrade() -> None:
    op.drop_table('approval_requests')
    op.drop_index('ix_organizations_api_key', table_name='organizations')
    op.drop_constraint('uq_organizations_api_key', 'organizations', type_='unique')
    op.drop_column('organizations', 'api_key_created_at')
    op.drop_column('organizations', 'api_key')

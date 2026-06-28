"""add_incidents_table

Revision ID: 0dc658db1124
Revises: 01e30bdc6fb7
Create Date: 2026-06-28

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = '0dc658db1124'
down_revision: Union[str, Sequence[str], None] = '01e30bdc6fb7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'incidents',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('org_id', sa.String(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('agent_id', sa.String(), sa.ForeignKey('agents.id'), nullable=True),
        sa.Column('title', sa.String(300), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('severity', sa.Enum('low', 'medium', 'high', 'critical', name='incidentseverity'), nullable=True),
        sa.Column('status', sa.Enum('open', 'investigating', 'resolved', name='incidentstatus'), nullable=True),
        sa.Column('created_by', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('incidents')
    op.execute("DROP TYPE IF EXISTS incidentseverity")
    op.execute("DROP TYPE IF EXISTS incidentstatus")

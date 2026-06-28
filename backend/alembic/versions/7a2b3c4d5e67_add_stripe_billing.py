"""add stripe billing columns to organizations

Revision ID: 7a2b3c4d5e67
Revises: 3f8a1c2d9e45
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa

revision = '7a2b3c4d5e67'
down_revision = '3f8a1c2d9e45'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organizations', sa.Column('stripe_customer_id', sa.String(100), nullable=True))
    op.add_column('organizations', sa.Column('stripe_subscription_id', sa.String(100), nullable=True))
    op.create_index('ix_organizations_stripe_customer_id', 'organizations', ['stripe_customer_id'], unique=False)


def downgrade():
    op.drop_index('ix_organizations_stripe_customer_id', table_name='organizations')
    op.drop_column('organizations', 'stripe_subscription_id')
    op.drop_column('organizations', 'stripe_customer_id')

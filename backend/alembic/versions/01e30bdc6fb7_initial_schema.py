"""initial_schema

Revision ID: 01e30bdc6fb7
Revises:
Create Date: 2026-06-28

Baseline migration — all tables already exist in the DB.
Run `alembic stamp 01e30bdc6fb7` on an existing DB to mark it current.
Fresh deployments: `alembic upgrade head` will be a no-op since schema
is created by SQLAlchemy create_all() in the app lifespan.
"""
from typing import Sequence, Union

revision: str = '01e30bdc6fb7'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

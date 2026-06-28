from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REDIS_URL: str = "redis://localhost:6379"
    GOOGLE_CLIENT_ID: str
    FRONTEND_URL: str = "http://localhost:3000"
    ENCRYPTION_KEY: str

    # Email / SMTP — all optional; email is silently skipped when not configured
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM: Optional[str] = None          # "Ittiqan <noreply@yourapp.com>"
    SMTP_USE_TLS: bool = True                # STARTTLS on port 587; set False for port 465 SSL

    @property
    def email_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.SMTP_USER and self.SMTP_PASSWORD and self.SMTP_FROM)

    class Config:
        env_file = ".env"

settings = Settings()

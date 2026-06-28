from pydantic_settings import BaseSettings

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

    class Config:
        env_file = ".env"

settings = Settings()

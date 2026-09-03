"""Uygulama ayarları — ortam değişkenlerinden okunur."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Model ayarları
    model_name: str = "./fine_tuned_model"
    vector_dim: int = 768  # mpnet 768 boyutlu vektör üretir

    # Hibrit arama ayarları
    bm25_alpha: float = 0.1  # BM25 ağırlığı; (1 - bm25_alpha) SBERT ağırlığı

    # Servis ayarları
    app_name: str = "DonguNet AI Service"
    app_version: str = "0.1.0"
    log_level: str = "INFO"

    db_host: str = "localhost"
    db_port: int = 5433
    db_name: str = "ecomatch"
    db_user: str = "ecomatch"
    db_password: str = "1Eco2Meko3Seko"

    # .env dosyasından okuma + büyük/küçük harf duyarsız
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        protected_namespaces=("settings_",),  # "model_" çakışmasını önler
    )



# Tek bir ayar nesnesi — her yerden import edilir
settings = Settings()
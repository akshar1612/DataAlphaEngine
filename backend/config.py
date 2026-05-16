from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    UNIVERSE: List[str] = [
        "AAPL", "MSFT", "GOOGL", "AMZN", "META",
        "NVDA", "TSLA", "JPM", "GS", "WMT",
        "TGT", "COST", "HD", "FDX", "XOM",
    ]
    SECTOR_MAP: dict = {
        "AAPL": "Technology", "MSFT": "Technology", "GOOGL": "Technology",
        "AMZN": "Consumer", "META": "Technology", "NVDA": "Technology",
        "TSLA": "Consumer", "JPM": "Financials", "GS": "Financials",
        "WMT": "Consumer", "TGT": "Consumer", "COST": "Consumer",
        "HD": "Consumer", "FDX": "Industrials", "XOM": "Energy",
    }
    DEFAULT_START: str = "2022-01-01"
    DEFAULT_END: str = "2024-12-31"
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]


settings = Settings()

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    agents_api_token: str
    agents_database_url_readonly: str
    azure_openai_endpoint: str
    azure_openai_api_key: str
    azure_openai_deployment: str
    agents_model_temperature: float
    tavily_api_key: str
    enable_market_signal_tool: bool



def _read_required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value



def _read_float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default



def _read_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}



def load_settings() -> Settings:
    load_dotenv()

    return Settings(
        agents_api_token=_read_required("AGENTS_API_TOKEN"),
        agents_database_url_readonly=_read_required("AGENTS_DATABASE_URL_READONLY"),
        azure_openai_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", "").strip(),
        azure_openai_api_key=os.getenv("AZURE_OPENAI_API_KEY", "").strip(),
        azure_openai_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT", "").strip(),
        agents_model_temperature=_read_float("AGENTS_MODEL_TEMPERATURE", 0.1),
        tavily_api_key=os.getenv("TAVILY_API_KEY", "").strip(),
        enable_market_signal_tool=_read_bool("ENABLE_MARKET_SIGNAL_TOOL", False),
    )

from app.settings import Settings
from app.tools import get_routing_constraints, web_market_signal


def _settings() -> Settings:
    return Settings(
        agents_api_token="token",
        agents_database_url_readonly="postgresql://readonly:readonly@localhost:5432/test",
        azure_openai_endpoint="",
        azure_openai_api_key="",
        azure_openai_deployment="",
        agents_model_temperature=0.1,
        tavily_api_key="",
        enable_market_signal_tool=False,
    )


def test_routing_constraints_defaults():
    constraints = get_routing_constraints()
    assert constraints["maxBusinessUnits"] == 3
    assert constraints["maxCrossSell"] == 2
    assert constraints["maxSkuPerBusinessUnit"] == 3


def test_web_market_signal_disabled_returns_empty():
    results = web_market_signal("aac wall systems", _settings())
    assert results == []

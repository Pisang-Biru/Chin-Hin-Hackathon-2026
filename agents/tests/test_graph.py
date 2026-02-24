from app.graph import SESSION_STORE, apply_step_decision, start_graph_session
from app.models import StartSessionRequest, StepDecisionRequest
from app.settings import Settings


SETTINGS = Settings(
    agents_api_token="token",
    agents_database_url_readonly="postgresql://readonly:readonly@localhost:5432/test",
    azure_openai_endpoint="",
    azure_openai_api_key="",
    azure_openai_deployment="",
    agents_model_temperature=0.1,
    tavily_api_key="",
    enable_market_signal_tool=False,
)


def test_delegation_sequence(monkeypatch):
    SESSION_STORE.clear()

    monkeypatch.setattr(
        "app.graph.get_lead_snapshot",
        lambda lead_id, settings: {
            "lead": {"id": lead_id, "projectName": "Demo", "locationText": "KL", "currentStatus": "normalized"},
            "facts": [
                {"factKey": "project_type", "factValue": "commercial", "confidence": 1.0},
                {"factKey": "development_type", "factValue": "fit_out", "confidence": 1.0},
            ],
        },
    )
    monkeypatch.setattr(
        "app.graph.list_business_units",
        lambda settings: [
            {"id": "bu1", "code": "SAG", "name": "SAG", "description": ""},
            {"id": "bu2", "code": "STARKEN_AAC", "name": "AAC", "description": ""},
        ],
    )
    monkeypatch.setattr("app.graph.find_similar_leads", lambda filters, settings: [])
    monkeypatch.setattr(
        "app.graph.list_bu_skus",
        lambda bu_code, settings: [
            {
                "id": f"{bu_code}-sku-1",
                "businessUnitCode": bu_code,
                "skuCode": f"{bu_code}-SKU",
                "skuName": "Demo SKU",
                "skuCategory": "Category",
            }
        ],
    )
    monkeypatch.setattr(
        "app.graph.get_business_unit_profile",
        lambda bu_code, settings: {
            "businessUnit": {"code": bu_code},
            "activeRuleSetCount": 1,
            "conditionCount": 5,
            "activeSkuCount": 1,
        },
    )

    start = start_graph_session(
        StartSessionRequest(
            sessionId="session-1",
            routingRunId="rr-1",
            leadId="lead-1",
            triggeredBy="u1",
            threadId="thread-1",
        ),
        SETTINGS,
    )
    assert start.status == "PENDING_APPROVAL"
    assert start.pendingStep is not None
    assert start.pendingStep.subagentName == "bu_selector"

    after_bu = apply_step_decision(
        "session-1",
        start.pendingStep.stepId,
        StepDecisionRequest(decision="APPROVE", reviewerId="synergy-1", reason="ok"),
        SETTINGS,
    )
    assert after_bu.status == "PENDING_APPROVAL"
    assert after_bu.pendingStep is not None
    assert after_bu.pendingStep.subagentName == "sku_selector"

    completed = apply_step_decision(
        "session-1",
        after_bu.pendingStep.stepId,
        StepDecisionRequest(decision="APPROVE", reviewerId="synergy-1", reason="ok"),
        SETTINGS,
    )
    assert completed.status == "COMPLETED"
    assert completed.finalResult is not None
    assert len(completed.finalResult.buRecommendations) > 0

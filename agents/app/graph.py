from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any

from .models import (
    AgentMessage,
    BuRecommendation,
    FinalResult,
    PendingStep,
    SessionEnvelope,
    SessionStatus,
    StartSessionRequest,
    StepDecisionRequest,
)
from .settings import Settings
from .tools import (
    find_similar_leads,
    get_business_unit_profile,
    get_lead_snapshot,
    get_routing_constraints,
    list_bu_skus,
    list_business_units,
    web_market_signal,
)

try:
    from deepagents import create_deep_agent
except Exception:  # pragma: no cover - optional package compatibility
    create_deep_agent = None  # type: ignore


@dataclass
class GraphSessionState:
    request: StartSessionRequest
    status: SessionStatus
    lead_snapshot: dict[str, Any]
    business_units: list[dict[str, Any]]
    draft: dict[str, Any] = field(default_factory=dict)
    pending_step: PendingStep | None = None
    agent_messages: list[AgentMessage] = field(default_factory=list)
    final_result: FinalResult | None = None
    error: str | None = None


SESSION_STORE: dict[str, GraphSessionState] = {}
DEEP_AGENT_RUNTIME: Any = None


SYSTEM_POLICY = (
    "You are synergy_coordinator. Delegate strictly in this sequence: "
    "bu_selector then sku_selector. Request human approval before each delegation."
)



def _new_step(subagent_name: str, step_index: int, payload: dict[str, Any]) -> PendingStep:
    return PendingStep(
        stepId=str(uuid.uuid4()),
        stepIndex=step_index,
        subagentName=subagent_name,
        requestPayload=payload,
    )



def initialize_deep_agent(settings: Settings) -> None:
    global DEEP_AGENT_RUNTIME

    if create_deep_agent is None:
        DEEP_AGENT_RUNTIME = None
        return

    try:
        DEEP_AGENT_RUNTIME = create_deep_agent(
            model={
                "provider": "azure_openai",
                "endpoint": settings.azure_openai_endpoint,
                "api_key": settings.azure_openai_api_key,
                "deployment": settings.azure_openai_deployment,
                "temperature": settings.agents_model_temperature,
            },
            tools=[
                "get_lead_snapshot",
                "list_business_units",
                "get_business_unit_profile",
                "list_bu_skus",
                "find_similar_leads",
                "get_routing_constraints",
                "web_market_signal",
            ],
            subagents=[
                {
                    "name": "bu_selector",
                    "description": "Select up to 3 business units for cross-sell fit.",
                },
                {
                    "name": "sku_selector",
                    "description": "Select up to 3 SKU proposals per selected business unit.",
                },
            ],
            interrupt_on={"task": True},
            system_prompt=SYSTEM_POLICY,
        )
    except Exception:
        DEEP_AGENT_RUNTIME = None



def _normalize_fact_map(facts: list[dict[str, Any]]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for fact in facts:
        key = str(fact.get("factKey", "")).strip()
        value = str(fact.get("factValue", "")).strip()
        if key and value and key not in mapping:
            mapping[key] = value
    return mapping



def _score_business_unit(code: str, facts: dict[str, str]) -> tuple[float, str]:
    project_type = facts.get("project_type", "").lower()
    development_type = facts.get("development_type", "").lower()
    project_stage = facts.get("project_stage", "").lower()

    score = 0.36
    reasons: list[str] = []

    if code == "GCAST" and "infrastructure" in project_type:
        score += 0.37
        reasons.append("Infrastructure profile matches GCAST precast offerings.")
    if code == "SAG" and development_type in {"fit_out", "refurbishment"}:
        score += 0.33
        reasons.append("Fit-out/refurbishment scope aligns with SAG delivery.")
    if code == "MAKNA" and project_stage in {"tender", "construction"}:
        score += 0.25
        reasons.append("Tender/construction timeline favors MAKNA packages.")
    if code == "STARKEN_AAC" and project_type in {"residential", "commercial"}:
        score += 0.27
        reasons.append("Envelope demand suggests AAC product fit.")
    if code == "STARKEN_DRYMIX" and development_type:
        score += 0.23
        reasons.append("Development scope indicates finishing material demand.")

    if not reasons:
        reasons.append("General product-service fit from lead metadata.")

    return min(score, 0.98), " ".join(reasons)



def _heuristic_bu_selection(
    lead_snapshot: dict[str, Any],
    business_units: list[dict[str, Any]],
    constraints: dict[str, Any],
) -> list[BuRecommendation]:
    facts = _normalize_fact_map(lead_snapshot.get("facts", []))

    scored: list[tuple[dict[str, Any], float, str]] = []
    for bu in business_units:
        score, reason = _score_business_unit(str(bu.get("code", "")), facts)
        scored.append((bu, score, reason))

    scored.sort(key=lambda item: item[1], reverse=True)
    top_n = int(constraints.get("maxBusinessUnits", 3))
    selected = scored[:top_n]

    if not selected:
        return []

    recommendations: list[BuRecommendation] = []
    for index, (bu, score, reason) in enumerate(selected):
        recommendations.append(
            BuRecommendation(
                businessUnitCode=str(bu["code"]),
                role="PRIMARY" if index == 0 else "CROSS_SELL",
                finalScore=round(score, 4),
                confidence=round(min(0.99, 0.45 + score * 0.45), 4),
                reasonSummary=reason,
            )
        )
    return recommendations



def _maybe_model_bu_selection(
    lead_snapshot: dict[str, Any],
    business_units: list[dict[str, Any]],
    constraints: dict[str, Any],
) -> list[BuRecommendation] | None:
    if DEEP_AGENT_RUNTIME is None:
        return None

    invoke = getattr(DEEP_AGENT_RUNTIME, "invoke", None)
    if not callable(invoke):
        return None

    prompt = {
        "task": "Select business units for this lead.",
        "policy": SYSTEM_POLICY,
        "lead": lead_snapshot,
        "businessUnits": business_units,
        "constraints": constraints,
    }

    try:
        raw = invoke(prompt)
    except Exception:
        return None

    payload: Any = raw
    if isinstance(raw, str):
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return None

    candidates = payload.get("buRecommendations") if isinstance(payload, dict) else None
    if not isinstance(candidates, list):
        return None

    recommendations: list[BuRecommendation] = []
    for index, item in enumerate(candidates):
        if not isinstance(item, dict):
            continue
        code = str(item.get("businessUnitCode", "")).strip()
        if not code:
            continue

        recommendations.append(
            BuRecommendation(
                businessUnitCode=code,
                role="PRIMARY" if index == 0 else "CROSS_SELL",
                finalScore=float(item.get("finalScore", 0.5)),
                confidence=float(item.get("confidence", 0.5)),
                reasonSummary=str(item.get("reasonSummary", "Recommended by deep agent.")),
            )
        )

    if not recommendations:
        return None

    return recommendations[: int(constraints.get("maxBusinessUnits", 3))]



def _score_sku_name(name: str, facts: dict[str, str]) -> float:
    score = 0.42
    normalized = name.lower()
    project_type = facts.get("project_type", "").lower()
    development_type = facts.get("development_type", "").lower()

    if "aac" in normalized or "panel" in normalized or "block" in normalized:
        score += 0.2
    if "drymix" in normalized or "render" in normalized or "skim" in normalized:
        score += 0.2
    if "drain" in normalized or "manhole" in normalized or "precast" in normalized:
        score += 0.2
    if "fit" in normalized or "interior" in normalized:
        score += 0.18

    if project_type == "infrastructure" and any(k in normalized for k in ["drain", "manhole", "precast"]):
        score += 0.12
    if development_type in {"fit_out", "refurbishment"} and any(
        k in normalized for k in ["fit", "interior", "render", "skim"]
    ):
        score += 0.12

    return min(score, 0.98)



def _build_sku_proposals(
    lead_snapshot: dict[str, Any],
    bu_recommendations: list[BuRecommendation],
    settings: Settings,
) -> list[dict[str, Any]]:
    facts = _normalize_fact_map(lead_snapshot.get("facts", []))
    proposals: list[dict[str, Any]] = []

    for recommendation in bu_recommendations:
        bu_code = recommendation.businessUnitCode
        skus = list_bu_skus(bu_code, settings)
        ranked = sorted(
            skus,
            key=lambda item: _score_sku_name(
                f"{item.get('skuCode', '')} {item.get('skuName', '')} {item.get('skuCategory', '')}",
                facts,
            ),
            reverse=True,
        )[:3]

        for rank, sku in enumerate(ranked, start=1):
            conf = _score_sku_name(
                f"{sku.get('skuCode', '')} {sku.get('skuName', '')} {sku.get('skuCategory', '')}",
                facts,
            )
            proposals.append(
                {
                    "businessUnitCode": bu_code,
                    "buSkuId": str(sku.get("id")),
                    "rank": rank,
                    "confidence": round(conf, 4),
                    "rationale": f"{sku.get('skuName')} aligns with lead context and {bu_code} scope.",
                }
            )

    return proposals



def _session_to_envelope(state: GraphSessionState) -> SessionEnvelope:
    return SessionEnvelope(
        sessionId=state.request.sessionId,
        status=state.status,
        pendingStep=state.pending_step,
        agentMessages=state.agent_messages,
        draft=state.draft,
        finalResult=state.final_result,
        error=state.error,
    )



def start_graph_session(request: StartSessionRequest, settings: Settings) -> SessionEnvelope:
    lead_snapshot = get_lead_snapshot(request.leadId, settings)
    business_units = list_business_units(settings)
    constraints = get_routing_constraints()

    if not lead_snapshot.get("lead"):
        failed = GraphSessionState(
            request=request,
            status="FAILED",
            lead_snapshot=lead_snapshot,
            business_units=business_units,
            error="Lead snapshot not found.",
        )
        SESSION_STORE[request.sessionId] = failed
        return _session_to_envelope(failed)

    similar = find_similar_leads(_normalize_fact_map(lead_snapshot.get("facts", [])), settings)
    first_step = _new_step(
        "bu_selector",
        1,
        {
            "objective": "Select up to 3 business units for cross-sell.",
            "lead": lead_snapshot.get("lead"),
            "factsCount": len(lead_snapshot.get("facts", [])),
            "businessUnitCount": len(business_units),
            "similarLeadSignals": similar,
        },
    )

    state = GraphSessionState(
        request=request,
        status="PENDING_APPROVAL",
        lead_snapshot=lead_snapshot,
        business_units=business_units,
        pending_step=first_step,
        draft={
            "constraints": constraints,
            "similarLeads": similar,
        },
        agent_messages=[
            AgentMessage(
                agentId="synergy_coordinator",
                recipientId="bu_selector",
                messageType="DELEGATION_REQUEST",
                content="Requesting BU selection review for this lead.",
                evidenceRefs={"stepId": first_step.stepId, "threadId": request.threadId},
            )
        ],
    )

    SESSION_STORE[request.sessionId] = state
    return _session_to_envelope(state)



def apply_step_decision(
    session_id: str,
    step_id: str,
    decision: StepDecisionRequest,
    settings: Settings,
) -> SessionEnvelope:
    state = SESSION_STORE.get(session_id)
    if state is None:
        raise ValueError("Session not found.")

    pending = state.pending_step
    if pending is None or pending.stepId != step_id:
        raise ValueError("Pending delegation step not found.")

    state.agent_messages.append(
        AgentMessage(
            agentId="synergy_coordinator",
            recipientId=pending.subagentName,
            messageType="DELEGATION_DECISION",
            content=f"Synergy decision for {pending.subagentName}: {decision.decision}.",
            evidenceRefs={
                "stepId": pending.stepId,
                "reviewerId": decision.reviewerId,
                "reason": decision.reason or "",
            },
        )
    )

    if decision.decision == "REJECT":
        state.status = "REJECTED"
        state.pending_step = None
        state.error = decision.reason or f"Delegation rejected by {decision.reviewerId}."
        return _session_to_envelope(state)

    if pending.subagentName == "bu_selector":
        constraints = state.draft.get("constraints") or get_routing_constraints()
        recommendations = _maybe_model_bu_selection(
            state.lead_snapshot,
            state.business_units,
            constraints,
        )
        if recommendations is None:
            recommendations = _heuristic_bu_selection(
                state.lead_snapshot,
                state.business_units,
                constraints,
            )

        if not recommendations:
            state.status = "FAILED"
            state.pending_step = None
            state.error = "No eligible business unit recommendations generated."
            return _session_to_envelope(state)

        state.draft["buRecommendations"] = [item.model_dump() for item in recommendations]

        preview = [
            {
                "businessUnitCode": item.businessUnitCode,
                "role": item.role,
                "confidence": item.confidence,
            }
            for item in recommendations
        ]

        state.agent_messages.append(
            AgentMessage(
                agentId="bu_selector",
                recipientId="synergy_coordinator",
                messageType="BU_SELECTION_DRAFT",
                content="BU selector prepared draft recommendations.",
                evidenceRefs={"recommendations": preview},
            )
        )

        next_step = _new_step(
            "sku_selector",
            2,
            {
                "objective": "Select SKU proposals for approved business units.",
                "buRecommendations": preview,
            },
        )
        state.pending_step = next_step
        state.status = "PENDING_APPROVAL"
        return _session_to_envelope(state)

    if pending.subagentName == "sku_selector":
        bu_rows = state.draft.get("buRecommendations", [])
        bu_recommendations = [BuRecommendation.model_validate(item) for item in bu_rows]
        sku_rows = _build_sku_proposals(state.lead_snapshot, bu_recommendations, settings)

        if settings.enable_market_signal_tool:
            facts = _normalize_fact_map(state.lead_snapshot.get("facts", []))
            project_type = facts.get("project_type", "construction")
            market_signals = web_market_signal(
                f"Malaysia {project_type} construction demand trends",
                settings,
            )
            state.draft["marketSignals"] = market_signals

        summary_parts = [
            "Deep Agents completed BU and SKU delegation with human approvals.",
        ]
        if bu_recommendations:
            summary_parts.append(
                "Selected BUs: " + ", ".join([item.businessUnitCode for item in bu_recommendations])
            )

        final_result = FinalResult(
            summary=" ".join(summary_parts),
            buRecommendations=bu_recommendations,
            skuProposals=sku_rows,
            agentMessages=state.agent_messages
            + [
                AgentMessage(
                    agentId="sku_selector",
                    recipientId="synergy_coordinator",
                    messageType="SKU_SELECTION_DRAFT",
                    content="SKU selector finalized proposal set.",
                    evidenceRefs={"proposalCount": len(sku_rows)},
                )
            ],
        )

        for recommendation in bu_recommendations:
            profile = get_business_unit_profile(recommendation.businessUnitCode, settings)
            state.agent_messages.append(
                AgentMessage(
                    agentId=f"{recommendation.businessUnitCode.lower()}_agent",
                    recipientId="synergy_coordinator",
                    messageType="BU_PROPOSAL",
                    content=recommendation.reasonSummary,
                    evidenceRefs={"profile": profile},
                )
            )

        state.status = "COMPLETED"
        state.pending_step = None
        state.final_result = final_result
        return _session_to_envelope(state)

    state.status = "FAILED"
    state.pending_step = None
    state.error = f"Unsupported subagent: {pending.subagentName}."
    return _session_to_envelope(state)



def get_graph_session(session_id: str) -> SessionEnvelope:
    state = SESSION_STORE.get(session_id)
    if state is None:
        raise ValueError("Session not found.")
    return _session_to_envelope(state)

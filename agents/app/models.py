from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

SessionStatus = Literal[
    "IN_PROGRESS",
    "PENDING_APPROVAL",
    "COMPLETED",
    "REJECTED",
    "FAILED",
]
DecisionType = Literal["APPROVE", "REJECT"]


class AgentMessage(BaseModel):
    agentId: str
    recipientId: str | None = None
    messageType: str
    content: str
    evidenceRefs: dict[str, Any] = Field(default_factory=dict)


class BuRecommendation(BaseModel):
    businessUnitCode: str
    role: Literal["PRIMARY", "CROSS_SELL"]
    finalScore: float
    confidence: float
    reasonSummary: str


class SkuProposal(BaseModel):
    businessUnitCode: str
    buSkuId: str
    rank: int
    confidence: float
    rationale: str


class FinalResult(BaseModel):
    summary: str
    buRecommendations: list[BuRecommendation] = Field(default_factory=list)
    skuProposals: list[SkuProposal] = Field(default_factory=list)
    agentMessages: list[AgentMessage] = Field(default_factory=list)


class PendingStep(BaseModel):
    stepId: str
    stepIndex: int
    subagentName: str
    requestPayload: dict[str, Any] = Field(default_factory=dict)


class SessionEnvelope(BaseModel):
    sessionId: str
    status: SessionStatus
    pendingStep: PendingStep | None = None
    agentMessages: list[AgentMessage] = Field(default_factory=list)
    draft: dict[str, Any] = Field(default_factory=dict)
    finalResult: FinalResult | None = None
    error: str | None = None


class StartSessionRequest(BaseModel):
    sessionId: str
    routingRunId: str
    leadId: str
    triggeredBy: str
    threadId: str


class StepDecisionRequest(BaseModel):
    decision: DecisionType
    reviewerId: str
    reason: str | None = None

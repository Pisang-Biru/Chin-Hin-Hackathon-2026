import { randomUUID } from 'node:crypto'

import { prisma } from '@/db'
import type { RecommendationRole } from '@/generated/prisma/enums'
import type { DeterministicBuScore } from '@/lib/routing/deterministic-engine'
import {
  decideDeepAgentsStep,
  type DeepAgentsFinalResult,
  type DeepAgentsSessionEnvelope,
  startDeepAgentsSession,
} from '@/lib/swarm/deep-agents-client'
import { toRoutingSummaryStatus } from '@/lib/swarm/deep-agents-session'

export const DEEP_AGENTS_ENGINE_VERSION = 'deep-agents-v1'

export type DeepAgentsRoutingStatus = 'PENDING_APPROVAL' | 'COMPLETED'

export type DeepAgentsRoutingSummary = {
  routingRunId: string
  engineVersion: string
  leadId: string
  scoredBusinessUnits: number
  recommendationsCount: number
  assignmentCount: number
  scores: DeterministicBuScore[]
  status: DeepAgentsRoutingStatus
}

export type DeepAgentsRoutingEvent =
  | {
      type: 'AGENT_TYPING'
      leadId: string
      routingRunId: string
      businessUnitCode: string
      agentId: string
      recipientId: string | null
      messageType: string
      timestamp: string
    }
  | {
      type: 'AGENT_MESSAGE'
      leadId: string
      routingRunId: string
      businessUnitCode: string
      agentId: string
      recipientId: string | null
      messageType: string
      content: string
      evidenceRefs: Record<string, unknown>
      timestamp: string
    }
  | {
      type: 'DELEGATION_APPROVAL_REQUIRED'
      leadId: string
      routingRunId: string
      sessionId: string
      stepId: string
      stepIndex: number
      subagentName: string
      timestamp: string
    }
  | {
      type: 'DELEGATION_DECISION_APPLIED'
      leadId: string
      routingRunId: string
      sessionId: string
      stepId: string
      decision: 'APPROVED' | 'REJECTED'
      reviewerId: string
      timestamp: string
    }
  | {
      type: 'SESSION_PENDING'
      leadId: string
      routingRunId: string
      sessionId: string
      reason: string
      timestamp: string
    }

export type DelegationQueueItem = {
  stepId: string
  sessionId: string
  routingRunId: string
  leadId: string
  leadProjectName: string | null
  leadLocationText: string | null
  stepIndex: number
  subagentName: string
  stepStatus: string
  sessionStatus: string
  initiatedBy: string
  createdAt: Date
  requestPayload: Record<string, unknown>
}

type RunDeepAgentsRoutingInput = {
  leadId: string
  triggeredBy: string
  onEvent?: (event: DeepAgentsRoutingEvent) => Promise<void> | void
}

type HandleDelegationDecisionInput = {
  stepId: string
  status: 'APPROVED' | 'REJECTED'
  actedBy: string
  reason?: string
  onEvent?: (event: DeepAgentsRoutingEvent) => Promise<void> | void
}

type FinalizedResult = {
  recommendationsCount: number
  assignmentCount: number
  scoredBusinessUnits: number
}

function toDecimalString(value: number): string {
  return value.toFixed(4)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  if (value < 0) {
    return 0
  }
  if (value > 1) {
    return 1
  }
  return value
}

async function emitEvent(
  onEvent: RunDeepAgentsRoutingInput['onEvent'] | HandleDelegationDecisionInput['onEvent'],
  event: DeepAgentsRoutingEvent,
): Promise<void> {
  if (!onEvent) {
    return
  }

  try {
    await onEvent(event)
  } catch (error) {
    console.warn('[deep-agents.event.emit.failed]', {
      eventType: event.type,
      error: error instanceof Error ? error.message : 'Unknown event emit error',
    })
  }
}

function deriveBusinessUnitCode(agentId: string, recipientId: string | null): string {
  const source = [agentId, recipientId]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .find((value) => value.endsWith('_agent'))

  if (!source) {
    return 'SYSTEM'
  }

  return source.replace(/_agent$/i, '').toUpperCase()
}

async function emitSessionAgentMessages(input: {
  onEvent: RunDeepAgentsRoutingInput['onEvent'] | HandleDelegationDecisionInput['onEvent']
  leadId: string
  routingRunId: string
  messages: DeepAgentsSessionEnvelope['agentMessages']
}): Promise<void> {
  const recentMessages = input.messages.slice(-6)
  for (const message of recentMessages) {
    const businessUnitCode = deriveBusinessUnitCode(
      message.agentId,
      message.recipientId,
    )
    const timestamp = new Date().toISOString()

    await emitEvent(input.onEvent, {
      type: 'AGENT_TYPING',
      leadId: input.leadId,
      routingRunId: input.routingRunId,
      businessUnitCode,
      agentId: message.agentId,
      recipientId: message.recipientId,
      messageType: message.messageType,
      timestamp,
    })

    await emitEvent(input.onEvent, {
      type: 'AGENT_MESSAGE',
      leadId: input.leadId,
      routingRunId: input.routingRunId,
      businessUnitCode,
      agentId: message.agentId,
      recipientId: message.recipientId,
      messageType: message.messageType,
      content: message.content,
      evidenceRefs: message.evidenceRefs as Record<string, unknown>,
      timestamp,
    })
  }
}

async function upsertAgentSessionRecord(input: {
  id: string
  routingRunId: string
  leadId: string
  threadId: string
  status: string
  pendingStepId: string | null
  initiatedBy: string
  lastError: string | null
  completedAt?: Date | null
}): Promise<void> {
  const now = new Date()

  await prisma.$executeRaw`
    INSERT INTO "AgentSession" (
      "id",
      "routingRunId",
      "leadId",
      "threadId",
      "status",
      "pendingStepId",
      "initiatedBy",
      "lastError",
      "createdAt",
      "updatedAt",
      "completedAt"
    )
    VALUES (
      ${input.id},
      ${input.routingRunId},
      ${input.leadId},
      ${input.threadId},
      ${input.status}::"AgentSessionStatus",
      ${input.pendingStepId},
      ${input.initiatedBy},
      ${input.lastError},
      ${now},
      ${now},
      ${input.completedAt ?? null}
    )
    ON CONFLICT ("routingRunId")
    DO UPDATE SET
      "status" = EXCLUDED."status",
      "pendingStepId" = EXCLUDED."pendingStepId",
      "initiatedBy" = EXCLUDED."initiatedBy",
      "lastError" = EXCLUDED."lastError",
      "updatedAt" = EXCLUDED."updatedAt",
      "completedAt" = EXCLUDED."completedAt"
  `
}

async function upsertDelegationStepRecord(input: {
  id: string
  sessionId: string
  stepIndex: number
  subagentName: string
  status: string
  requestPayload: Record<string, unknown>
  decisionBy?: string | null
  decisionReason?: string | null
  decidedAt?: Date | null
  executedAt?: Date | null
  error?: string | null
}): Promise<void> {
  const now = new Date()

  await prisma.$executeRaw`
    INSERT INTO "AgentDelegationStep" (
      "id",
      "sessionId",
      "stepIndex",
      "subagentName",
      "status",
      "requestPayload",
      "decisionBy",
      "decisionReason",
      "decidedAt",
      "executedAt",
      "error",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${input.id},
      ${input.sessionId},
      ${input.stepIndex},
      ${input.subagentName},
      ${input.status}::"AgentDelegationStepStatus",
      ${input.requestPayload},
      ${input.decisionBy ?? null},
      ${input.decisionReason ?? null},
      ${input.decidedAt ?? null},
      ${input.executedAt ?? null},
      ${input.error ?? null},
      ${now},
      ${now}
    )
    ON CONFLICT ("sessionId", "stepIndex")
    DO UPDATE SET
      "status" = EXCLUDED."status",
      "requestPayload" = EXCLUDED."requestPayload",
      "decisionBy" = EXCLUDED."decisionBy",
      "decisionReason" = EXCLUDED."decisionReason",
      "decidedAt" = EXCLUDED."decidedAt",
      "executedAt" = EXCLUDED."executedAt",
      "error" = EXCLUDED."error",
      "updatedAt" = EXCLUDED."updatedAt"
  `
}

async function persistAgentMessages(
  routingRunId: string,
  messages: DeepAgentsSessionEnvelope['agentMessages'],
): Promise<void> {
  for (const message of messages) {
    await prisma.agentLog.create({
      data: {
        routingRunId,
        agentId: message.agentId,
        recipientId: message.recipientId,
        messageType: message.messageType,
        content: message.content,
        evidenceRefs: message.evidenceRefs as any,
      },
    })
  }
}

function toRole(value: unknown, fallback: RecommendationRole): RecommendationRole {
  if (value === 'PRIMARY' || value === 'CROSS_SELL') {
    return value
  }
  return fallback
}

async function persistCompletedFinalResult(input: {
  leadId: string
  routingRunId: string
  finalResult: DeepAgentsFinalResult
}): Promise<FinalizedResult> {
  const buCodes = [...new Set(input.finalResult.buRecommendations.map((item) => item.businessUnitCode))]
  const businessUnits = buCodes.length
    ? await prisma.businessUnit.findMany({
        where: {
          code: { in: buCodes },
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      })
    : []

  const buByCode = new Map(businessUnits.map((bu) => [bu.code, bu]))

  const skus = businessUnits.length
    ? await prisma.buSku.findMany({
        where: {
          businessUnitId: { in: businessUnits.map((bu) => bu.id) },
          isActive: true,
        },
        select: {
          id: true,
          businessUnitId: true,
        },
      })
    : []

  const skuById = new Map(skus.map((sku) => [sku.id, sku]))

  const recommendations = input.finalResult.buRecommendations
    .map((item, index) => {
      const bu = buByCode.get(item.businessUnitCode)
      if (!bu) {
        return null
      }
      return {
        businessUnit: bu,
        role: toRole(item.role, index === 0 ? 'PRIMARY' : 'CROSS_SELL'),
        finalScore: clamp01(item.finalScore),
        confidence: clamp01(item.confidence),
        reasonSummary: item.reasonSummary.trim() || 'Deep agents recommendation.',
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  return prisma.$transaction(async (tx) => {
    let recommendationsCount = 0
    let assignmentCount = 0

    for (const recommendation of recommendations) {
      const createdRecommendation = await tx.routingRecommendation.create({
        data: {
          routingRunId: input.routingRunId,
          businessUnitId: recommendation.businessUnit.id,
          role: recommendation.role,
          ruleScore: toDecimalString(recommendation.finalScore),
          finalScore: toDecimalString(recommendation.finalScore),
          confidence: toDecimalString(recommendation.confidence),
          reasonSummary: recommendation.reasonSummary,
        },
      })
      recommendationsCount += 1

      const existingActiveAssignment = await tx.assignment.findFirst({
        where: {
          leadId: input.leadId,
          businessUnitId: recommendation.businessUnit.id,
          status: {
            in: ['PENDING_SYNERGY', 'APPROVED', 'DISPATCHED'],
          },
        },
        select: { id: true },
      })

      if (!existingActiveAssignment) {
        await tx.assignment.create({
          data: {
            leadId: input.leadId,
            businessUnitId: recommendation.businessUnit.id,
            routingRecommendationId: createdRecommendation.id,
            assignedRole: recommendation.role,
            status: 'PENDING_SYNERGY',
            approvedBy: 'system:pending',
          },
        })
        assignmentCount += 1
      }

      const skuProposals = input.finalResult.skuProposals
        .filter((proposal) => proposal.businessUnitCode === recommendation.businessUnit.code)
        .sort((left, right) => left.rank - right.rank)
        .slice(0, 3)

      const usedRanks = new Set<number>()
      for (const proposal of skuProposals) {
        const sku = skuById.get(proposal.buSkuId)
        if (!sku || sku.businessUnitId !== recommendation.businessUnit.id) {
          continue
        }

        const rank = usedRanks.has(proposal.rank) ? usedRanks.size + 1 : proposal.rank
        usedRanks.add(rank)

        await tx.recommendationSku.create({
          data: {
            recommendationId: createdRecommendation.id,
            buSkuId: proposal.buSkuId,
            rank,
            confidence: toDecimalString(clamp01(proposal.confidence)),
            rationale: proposal.rationale,
          },
        })
      }
    }

    await tx.routingRun.update({
      where: { id: input.routingRunId },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
      },
    })

    await tx.lead.update({
      where: { id: input.leadId },
      data: {
        currentStatus: 'routed',
      },
    })

    return {
      recommendationsCount,
      assignmentCount,
      scoredBusinessUnits: recommendationsCount,
    }
  })
}

async function markRunFailed(input: {
  leadId: string
  routingRunId: string
  error: string
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.routingRun.update({
      where: { id: input.routingRunId },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
      },
    })

    await tx.lead.update({
      where: { id: input.leadId },
      data: {
        currentStatus: 'routing_failed',
      },
    })
  })
}

type StepLookupRow = {
  stepId: string
  sessionId: string
  stepIndex: number
  subagentName: string
  stepStatus: string
  requestPayload: Record<string, unknown> | null
  routingRunId: string
  leadId: string
  sessionStatus: string
  threadId: string
}

async function getStepLookup(stepId: string): Promise<StepLookupRow | null> {
  const rows = await prisma.$queryRaw<StepLookupRow[]>`
    SELECT
      step."id" AS "stepId",
      step."sessionId" AS "sessionId",
      step."stepIndex" AS "stepIndex",
      step."subagentName" AS "subagentName",
      step."status"::text AS "stepStatus",
      step."requestPayload" AS "requestPayload",
      session."routingRunId" AS "routingRunId",
      session."leadId" AS "leadId",
      session."status"::text AS "sessionStatus",
      session."threadId" AS "threadId"
    FROM "AgentDelegationStep" step
    INNER JOIN "AgentSession" session ON session."id" = step."sessionId"
    WHERE step."id" = ${stepId}
    LIMIT 1
  `

  return rows[0] ?? null
}

type DelegationListRow = {
  stepId: string
  sessionId: string
  routingRunId: string
  leadId: string
  leadProjectName: string | null
  leadLocationText: string | null
  stepIndex: number
  subagentName: string
  stepStatus: string
  sessionStatus: string
  initiatedBy: string
  createdAt: Date
  requestPayload: Record<string, unknown> | null
}

export async function listDeepAgentDelegations(
  status: 'PENDING' | 'ALL',
): Promise<DelegationQueueItem[]> {
  const rows = await prisma.$queryRaw<DelegationListRow[]>`
    SELECT
      step."id" AS "stepId",
      step."sessionId" AS "sessionId",
      session."routingRunId" AS "routingRunId",
      session."leadId" AS "leadId",
      lead."projectName" AS "leadProjectName",
      lead."locationText" AS "leadLocationText",
      step."stepIndex" AS "stepIndex",
      step."subagentName" AS "subagentName",
      step."status"::text AS "stepStatus",
      session."status"::text AS "sessionStatus",
      session."initiatedBy" AS "initiatedBy",
      step."createdAt" AS "createdAt",
      step."requestPayload" AS "requestPayload"
    FROM "AgentDelegationStep" step
    INNER JOIN "AgentSession" session ON session."id" = step."sessionId"
    INNER JOIN "Lead" lead ON lead."id" = session."leadId"
    WHERE ${status === 'ALL'}::boolean OR step."status" = 'PENDING'
    ORDER BY step."createdAt" DESC
  `

  return rows.map((row) => ({
    stepId: row.stepId,
    sessionId: row.sessionId,
    routingRunId: row.routingRunId,
    leadId: row.leadId,
    leadProjectName: row.leadProjectName,
    leadLocationText: row.leadLocationText,
    stepIndex: row.stepIndex,
    subagentName: row.subagentName,
    stepStatus: row.stepStatus,
    sessionStatus: row.sessionStatus,
    initiatedBy: row.initiatedBy,
    createdAt: row.createdAt,
    requestPayload: row.requestPayload ?? {},
  }))
}

async function applySessionEnvelope(input: {
  sessionId: string
  leadId: string
  routingRunId: string
  initiatedBy: string
  envelope: DeepAgentsSessionEnvelope
}): Promise<{
  status: DeepAgentsSessionEnvelope['status']
  recommendationsCount: number
  assignmentCount: number
  scoredBusinessUnits: number
}> {
  const { envelope, sessionId, leadId, routingRunId, initiatedBy } = input

  await upsertAgentSessionRecord({
    id: sessionId,
    routingRunId,
    leadId,
    threadId: `routing-${routingRunId}`,
    status: envelope.status,
    pendingStepId: envelope.pendingStep?.stepId ?? null,
    initiatedBy,
    lastError: envelope.error ?? null,
    completedAt: envelope.status === 'COMPLETED' ? new Date() : null,
  })

  if (envelope.pendingStep) {
    await upsertDelegationStepRecord({
      id: envelope.pendingStep.stepId,
      sessionId,
      stepIndex: envelope.pendingStep.stepIndex,
      subagentName: envelope.pendingStep.subagentName,
      status: 'PENDING',
      requestPayload: envelope.pendingStep.requestPayload,
    })
  }

  if (envelope.status === 'PENDING_APPROVAL') {
    await prisma.$transaction(async (tx) => {
      await tx.routingRun.update({
        where: { id: routingRunId },
        data: {
          status: 'PENDING',
          finishedAt: null,
        },
      })

      await tx.lead.update({
        where: { id: leadId },
        data: {
          currentStatus: 'routing_pending_approval',
        },
      })
    })

    return {
      status: envelope.status,
      recommendationsCount: 0,
      assignmentCount: 0,
      scoredBusinessUnits: 0,
    }
  }

  if (envelope.status === 'COMPLETED' && envelope.finalResult) {
    await persistAgentMessages(
      routingRunId,
      envelope.finalResult.agentMessages.length > 0
        ? envelope.finalResult.agentMessages
        : envelope.agentMessages,
    )

    const completed = await persistCompletedFinalResult({
      leadId,
      routingRunId,
      finalResult: envelope.finalResult,
    })

    return {
      status: envelope.status,
      recommendationsCount: completed.recommendationsCount,
      assignmentCount: completed.assignmentCount,
      scoredBusinessUnits: completed.scoredBusinessUnits,
    }
  }

  if (envelope.status === 'FAILED' || envelope.status === 'REJECTED') {
    await markRunFailed({
      leadId,
      routingRunId,
      error: envelope.error || `Deep agents session ended with status ${envelope.status}.`,
    })

    return {
      status: envelope.status,
      recommendationsCount: 0,
      assignmentCount: 0,
      scoredBusinessUnits: 0,
    }
  }

  return {
    status: envelope.status,
    recommendationsCount: 0,
    assignmentCount: 0,
    scoredBusinessUnits: 0,
  }
}

export async function runDeepAgentsRoutingForLead(
  input: RunDeepAgentsRoutingInput,
): Promise<DeepAgentsRoutingSummary> {
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true },
  })

  if (!lead) {
    throw new Error('Lead not found.')
  }

  const routingRun = await prisma.routingRun.create({
    data: {
      leadId: input.leadId,
      status: 'RUNNING',
      engineVersion: DEEP_AGENTS_ENGINE_VERSION,
    },
  })

  const sessionId = randomUUID()
  const threadId = `lead-${input.leadId}-routing-${routingRun.id}`

  const sessionEnvelope = await startDeepAgentsSession({
    sessionId,
    routingRunId: routingRun.id,
    leadId: input.leadId,
    triggeredBy: input.triggeredBy,
    threadId,
  })

  console.info('[deep-agents.session.start]', {
    leadId: input.leadId,
    routingRunId: routingRun.id,
    sessionId,
    status: sessionEnvelope.status,
    pendingStepId: sessionEnvelope.pendingStep?.stepId ?? null,
    pendingSubagent: sessionEnvelope.pendingStep?.subagentName ?? null,
    messageCount: sessionEnvelope.agentMessages.length,
    draftKeys: Object.keys(sessionEnvelope.draft || {}),
    error: sessionEnvelope.error ?? null,
  })

  await emitSessionAgentMessages({
    onEvent: input.onEvent,
    leadId: input.leadId,
    routingRunId: routingRun.id,
    messages: sessionEnvelope.agentMessages,
  })

  const applied = await applySessionEnvelope({
    sessionId,
    leadId: input.leadId,
    routingRunId: routingRun.id,
    initiatedBy: input.triggeredBy,
    envelope: sessionEnvelope,
  })

  if (sessionEnvelope.status === 'PENDING_APPROVAL' && sessionEnvelope.pendingStep) {
    const pendingDetails = JSON.stringify(
      sessionEnvelope.pendingStep.requestPayload,
      null,
      2,
    )
    await emitEvent(input.onEvent, {
      type: 'AGENT_MESSAGE',
      leadId: input.leadId,
      routingRunId: routingRun.id,
      businessUnitCode: 'SYSTEM',
      agentId: 'synergy_coordinator',
      recipientId: null,
      messageType: 'DELEGATION_DEBUG',
      content: `Pending ${sessionEnvelope.pendingStep.subagentName} (step ${sessionEnvelope.pendingStep.stepIndex}). Payload:\n${pendingDetails}`,
      evidenceRefs: {
        sessionId,
        stepId: sessionEnvelope.pendingStep.stepId,
      },
      timestamp: new Date().toISOString(),
    })

    await emitEvent(input.onEvent, {
      type: 'DELEGATION_APPROVAL_REQUIRED',
      leadId: input.leadId,
      routingRunId: routingRun.id,
      sessionId,
      stepId: sessionEnvelope.pendingStep.stepId,
      stepIndex: sessionEnvelope.pendingStep.stepIndex,
      subagentName: sessionEnvelope.pendingStep.subagentName,
      timestamp: new Date().toISOString(),
    })

    await emitEvent(input.onEvent, {
      type: 'SESSION_PENDING',
      leadId: input.leadId,
      routingRunId: routingRun.id,
      sessionId,
      reason:
        sessionEnvelope.error ||
        `Awaiting approval for ${sessionEnvelope.pendingStep.subagentName}. Open Synergy > Delegation Approvals to continue.`,
      timestamp: new Date().toISOString(),
    })

    console.info('[deep-agents.session.pending]', {
      leadId: input.leadId,
      routingRunId: routingRun.id,
      sessionId,
      stepId: sessionEnvelope.pendingStep.stepId,
      stepIndex: sessionEnvelope.pendingStep.stepIndex,
      subagentName: sessionEnvelope.pendingStep.subagentName,
      requestPayload: sessionEnvelope.pendingStep.requestPayload,
    })
  }

  if (sessionEnvelope.status === 'FAILED' || sessionEnvelope.status === 'REJECTED') {
    throw new Error(
      sessionEnvelope.error || `Deep agents session ended with ${sessionEnvelope.status}.`,
    )
  }

  return {
    routingRunId: routingRun.id,
    engineVersion: DEEP_AGENTS_ENGINE_VERSION,
    leadId: input.leadId,
    scoredBusinessUnits: applied.scoredBusinessUnits,
    recommendationsCount: applied.recommendationsCount,
    assignmentCount: applied.assignmentCount,
    scores: [],
    status: toRoutingSummaryStatus(applied.status),
  }
}

export async function handleDeepAgentDelegationDecision(
  input: HandleDelegationDecisionInput,
): Promise<{
  stepId: string
  sessionId: string
  routingRunId: string
  leadId: string
  sessionStatus: DeepAgentsSessionEnvelope['status']
  pendingStepId: string | null
  recommendationsCount: number
  assignmentCount: number
}> {
  const step = await getStepLookup(input.stepId)
  if (!step) {
    throw new Error('Delegation step not found.')
  }

  if (step.stepStatus !== 'PENDING') {
    throw new Error('Delegation step is no longer pending.')
  }

  const decision = input.status === 'APPROVED' ? 'APPROVE' : 'REJECT'
  const envelope = await decideDeepAgentsStep({
    sessionId: step.sessionId,
    stepId: step.stepId,
    decision,
    reviewerId: input.actedBy,
    reason: input.reason,
  })

  console.info('[deep-agents.session.decision]', {
    stepId: step.stepId,
    sessionId: step.sessionId,
    routingRunId: step.routingRunId,
    leadId: step.leadId,
    decision: input.status,
    actedBy: input.actedBy,
    nextStatus: envelope.status,
    nextPendingStepId: envelope.pendingStep?.stepId ?? null,
    nextPendingSubagent: envelope.pendingStep?.subagentName ?? null,
    error: envelope.error ?? null,
  })

  await emitSessionAgentMessages({
    onEvent: input.onEvent,
    leadId: step.leadId,
    routingRunId: step.routingRunId,
    messages: envelope.agentMessages,
  })

  const now = new Date()
  await upsertDelegationStepRecord({
    id: step.stepId,
    sessionId: step.sessionId,
    stepIndex: step.stepIndex,
    subagentName: step.subagentName,
    status: input.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
    requestPayload: step.requestPayload ?? {},
    decisionBy: input.actedBy,
    decisionReason: input.reason ?? null,
    decidedAt: now,
    executedAt: envelope.status === 'COMPLETED' ? now : null,
    error: envelope.error,
  })

  await emitEvent(input.onEvent, {
    type: 'DELEGATION_DECISION_APPLIED',
    leadId: step.leadId,
    routingRunId: step.routingRunId,
    sessionId: step.sessionId,
    stepId: step.stepId,
    decision: input.status,
    reviewerId: input.actedBy,
    timestamp: now.toISOString(),
  })

  const applied = await applySessionEnvelope({
    sessionId: step.sessionId,
    leadId: step.leadId,
    routingRunId: step.routingRunId,
    initiatedBy: input.actedBy,
    envelope,
  })

  if (envelope.status === 'PENDING_APPROVAL' && envelope.pendingStep) {
    const pendingDetails = JSON.stringify(envelope.pendingStep.requestPayload, null, 2)
    await emitEvent(input.onEvent, {
      type: 'AGENT_MESSAGE',
      leadId: step.leadId,
      routingRunId: step.routingRunId,
      businessUnitCode: 'SYSTEM',
      agentId: 'synergy_coordinator',
      recipientId: null,
      messageType: 'DELEGATION_DEBUG',
      content: `Next pending ${envelope.pendingStep.subagentName} (step ${envelope.pendingStep.stepIndex}). Payload:\n${pendingDetails}`,
      evidenceRefs: {
        sessionId: step.sessionId,
        stepId: envelope.pendingStep.stepId,
      },
      timestamp: new Date().toISOString(),
    })

    await emitEvent(input.onEvent, {
      type: 'DELEGATION_APPROVAL_REQUIRED',
      leadId: step.leadId,
      routingRunId: step.routingRunId,
      sessionId: step.sessionId,
      stepId: envelope.pendingStep.stepId,
      stepIndex: envelope.pendingStep.stepIndex,
      subagentName: envelope.pendingStep.subagentName,
      timestamp: new Date().toISOString(),
    })
  }

  if (envelope.status === 'FAILED' || envelope.status === 'REJECTED') {
    await emitEvent(input.onEvent, {
      type: 'SESSION_PENDING',
      leadId: step.leadId,
      routingRunId: step.routingRunId,
      sessionId: step.sessionId,
      reason: envelope.error || `Session ${envelope.status.toLowerCase()}.`,
      timestamp: new Date().toISOString(),
    })
  }

  return {
    stepId: step.stepId,
    sessionId: step.sessionId,
    routingRunId: step.routingRunId,
    leadId: step.leadId,
    sessionStatus: envelope.status,
    pendingStepId: envelope.pendingStep?.stepId ?? null,
    recommendationsCount: applied.recommendationsCount,
    assignmentCount: applied.assignmentCount,
  }
}

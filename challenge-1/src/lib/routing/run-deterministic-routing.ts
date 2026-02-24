import { prisma } from '@/db'
import type { RoutingRuleCondition } from '@/generated/prisma/models/RoutingRuleCondition'
import {
  rankDeterministicBuScores,
  scoreBusinessUnitsDeterministically,
} from '@/lib/routing/deterministic-engine'
import type {
  BuRuleSetInput,
  DeterministicBuScore,
} from '@/lib/routing/deterministic-engine'
import { orchestrateBuRecommendation } from '@/lib/swarm/agent-orchestration'
import type { BuOrchestrationOutput } from '@/lib/swarm/agent-orchestration'

const DETERMINISTIC_ENGINE_VERSION = 'deterministic-v1'
const ROUTING_AGENT_ID = 'synergy_deterministic_router'
const ROUTING_MESSAGE_TYPE = 'ROUTING_DECISION'

export type RoutingLiveEvent =
  | {
      type: 'ROUTING_STARTED'
      leadId: string
      triggeredBy: string
      routingRunId: string
      leadFactsCount: number
      activeRuleSetsCount: number
      timestamp: string
    }
  | {
      type: 'RECOMMENDATION_SELECTED'
      leadId: string
      routingRunId: string
      businessUnitId: string
      businessUnitCode: string
      businessUnitName: string
      role: string
      finalScore: number
      confidence: number
      reasonSummary: string
      timestamp: string
    }
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
      type: 'SKU_PROPOSALS'
      leadId: string
      routingRunId: string
      businessUnitCode: string
      proposals: Array<{
        buSkuId: string
        rank: number
        confidence: number
        rationale: string
      }>
      timestamp: string
    }
  | {
      type: 'ROUTING_COMPLETED'
      leadId: string
      routingRunId: string
      recommendationsCount: number
      assignmentCount: number
      scoredBusinessUnits: number
      timestamp: string
    }
  | {
      type: 'ROUTING_FAILED'
      leadId: string
      routingRunId: string
      error: string
      timestamp: string
    }

type RunDeterministicRoutingInput = {
  leadId: string
  triggeredBy: string
  previewDelayMs?: number
  onEvent?: (event: RoutingLiveEvent) => Promise<void> | void
}

type RoutingRunSummary = {
  routingRunId: string
  engineVersion: string
  leadId: string
  scoredBusinessUnits: number
  recommendationsCount: number
  assignmentCount: number
  scores: DeterministicBuScore[]
}

function toWeightNumber(weight: RoutingRuleCondition['weight']): number {
  const numeric = Number(weight.toString())
  return Number.isFinite(numeric) ? numeric : 0
}

function toDecimalString(value: number): string {
  return value.toFixed(4)
}

function sleep(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function emitRoutingEvent(
  onEvent: RunDeterministicRoutingInput['onEvent'],
  event: RoutingLiveEvent,
): Promise<void> {
  if (!onEvent) {
    return
  }

  try {
    await onEvent(event)
  } catch (error) {
    console.warn('[routing.live-event.emit.failed]', {
      eventType: event.type,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

function groupLatestActiveRuleSets(
  rows: Array<{
    id: string
    version: number
    businessUnitId: string
    businessUnit: { id: string; code: string; name: string }
    conditions: Array<{
      factKey: string
      operator: RoutingRuleCondition['operator']
      comparisonValue: string | null
      comparisonValues: unknown
      weight: RoutingRuleCondition['weight']
      isRequired: boolean
    }>
  }>,
): BuRuleSetInput[] {
  const byBusinessUnit = new Map<string, (typeof rows)[number]>()

  for (const row of rows) {
    const previous = byBusinessUnit.get(row.businessUnitId)
    if (!previous || row.version > previous.version) {
      byBusinessUnit.set(row.businessUnitId, row)
    }
  }

  return [...byBusinessUnit.values()].map((row) => ({
    businessUnitId: row.businessUnit.id,
    businessUnitCode: row.businessUnit.code,
    businessUnitName: row.businessUnit.name,
    conditions: row.conditions.map((condition) => ({
      factKey: condition.factKey,
      operator: condition.operator,
      comparisonValue: condition.comparisonValue,
      comparisonValues: condition.comparisonValues,
      weight: toWeightNumber(condition.weight),
      isRequired: condition.isRequired,
    })),
  }))
}

export async function runDeterministicRoutingForLead(
  input: RunDeterministicRoutingInput,
): Promise<RoutingRunSummary> {
  const { leadId, triggeredBy, previewDelayMs = 0, onEvent } = input

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true },
  })

  if (!lead) {
    throw new Error('Lead not found.')
  }

  const [leadFacts, activeRuleSetRows] = await Promise.all([
    prisma.leadFact.findMany({
      where: { leadId },
      select: { factKey: true, factValue: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.routingRuleSet.findMany({
      where: {
        status: 'ACTIVE',
        businessUnit: { isActive: true },
      },
      include: {
        businessUnit: {
          select: { id: true, code: true, name: true },
        },
        conditions: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ businessUnitId: 'asc' }, { version: 'desc' }],
    }),
  ])

  const activeRuleSets = groupLatestActiveRuleSets(activeRuleSetRows)
  const scores = scoreBusinessUnitsDeterministically(leadFacts, activeRuleSets)
  const ranked = rankDeterministicBuScores(scores)

  const routingRun = await prisma.routingRun.create({
    data: {
      leadId,
      status: 'RUNNING',
      engineVersion: DETERMINISTIC_ENGINE_VERSION,
    },
  })

  await emitRoutingEvent(onEvent, {
    type: 'ROUTING_STARTED',
    leadId,
    triggeredBy,
    routingRunId: routingRun.id,
    leadFactsCount: leadFacts.length,
    activeRuleSetsCount: activeRuleSets.length,
    timestamp: new Date().toISOString(),
  })

  const businessUnitIds = [...new Set(ranked.map((entry) => entry.businessUnitId))]
  const activeSkus = businessUnitIds.length
    ? await prisma.buSku.findMany({
        where: {
          businessUnitId: { in: businessUnitIds },
          isActive: true,
        },
        orderBy: [{ businessUnitId: 'asc' }, { skuCode: 'asc' }],
        select: {
          id: true,
          businessUnitId: true,
          skuCode: true,
          skuName: true,
          skuCategory: true,
        },
      })
    : []

  const skuByBusinessUnit = new Map<string, typeof activeSkus>()
  for (const sku of activeSkus) {
    const existing = skuByBusinessUnit.get(sku.businessUnitId)
    if (existing) {
      existing.push(sku)
    } else {
      skuByBusinessUnit.set(sku.businessUnitId, [sku])
    }
  }

  const orchestrationByBusinessUnit = new Map<string, BuOrchestrationOutput>()
  for (const recommendation of ranked) {
    const orchestration = await orchestrateBuRecommendation(
      {
        businessUnitId: recommendation.businessUnitId,
        businessUnitCode: recommendation.businessUnitCode,
        businessUnitName: recommendation.businessUnitName,
        role: recommendation.role,
        finalScore: recommendation.finalScore,
        confidence: recommendation.confidence,
        deterministicReason: recommendation.reasonSummary,
        availableSkus: skuByBusinessUnit.get(recommendation.businessUnitId) ?? [],
      },
      leadFacts,
    )

    orchestrationByBusinessUnit.set(recommendation.businessUnitId, orchestration)

    await emitRoutingEvent(onEvent, {
      type: 'RECOMMENDATION_SELECTED',
      leadId,
      routingRunId: routingRun.id,
      businessUnitId: recommendation.businessUnitId,
      businessUnitCode: recommendation.businessUnitCode,
      businessUnitName: recommendation.businessUnitName,
      role: recommendation.role,
      finalScore: recommendation.finalScore,
      confidence: recommendation.confidence,
      reasonSummary: recommendation.reasonSummary,
      timestamp: new Date().toISOString(),
    })

    for (const message of orchestration.agentMessages) {
      await emitRoutingEvent(onEvent, {
        type: 'AGENT_TYPING',
        leadId,
        routingRunId: routingRun.id,
        businessUnitCode: recommendation.businessUnitCode,
        agentId: message.agentId,
        recipientId: message.recipientId,
        messageType: message.messageType,
        timestamp: new Date().toISOString(),
      })
      await sleep(previewDelayMs)

      await emitRoutingEvent(onEvent, {
        type: 'AGENT_MESSAGE',
        leadId,
        routingRunId: routingRun.id,
        businessUnitCode: recommendation.businessUnitCode,
        agentId: message.agentId,
        recipientId: message.recipientId,
        messageType: message.messageType,
        content: message.content,
        evidenceRefs: message.evidenceRefs,
        timestamp: new Date().toISOString(),
      })
      await sleep(Math.max(Math.floor(previewDelayMs * 0.35), 80))
    }

    await emitRoutingEvent(onEvent, {
      type: 'SKU_PROPOSALS',
      leadId,
      routingRunId: routingRun.id,
      businessUnitCode: recommendation.businessUnitCode,
      proposals: orchestration.skuProposals,
      timestamp: new Date().toISOString(),
    })
  }

  try {
    const run = await prisma.$transaction(async (tx) => {
      let recommendationsCount = 0
      let assignmentCount = 0

      for (const recommendation of ranked) {
        const createdRecommendation = await tx.routingRecommendation.create({
          data: {
            routingRunId: routingRun.id,
            businessUnitId: recommendation.businessUnitId,
            role: recommendation.role,
            ruleScore: toDecimalString(recommendation.ruleScore),
            finalScore: toDecimalString(recommendation.finalScore),
            confidence: toDecimalString(recommendation.confidence),
            reasonSummary: recommendation.reasonSummary,
          },
        })
        recommendationsCount += 1

        const existingActiveAssignment = await tx.assignment.findFirst({
          where: {
            leadId,
            businessUnitId: recommendation.businessUnitId,
            status: {
              in: ['APPROVED', 'DISPATCHED'],
            },
          },
          select: { id: true },
        })

        if (!existingActiveAssignment) {
          await tx.assignment.create({
            data: {
              leadId,
              businessUnitId: recommendation.businessUnitId,
              routingRecommendationId: createdRecommendation.id,
              assignedRole: recommendation.role,
              approvedBy: triggeredBy,
            },
          })
          assignmentCount += 1
        }

        const orchestration = orchestrationByBusinessUnit.get(recommendation.businessUnitId)
        if (!orchestration) {
          continue
        }

        await tx.routingRecommendation.update({
          where: { id: createdRecommendation.id },
          data: {
            reasonSummary: orchestration.summary,
          },
        })

        for (const proposal of orchestration.skuProposals) {
          await tx.recommendationSku.create({
            data: {
              recommendationId: createdRecommendation.id,
              buSkuId: proposal.buSkuId,
              rank: proposal.rank,
              confidence: toDecimalString(proposal.confidence),
              rationale: proposal.rationale,
            },
          })
        }

        for (const message of orchestration.agentMessages) {
          await tx.agentLog.create({
            data: {
              routingRunId: routingRun.id,
              agentId: message.agentId,
              recipientId: message.recipientId,
              messageType: message.messageType,
              content: message.content,
              evidenceRefs: message.evidenceRefs,
            },
          })
        }
      }

      await tx.agentLog.create({
        data: {
          routingRunId: routingRun.id,
          agentId: ROUTING_AGENT_ID,
          messageType: ROUTING_MESSAGE_TYPE,
          content: `Deterministic routing completed. Selected ${ranked.length} of ${scores.length} business units.`,
          evidenceRefs: {
            leadFacts: leadFacts.length,
            selectedBusinessUnitCodes: ranked.map((entry) => entry.businessUnitCode),
          },
        },
      })

      await tx.routingRun.update({
        where: { id: routingRun.id },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
        },
      })

      await tx.lead.update({
        where: { id: leadId },
        data: {
          currentStatus: 'routed',
        },
      })

      return {
        routingRunId: routingRun.id,
        recommendationsCount,
        assignmentCount,
      }
    })

    await emitRoutingEvent(onEvent, {
      type: 'ROUTING_COMPLETED',
      leadId,
      routingRunId: run.routingRunId,
      recommendationsCount: run.recommendationsCount,
      assignmentCount: run.assignmentCount,
      scoredBusinessUnits: scores.length,
      timestamp: new Date().toISOString(),
    })

    console.info('[routing.run.completed]', {
      leadId,
      triggeredBy,
      routingRunId: run.routingRunId,
      scoredBusinessUnits: scores.length,
      recommendationsCount: run.recommendationsCount,
      assignmentCount: run.assignmentCount,
    })

    return {
      routingRunId: run.routingRunId,
      engineVersion: DETERMINISTIC_ENGINE_VERSION,
      leadId,
      scoredBusinessUnits: scores.length,
      recommendationsCount: run.recommendationsCount,
      assignmentCount: run.assignmentCount,
      scores,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown routing error'

    await prisma.routingRun.update({
      where: { id: routingRun.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
      },
    })

    await emitRoutingEvent(onEvent, {
      type: 'ROUTING_FAILED',
      leadId,
      routingRunId: routingRun.id,
      error: message,
      timestamp: new Date().toISOString(),
    })

    throw error
  }
}

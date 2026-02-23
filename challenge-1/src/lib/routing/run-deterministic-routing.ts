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

const DETERMINISTIC_ENGINE_VERSION = 'deterministic-v1'
const ROUTING_AGENT_ID = 'synergy_deterministic_router'
const ROUTING_MESSAGE_TYPE = 'ROUTING_DECISION'

type RunDeterministicRoutingInput = {
  leadId: string
  triggeredBy: string
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
  const { leadId, triggeredBy } = input

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

  const run = await prisma.$transaction(async (tx) => {
    const routingRun = await tx.routingRun.create({
      data: {
        leadId,
        status: 'RUNNING',
        engineVersion: DETERMINISTIC_ENGINE_VERSION,
      },
    })

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

      const orchestration = orchestrateBuRecommendation(
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
}

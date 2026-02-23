import type { RecommendationRole } from '@/generated/prisma/enums'

type LeadFactInput = {
  factKey: string
  factValue: string
}

type BuSkuInput = {
  id: string
  skuCode: string
  skuName: string
  skuCategory: string | null
}

type BuRecommendationInput = {
  businessUnitId: string
  businessUnitCode: string
  businessUnitName: string
  role: RecommendationRole
  finalScore: number
  confidence: number
  deterministicReason: string
  availableSkus: BuSkuInput[]
}

export type SwarmSkuProposal = {
  buSkuId: string
  rank: number
  confidence: number
  rationale: string
}

export type BuOrchestrationOutput = {
  summary: string
  skuProposals: SwarmSkuProposal[]
  agentMessages: Array<{
    agentId: string
    recipientId: string | null
    messageType: string
    content: string
    evidenceRefs: Record<string, unknown>
  }>
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function titleize(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getFactValues(facts: LeadFactInput[], key: string): string[] {
  return facts.filter((fact) => fact.factKey === key).map((fact) => fact.factValue)
}

function computeBuIntentSignal(
  businessUnitCode: string,
  facts: LeadFactInput[],
): {
  scoreBoost: number
  reasons: string[]
} {
  const projectType = getFactValues(facts, 'project_type').map(normalize)
  const stage = getFactValues(facts, 'project_stage').map(normalize)
  const developmentType = getFactValues(facts, 'development_type').map(normalize)

  const reasons: string[] = []
  let scoreBoost = 0

  if (businessUnitCode === 'GCAST') {
    if (projectType.includes('infrastructure')) {
      scoreBoost += 0.15
      reasons.push('Infrastructure project aligns with precast solutions.')
    }
  }

  if (businessUnitCode === 'SAG') {
    if (developmentType.includes('fit_out') || developmentType.includes('refurbishment')) {
      scoreBoost += 0.16
      reasons.push('Fit-out/refurbishment needs align with SAG scope.')
    }
  }

  if (businessUnitCode === 'MAKNA') {
    if (stage.includes('construction') || stage.includes('tender')) {
      scoreBoost += 0.12
      reasons.push('Tender/construction stage favors design-build participation.')
    }
  }

  if (businessUnitCode === 'STARKEN_AAC') {
    if (projectType.includes('residential') || projectType.includes('commercial')) {
      scoreBoost += 0.11
      reasons.push('Residential/commercial envelope suits AAC offerings.')
    }
  }

  if (businessUnitCode === 'STARKEN_DRYMIX') {
    if (developmentType.length > 0) {
      scoreBoost += 0.1
      reasons.push('Finishing scope suggests drymix demand potential.')
    }
  }

  return { scoreBoost, reasons }
}

function computeSkuRelevance(
  businessUnitCode: string,
  sku: BuSkuInput,
  facts: LeadFactInput[],
): {
  score: number
  reasons: string[]
} {
  const projectType = getFactValues(facts, 'project_type').map(normalize)
  const developmentType = getFactValues(facts, 'development_type').map(normalize)
  const stage = getFactValues(facts, 'project_stage').map(normalize)

  let score = 0.45
  const reasons: string[] = []
  const name = normalize(`${sku.skuCode} ${sku.skuName} ${sku.skuCategory || ''}`)

  if (businessUnitCode === 'GCAST' && /drain|manhole|precast|infrastructure/.test(name)) {
    score += 0.3
    reasons.push('SKU targets infrastructure/civil package.')
  }

  if (businessUnitCode === 'SAG' && /fit|interior|project management|pm/.test(name)) {
    score += 0.28
    reasons.push('SKU aligns with interior fit-out delivery.')
  }

  if (businessUnitCode === 'STARKEN_AAC' && /aac|block|panel/.test(name)) {
    score += 0.27
    reasons.push('AAC-based wall system relevant to structural envelope.')
  }

  if (businessUnitCode === 'STARKEN_DRYMIX' && /drymix|render|skim/.test(name)) {
    score += 0.27
    reasons.push('Drymix finish products match finishing scope.')
  }

  if (businessUnitCode === 'MAKNA' && /design|build|infrastructure|works/.test(name)) {
    score += 0.25
    reasons.push('Design-build/infrastructure package fit.')
  }

  if (projectType.includes('infrastructure') && /infrastructure|drain|manhole/.test(name)) {
    score += 0.08
  }

  if (
    (developmentType.includes('fit_out') || developmentType.includes('refurbishment')) &&
    /fit|interior|render|skim/.test(name)
  ) {
    score += 0.08
  }

  if (stage.includes('construction') || stage.includes('tender')) {
    score += 0.04
  }

  return { score: Math.min(score, 0.98), reasons }
}

function toContextSummary(facts: LeadFactInput[]): string {
  const projectType = getFactValues(facts, 'project_type')[0]
  const stage = getFactValues(facts, 'project_stage')[0]
  const developmentType = getFactValues(facts, 'development_type')[0]
  const region = getFactValues(facts, 'region')[0]
  const valueBand = getFactValues(facts, 'project_value_band')[0]
  const startYear = getFactValues(facts, 'construction_start_year')[0]
  const endYear = getFactValues(facts, 'construction_end_year')[0]

  const parts: string[] = []
  if (projectType) {
    parts.push(`Project: ${titleize(projectType)}`)
  }
  if (stage) {
    parts.push(`Stage: ${titleize(stage)}`)
  }
  if (developmentType) {
    parts.push(`Type: ${titleize(developmentType)}`)
  }
  if (region) {
    parts.push(`Region: ${titleize(region)}`)
  }
  if (valueBand) {
    parts.push(`Value Band: ${titleize(valueBand)}`)
  }
  if (startYear && endYear) {
    parts.push(`Timeline: ${startYear}-${endYear}`)
  } else if (startYear) {
    parts.push(`Timeline: ${startYear}`)
  }

  return parts.join(' | ')
}

export function orchestrateBuRecommendation(
  recommendation: BuRecommendationInput,
  leadFacts: LeadFactInput[],
): BuOrchestrationOutput {
  const contextSummary = toContextSummary(leadFacts)
  const buIntent = computeBuIntentSignal(recommendation.businessUnitCode, leadFacts)

  const proposals = recommendation.availableSkus
    .map((sku) => {
      const relevance = computeSkuRelevance(recommendation.businessUnitCode, sku, leadFacts)
      const confidence = Math.max(
        Math.min(recommendation.finalScore + buIntent.scoreBoost * 0.5 + relevance.score * 0.25, 0.99),
        0.1,
      )

      return {
        sku,
        confidence,
        reasons: relevance.reasons,
      }
    })
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3)

  const skuProposals: SwarmSkuProposal[] = proposals.map((proposal, index) => ({
    buSkuId: proposal.sku.id,
    rank: index + 1,
    confidence: Math.round(proposal.confidence * 10_000) / 10_000,
    rationale:
      proposal.reasons.length > 0
        ? proposal.reasons.join(' ')
        : `Selected by ${recommendation.businessUnitCode} agent based on project fit.`,
  }))

  const summaryParts = [
    `${recommendation.businessUnitName} (${recommendation.role}) score ${recommendation.finalScore.toFixed(2)}.`,
    recommendation.deterministicReason,
  ]
  if (buIntent.reasons.length > 0) {
    summaryParts.push(buIntent.reasons.join(' '))
  }
  if (contextSummary) {
    summaryParts.push(`Lead context: ${contextSummary}.`)
  }

  const summary = summaryParts.join(' ')

  const agentMessages: BuOrchestrationOutput['agentMessages'] = [
    {
      agentId: 'synergy_router',
      recipientId: `${recommendation.businessUnitCode.toLowerCase()}_agent`,
      messageType: 'ROUTING_CONTEXT',
      content: `Review lead for ${recommendation.businessUnitName}. ${contextSummary}`,
      evidenceRefs: {
        businessUnitId: recommendation.businessUnitId,
        role: recommendation.role,
        finalScore: recommendation.finalScore,
      },
    },
    {
      agentId: `${recommendation.businessUnitCode.toLowerCase()}_agent`,
      recipientId: 'synergy_router',
      messageType: 'BU_PROPOSAL',
      content: summary,
      evidenceRefs: {
        topSkuIds: skuProposals.map((proposal) => proposal.buSkuId),
        confidence: recommendation.confidence,
      },
    },
  ]

  return {
    summary,
    skuProposals,
    agentMessages,
  }
}

import type { RecommendationRole, RuleOperator } from '@/generated/prisma/enums'

export type LeadFactInput = {
  factKey: string
  factValue: string
}

export type RuleConditionInput = {
  factKey: string
  operator: RuleOperator
  comparisonValue?: string | null
  comparisonValues?: unknown
  weight: number
  isRequired: boolean
}

export type BuRuleSetInput = {
  businessUnitId: string
  businessUnitCode: string
  businessUnitName: string
  conditions: RuleConditionInput[]
}

export type DeterministicBuScore = {
  businessUnitId: string
  businessUnitCode: string
  businessUnitName: string
  matchedConditions: number
  totalConditions: number
  matchedRequired: number
  totalRequired: number
  missingRequiredKeys: string[]
  qualified: boolean
  ruleScore: number
  finalScore: number
  confidence: number
  reasonSummary: string
}

export type RankedBuRecommendation = DeterministicBuScore & {
  role: RecommendationRole
  rank: number
}

type RankOptions = {
  maxCrossSell: number
  minCrossSellScore: number
}

const DEFAULT_RANK_OPTIONS: RankOptions = {
  maxCrossSell: 2,
  minCrossSellScore: 0.35,
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase()
}

function round4(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.round(value * 10_000) / 10_000
}

function parseNumeric(value: string): number | null {
  const cleaned = value.replace(/,/g, '').trim()
  if (!cleaned) {
    return null
  }

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function readComparisonValues(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.filter((item) => typeof item === 'string')
}

function evaluateCondition(
  condition: RuleConditionInput,
  factMap: Map<string, string[]>,
): boolean {
  const factValues = factMap.get(condition.factKey) ?? []
  const normalizedFacts = factValues.map(normalizeValue)
  const comparison = condition.comparisonValue ? normalizeValue(condition.comparisonValue) : ''
  const comparisonSet = new Set(
    readComparisonValues(condition.comparisonValues).map(normalizeValue),
  )

  if (condition.operator === 'EXISTS') {
    return normalizedFacts.length > 0
  }

  if (condition.operator === 'EQ') {
    if (!comparison || normalizedFacts.length === 0) {
      return false
    }
    return normalizedFacts.some((value) => value === comparison)
  }

  if (condition.operator === 'IN') {
    if (comparisonSet.size === 0 || normalizedFacts.length === 0) {
      return false
    }
    return normalizedFacts.some((value) => comparisonSet.has(value))
  }

  if (condition.operator === 'NOT_IN') {
    if (comparisonSet.size === 0 || normalizedFacts.length === 0) {
      return false
    }
    return normalizedFacts.every((value) => !comparisonSet.has(value))
  }

  if (!comparison || normalizedFacts.length === 0) {
    return false
  }

  const threshold = parseNumeric(comparison)
  if (threshold === null) {
    return false
  }

  for (const fact of normalizedFacts) {
    const numericFact = parseNumeric(fact)
    if (numericFact === null) {
      continue
    }

    if (condition.operator === 'GT' && numericFact > threshold) {
      return true
    }
    if (condition.operator === 'GTE' && numericFact >= threshold) {
      return true
    }
    if (condition.operator === 'LT' && numericFact < threshold) {
      return true
    }
    if (condition.operator === 'LTE' && numericFact <= threshold) {
      return true
    }
  }

  return false
}

function buildReasonSummary(
  matchedConditions: number,
  totalConditions: number,
  matchedRequired: number,
  totalRequired: number,
  missingRequiredKeys: string[],
): string {
  if (missingRequiredKeys.length > 0) {
    return `Matched ${matchedConditions}/${totalConditions} conditions; required ${matchedRequired}/${totalRequired}. Missing required: ${missingRequiredKeys.join(', ')}.`
  }

  return `Matched ${matchedConditions}/${totalConditions} conditions; required ${matchedRequired}/${totalRequired}.`
}

function toFactMap(facts: LeadFactInput[]): Map<string, string[]> {
  const map = new Map<string, string[]>()

  for (const fact of facts) {
    const existing = map.get(fact.factKey)
    if (existing) {
      existing.push(fact.factValue)
      continue
    }
    map.set(fact.factKey, [fact.factValue])
  }

  return map
}

export function scoreBusinessUnitsDeterministically(
  leadFacts: LeadFactInput[],
  ruleSets: BuRuleSetInput[],
): DeterministicBuScore[] {
  const factMap = toFactMap(leadFacts)

  return ruleSets.map((ruleSet) => {
    let totalWeight = 0
    let matchedWeight = 0
    let matchedConditions = 0
    let matchedRequired = 0
    let totalRequired = 0
    const missingRequiredKeys: string[] = []

    for (const condition of ruleSet.conditions) {
      const weight = Math.max(0, condition.weight)
      totalWeight += weight

      if (condition.isRequired) {
        totalRequired += 1
      }

      const matched = evaluateCondition(condition, factMap)
      if (matched) {
        matchedConditions += 1
        matchedWeight += weight
        if (condition.isRequired) {
          matchedRequired += 1
        }
        continue
      }

      if (condition.isRequired) {
        missingRequiredKeys.push(condition.factKey)
      }
    }

    const qualified = missingRequiredKeys.length === 0
    const totalConditions = ruleSet.conditions.length
    const ruleScore = totalWeight > 0 ? matchedWeight / totalWeight : 0
    const finalScore = qualified ? ruleScore : 0
    const requiredRatio = totalRequired > 0 ? matchedRequired / totalRequired : 1
    const confidence = qualified ? (ruleScore + requiredRatio) / 2 : requiredRatio * 0.25

    return {
      businessUnitId: ruleSet.businessUnitId,
      businessUnitCode: ruleSet.businessUnitCode,
      businessUnitName: ruleSet.businessUnitName,
      matchedConditions,
      totalConditions,
      matchedRequired,
      totalRequired,
      missingRequiredKeys,
      qualified,
      ruleScore: round4(ruleScore),
      finalScore: round4(finalScore),
      confidence: round4(confidence),
      reasonSummary: buildReasonSummary(
        matchedConditions,
        totalConditions,
        matchedRequired,
        totalRequired,
        missingRequiredKeys,
      ),
    }
  })
}

export function rankDeterministicBuScores(
  scores: DeterministicBuScore[],
  options?: Partial<RankOptions>,
): RankedBuRecommendation[] {
  const config: RankOptions = {
    ...DEFAULT_RANK_OPTIONS,
    ...options,
  }

  const ranked = scores
    .filter((score) => score.qualified && score.finalScore > 0)
    .sort((left, right) => {
      if (left.finalScore !== right.finalScore) {
        return right.finalScore - left.finalScore
      }
      if (left.matchedRequired !== right.matchedRequired) {
        return right.matchedRequired - left.matchedRequired
      }
      if (left.matchedConditions !== right.matchedConditions) {
        return right.matchedConditions - left.matchedConditions
      }
      return left.businessUnitCode.localeCompare(right.businessUnitCode)
    })

  const output: RankedBuRecommendation[] = []

  for (const [index, score] of ranked.entries()) {
    if (index === 0) {
      output.push({
        ...score,
        role: 'PRIMARY',
        rank: output.length + 1,
      })
      continue
    }

    if (score.finalScore < config.minCrossSellScore) {
      continue
    }

    const crossSellCount = output.filter((entry) => entry.role === 'CROSS_SELL').length
    if (crossSellCount >= config.maxCrossSell) {
      continue
    }

    output.push({
      ...score,
      role: 'CROSS_SELL',
      rank: output.length + 1,
    })
  }

  return output
}

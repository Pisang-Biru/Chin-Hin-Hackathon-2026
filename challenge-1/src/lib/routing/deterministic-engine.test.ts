import { describe, expect, it } from 'vitest'

import {
  rankDeterministicBuScores,
  scoreBusinessUnitsDeterministically,
} from './deterministic-engine'
import type { BuRuleSetInput } from './deterministic-engine'

function buildRuleSet(overrides: Partial<BuRuleSetInput>): BuRuleSetInput {
  return {
    businessUnitId: 'bu-1',
    businessUnitCode: 'BU1',
    businessUnitName: 'Business Unit 1',
    conditions: [],
    ...overrides,
  }
}

describe('scoreBusinessUnitsDeterministically', () => {
  it('scores matched conditions with required gating', () => {
    const scores = scoreBusinessUnitsDeterministically(
      [
        { factKey: 'project_type', factValue: 'residential' },
        { factKey: 'project_stage', factValue: 'tender' },
        { factKey: 'construction_start_year', factValue: '2026' },
      ],
      [
        buildRuleSet({
          conditions: [
            {
              factKey: 'project_type',
              operator: 'IN',
              comparisonValues: ['residential', 'commercial'],
              weight: 0.4,
              isRequired: true,
            },
            {
              factKey: 'project_stage',
              operator: 'EQ',
              comparisonValue: 'tender',
              weight: 0.3,
              isRequired: true,
            },
            {
              factKey: 'construction_start_year',
              operator: 'GTE',
              comparisonValue: '2025',
              weight: 0.3,
              isRequired: false,
            },
          ],
        }),
      ],
    )

    expect(scores).toHaveLength(1)
    expect(scores[0].qualified).toBe(true)
    expect(scores[0].ruleScore).toBe(1)
    expect(scores[0].finalScore).toBe(1)
    expect(scores[0].matchedRequired).toBe(2)
    expect(scores[0].missingRequiredKeys).toEqual([])
  })

  it('disqualifies BU when required condition is missing', () => {
    const scores = scoreBusinessUnitsDeterministically(
      [{ factKey: 'project_type', factValue: 'industrial' }],
      [
        buildRuleSet({
          conditions: [
            {
              factKey: 'project_type',
              operator: 'EQ',
              comparisonValue: 'industrial',
              weight: 0.5,
              isRequired: true,
            },
            {
              factKey: 'region',
              operator: 'EXISTS',
              weight: 0.5,
              isRequired: true,
            },
          ],
        }),
      ],
    )

    expect(scores[0].qualified).toBe(false)
    expect(scores[0].finalScore).toBe(0)
    expect(scores[0].missingRequiredKeys).toEqual(['region'])
  })
})

describe('rankDeterministicBuScores', () => {
  it('returns deterministic order and role assignment', () => {
    const ranked = rankDeterministicBuScores([
      {
        businessUnitId: 'a',
        businessUnitCode: 'AAA',
        businessUnitName: 'A',
        matchedConditions: 5,
        totalConditions: 6,
        matchedRequired: 3,
        totalRequired: 3,
        missingRequiredKeys: [],
        qualified: true,
        ruleScore: 0.88,
        finalScore: 0.88,
        confidence: 0.9,
        reasonSummary: '',
      },
      {
        businessUnitId: 'b',
        businessUnitCode: 'BBB',
        businessUnitName: 'B',
        matchedConditions: 4,
        totalConditions: 6,
        matchedRequired: 3,
        totalRequired: 3,
        missingRequiredKeys: [],
        qualified: true,
        ruleScore: 0.72,
        finalScore: 0.72,
        confidence: 0.8,
        reasonSummary: '',
      },
      {
        businessUnitId: 'c',
        businessUnitCode: 'CCC',
        businessUnitName: 'C',
        matchedConditions: 4,
        totalConditions: 6,
        matchedRequired: 3,
        totalRequired: 3,
        missingRequiredKeys: [],
        qualified: true,
        ruleScore: 0.2,
        finalScore: 0.2,
        confidence: 0.7,
        reasonSummary: '',
      },
    ])

    expect(ranked).toHaveLength(2)
    expect(ranked[0].businessUnitCode).toBe('AAA')
    expect(ranked[0].role).toBe('PRIMARY')
    expect(ranked[1].businessUnitCode).toBe('BBB')
    expect(ranked[1].role).toBe('CROSS_SELL')
  })
})

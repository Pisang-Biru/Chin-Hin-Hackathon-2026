import { describe, expect, it } from 'vitest'

import { orchestrateBuRecommendation } from './agent-orchestration'

describe('orchestrateBuRecommendation', () => {
  it('returns summary and top SKU proposals with ranks', () => {
    const output = orchestrateBuRecommendation(
      {
        businessUnitId: 'bu_sag',
        businessUnitCode: 'SAG',
        businessUnitName: 'Signature Alliance Group',
        role: 'PRIMARY',
        finalScore: 0.84,
        confidence: 0.88,
        deterministicReason: 'Matched required project type and stage.',
        availableSkus: [
          {
            id: 'sku_1',
            skuCode: 'SAG-FITOUT-COM',
            skuName: 'Commercial Fit-Out',
            skuCategory: 'Interior',
          },
          {
            id: 'sku_2',
            skuCode: 'SAG-PM',
            skuName: 'Project Management Services',
            skuCategory: 'Services',
          },
        ],
      },
      [
        { factKey: 'project_type', factValue: 'commercial' },
        { factKey: 'development_type', factValue: 'fit_out' },
        { factKey: 'project_stage', factValue: 'tender' },
      ],
    )

    expect(output.summary).toContain('Signature Alliance Group')
    expect(output.skuProposals.length).toBeGreaterThan(0)
    expect(output.skuProposals[0].rank).toBe(1)
    expect(output.agentMessages).toHaveLength(2)
  })
})

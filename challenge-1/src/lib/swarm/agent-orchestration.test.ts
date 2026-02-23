import { describe, expect, it } from 'vitest'

import { orchestrateBuRecommendation } from './agent-orchestration'

describe('orchestrateBuRecommendation', () => {
  it('returns deterministic fallback proposals with ranks', async () => {
    const output = await orchestrateBuRecommendation(
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

  it('uses langchain output when provided', async () => {
    const output = await orchestrateBuRecommendation(
      {
        businessUnitId: 'bu_aac',
        businessUnitCode: 'STARKEN_AAC',
        businessUnitName: 'Starken AAC',
        role: 'CROSS_SELL',
        finalScore: 0.71,
        confidence: 0.76,
        deterministicReason: 'Matched project type and stage.',
        availableSkus: [
          {
            id: 'sku_aac_1',
            skuCode: 'AAC-BLOCK-100',
            skuName: 'AAC Block 100mm',
            skuCategory: 'Block',
          },
          {
            id: 'sku_aac_2',
            skuCode: 'AAC-PANEL-WALL',
            skuName: 'AAC Wall Panel',
            skuCategory: 'Panel',
          },
        ],
      },
      [
        { factKey: 'project_type', factValue: 'residential' },
        { factKey: 'project_stage', factValue: 'tender' },
      ],
      {
        runLangChainConversation: async () => ({
          synergyMessage: 'Please assess AAC suitability for this residential tender.',
          buReplySummary: 'AAC products are suitable for wall systems in this tender.',
          skuProposals: [
            {
              skuId: 'sku_aac_2',
              confidence: 0.9,
              rationale: 'Panelized wall system can accelerate installation.',
            },
          ],
        }),
      },
    )

    expect(output.summary).toContain('AAC products are suitable')
    expect(output.skuProposals).toHaveLength(1)
    expect(output.skuProposals[0].buSkuId).toBe('sku_aac_2')
    expect(output.agentMessages[0].content).toContain('Please assess AAC suitability')
  })
})

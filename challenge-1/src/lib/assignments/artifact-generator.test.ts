import { describe, expect, it } from 'vitest'

import { buildDispatchArtifactPayload } from './artifact-generator'

describe('buildDispatchArtifactPayload', () => {
  it('maps assignment data into artifact payload', () => {
    const payload = buildDispatchArtifactPayload(
      {
        id: 'assignment_1',
        status: 'DISPATCHED',
        assignedRole: 'PRIMARY',
        approvedBy: 'user_1',
        approvedAt: new Date('2026-02-01T10:00:00.000Z'),
        dispatchedAt: new Date('2026-02-01T12:00:00.000Z'),
        updatedAt: new Date('2026-02-01T12:00:00.000Z'),
        lead: {
          id: 'lead_1',
          projectName: 'Sample Project',
          locationText: 'Selangor',
          currentStatus: 'routed',
        },
        businessUnit: {
          id: 'bu_1',
          code: 'SAG',
          name: 'Signature Alliance Group',
        },
        routingRecommendation: {
          id: 'recommendation_1',
          role: 'PRIMARY',
          ruleScore: { toString: () => '0.9123' },
          finalScore: { toString: () => '0.9234' },
          confidence: { toString: () => '0.8877' },
          reasonSummary: 'Matched fit-out profile strongly.',
          recommendationSkus: [
            {
              rank: 1,
              confidence: { toString: () => '0.9011' },
              rationale: 'Strong fit for package scope.',
              buSku: {
                id: 'sku_1',
                skuCode: 'SAG-FITOUT-COM',
                skuName: 'Commercial Fit-Out',
                skuCategory: 'Interior',
              },
            },
          ],
        },
      },
      'synergy_user',
    )

    expect(payload.assignment.id).toBe('assignment_1')
    expect(payload.businessUnit.code).toBe('SAG')
    expect(payload.routingRecommendation.finalScore).toBe('0.9234')
    expect(payload.routingRecommendation.skuProposals[0].skuCode).toBe('SAG-FITOUT-COM')
  })
})

import { describe, expect, it } from 'vitest'

import { buildDocumentSummary } from './document-summary'

describe('buildDocumentSummary', () => {
  it('builds summary from normalized facts', () => {
    const summary = buildDocumentSummary({
      parseStatus: 'NORMALIZED',
      rawExtraction: null,
      facts: [
        { factKey: 'project_type', factValue: 'residential' },
        { factKey: 'project_stage', factValue: 'tender' },
        { factKey: 'region', factValue: 'central' },
        { factKey: 'construction_start_year', factValue: '2026' },
        { factKey: 'construction_end_year', factValue: '2028' },
        { factKey: 'project_value_band', factValue: '50m_100m' },
        { factKey: 'stakeholder_role', factValue: 'developer' },
        { factKey: 'stakeholder_name', factValue: 'Chin Hin Property' },
      ],
    })

    expect(summary).toContain('Residential')
    expect(summary).toContain('Stage: Tender')
    expect(summary).toContain('Region: Central')
    expect(summary).toContain('Timeline: 2026-2028')
    expect(summary).toContain('Value: RM50m-RM100m')
    expect(summary).toContain('Stakeholders: Developer - Chin Hin Property')
  })

  it('falls back to extraction text when no facts exist', () => {
    const summary = buildDocumentSummary({
      parseStatus: 'EXTRACTED',
      facts: [],
      rawExtraction: {
        analyzeResult: {
          content:
            'Mixed-use development in Selangor near transit corridor with phased construction plan.',
        },
      },
    })

    expect(summary).toContain('Mixed-use development')
  })

  it('uses parse status fallback when no facts and no extraction text', () => {
    const summary = buildDocumentSummary({
      parseStatus: 'ANALYZING',
      facts: [],
      rawExtraction: null,
    })

    expect(summary).toBe('Extraction in progress.')
  })
})

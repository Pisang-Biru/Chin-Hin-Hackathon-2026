import { describe, expect, it } from 'vitest'

import { normalizeToLeadFacts } from './normalize-extraction'

describe('normalizeToLeadFacts', () => {
  it('extracts routing-core facts from analyze result content', () => {
    const raw = {
      analyzeResult: {
        content: `
Service apartment project in Selangor.
Current stage: Tender.
Development type: Interior Fit Out.
Construction period: 2026 to 2028.
Project value between RM50mil to RM100mil.
Developer: Chin Hin Property.
Main Contractor: ABC Builders.
`,
      },
    }

    const facts = normalizeToLeadFacts(raw)
    const values = facts.map((fact) => `${fact.factKey}:${fact.factValue}`)

    expect(values).toContain('project_type:residential')
    expect(values).toContain('project_stage:tender')
    expect(values).toContain('development_type:fit_out')
    expect(values).toContain('region:central')
    expect(values).toContain('construction_start_year:2026')
    expect(values).toContain('construction_end_year:2028')
    expect(values).toContain('project_value_band:50m_100m')
    expect(values).toContain('stakeholder_role:developer')
    expect(values).toContain('stakeholder_name:Chin Hin Property')
  })

  it('returns empty array for missing text payload', () => {
    expect(normalizeToLeadFacts({})).toEqual([])
  })
})

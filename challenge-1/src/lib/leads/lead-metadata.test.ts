import { describe, expect, it } from 'vitest'

import {
  extractLeadMetadata,
  resolveLeadDisplay,
  selectPreferredProjectName,
} from './lead-metadata'

describe('lead metadata extraction', () => {
  it('extracts project name and location from raw extraction content', () => {
    const metadata = extractLeadMetadata({
      rawExtraction: {
        analyzeResult: {
          content:
            'Commercial office tower fit out in Selangor. Project stage is Tender. Construction period from 2026 to 2027.',
        },
      },
      fileName: 'office-fitout-project.pdf',
    })

    expect(metadata.projectName).toBe('Commercial office tower fit out')
    expect(metadata.locationText).toBe('Selangor')
  })

  it('falls back to filename and facts when text is sparse', () => {
    const display = resolveLeadDisplay({
      projectName: null,
      locationText: null,
      sourceDocument: {
        fileName: 'bridge-drain-package-2026.pdf',
        rawExtraction: {},
      },
      facts: [{ factKey: 'region', factValue: 'southern' }],
    })

    expect(display.projectName).toBe('bridge drain package 2026')
    expect(display.locationText).toBe('Southern')
  })

  it('ignores greeting-like sentences and uses filename as project title fallback', () => {
    const metadata = extractLeadMetadata({
      rawExtraction: {
        analyzeResult: {
          content:
            'Hi Chin Hin, Got your contact from previous project. Selangor. Project stage: Tender.',
        },
      },
      fileName: 'setia-alam-mixed-development.pdf',
    })

    expect(metadata.projectName).toBe('setia alam mixed development')
    expect(metadata.locationText).toBe('Selangor')
  })

  it('replaces invalid persisted project title during display resolution', () => {
    const display = resolveLeadDisplay({
      projectName: 'Hi Chin Hin, Got your contact from previous project',
      locationText: 'Selangor',
      sourceDocument: {
        fileName: 'klang-riverfront-commercial.pdf',
        rawExtraction: {
          analyzeResult: {
            content: 'Commercial riverfront package in Selangor.',
          },
        },
      },
    })

    expect(display.projectName).toBe('Commercial riverfront package')
    expect(display.locationText).toBe('Selangor')
  })

  it('returns null when both persisted and fallback titles are invalid', () => {
    const selected = selectPreferredProjectName(
      'Hi Chin Hin, got your contact',
      'We are currently awarded a new private hospital extension',
    )

    expect(selected).toBeNull()
  })
})

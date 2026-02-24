import { describe, expect, it } from 'vitest'

import { extractLeadMetadata, resolveLeadDisplay } from './lead-metadata'

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
})

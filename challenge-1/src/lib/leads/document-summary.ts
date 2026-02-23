import type { DocumentParseStatus } from '@/generated/prisma/enums'

type LeadFactInput = {
  factKey: string
  factValue: string
}

type BuildDocumentSummaryInput = {
  parseStatus: DocumentParseStatus
  facts: LeadFactInput[]
  rawExtraction: unknown
}

type RawExtractionPayload = {
  analyzeResult?: {
    content?: string
    paragraphs?: Array<{ content?: string }>
  }
}

const VALUE_BAND_LABELS: Record<string, string> = {
  lt_10m: 'Below RM10m',
  '10m_50m': 'RM10m-RM50m',
  '50m_100m': 'RM50m-RM100m',
  gt_100m: 'Above RM100m',
}

function titleize(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function collectFactValues(facts: LeadFactInput[], key: string): string[] {
  return facts
    .filter((fact) => fact.factKey === key)
    .map((fact) => fact.factValue)
}

function toTextSnippet(rawExtraction: unknown, maxLength = 220): string | null {
  const payload =
    rawExtraction && typeof rawExtraction === 'object'
      ? (rawExtraction as RawExtractionPayload)
      : {}
  const parts: string[] = []

  if (payload.analyzeResult?.content) {
    parts.push(payload.analyzeResult.content)
  }

  if (Array.isArray(payload.analyzeResult?.paragraphs)) {
    for (const paragraph of payload.analyzeResult.paragraphs) {
      if (paragraph.content) {
        parts.push(paragraph.content)
      }
    }
  }

  const normalized = parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return null
  }

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`
}

function fallbackSummary(parseStatus: DocumentParseStatus): string {
  if (parseStatus === 'UPLOADED') {
    return 'Uploaded and queued for extraction.'
  }

  if (parseStatus === 'ANALYZING') {
    return 'Extraction in progress.'
  }

  if (parseStatus === 'FAILED') {
    return 'Extraction failed.'
  }

  return 'No summary available yet.'
}

export function buildDocumentSummary(input: BuildDocumentSummaryInput): string {
  const { facts, parseStatus, rawExtraction } = input

  const projectType = collectFactValues(facts, 'project_type')[0]
  const stage = collectFactValues(facts, 'project_stage')[0]
  const developmentType = collectFactValues(facts, 'development_type')[0]
  const region = collectFactValues(facts, 'region')[0]
  const startYear = collectFactValues(facts, 'construction_start_year')[0]
  const endYear = collectFactValues(facts, 'construction_end_year')[0]
  const valueBand = collectFactValues(facts, 'project_value_band')[0]
  const stakeholderNames = collectFactValues(facts, 'stakeholder_name')
  const stakeholderRoles = collectFactValues(facts, 'stakeholder_role')

  const parts: string[] = []

  if (projectType) {
    parts.push(titleize(projectType))
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
  if (startYear && endYear) {
    parts.push(`Timeline: ${startYear}-${endYear}`)
  } else if (startYear) {
    parts.push(`Timeline: ${startYear}`)
  }
  if (valueBand) {
    parts.push(`Value: ${VALUE_BAND_LABELS[valueBand] ?? titleize(valueBand)}`)
  }
  if (stakeholderNames.length > 0) {
    const stakeholderPairs = stakeholderNames
      .map((name, index) => {
        const role = stakeholderRoles[index]
        return role ? `${titleize(role)} - ${name}` : name
      })
      .slice(0, 2)
    parts.push(`Stakeholders: ${stakeholderPairs.join(', ')}`)
  }

  if (parts.length > 0) {
    return parts.join(' | ')
  }

  const textSnippet = toTextSnippet(rawExtraction)
  if (textSnippet) {
    return textSnippet
  }

  return fallbackSummary(parseStatus)
}

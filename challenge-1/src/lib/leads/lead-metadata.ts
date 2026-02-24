type MetadataFactInput = {
  factKey: string
  factValue: string
}

type LeadMetadataInput = {
  rawExtraction: unknown
  fileName?: string | null
  facts?: MetadataFactInput[]
}

type ExtractedLeadMetadata = {
  projectName: string | null
  locationText: string | null
}

type LeadDisplayInput = {
  projectName: string | null
  locationText: string | null
  sourceDocument?: {
    rawExtraction: unknown
    fileName: string
  } | null
  facts?: MetadataFactInput[]
}

type RawExtractionPayload = {
  analyzeResult?: {
    content?: string
    paragraphs?: Array<{ content?: string }>
  }
}

const LOCATION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bkuala lumpur\b/i, label: 'Kuala Lumpur' },
  { pattern: /\bputrajaya\b/i, label: 'Putrajaya' },
  { pattern: /\bselangor\b/i, label: 'Selangor' },
  { pattern: /\bperlis\b/i, label: 'Perlis' },
  { pattern: /\bkedah\b/i, label: 'Kedah' },
  { pattern: /\bpenang\b/i, label: 'Penang' },
  { pattern: /\bperak\b/i, label: 'Perak' },
  { pattern: /\bnegeri sembilan\b/i, label: 'Negeri Sembilan' },
  { pattern: /\bmelaka\b/i, label: 'Melaka' },
  { pattern: /\bjohor\b/i, label: 'Johor' },
  { pattern: /\bterengganu\b/i, label: 'Terengganu' },
  { pattern: /\bkelantan\b/i, label: 'Kelantan' },
  { pattern: /\bpahang\b/i, label: 'Pahang' },
  { pattern: /\blabuan\b/i, label: 'Labuan' },
  { pattern: /\bsabah\b/i, label: 'Sabah' },
  { pattern: /\bsarawak\b/i, label: 'Sarawak' },
]

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function titleize(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function collectContent(raw: unknown): string {
  const payload = raw as RawExtractionPayload
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

  return normalizeWhitespace(parts.join(' '))
}

function sanitizeFileName(fileName: string | null | undefined): string | null {
  if (!fileName) {
    return null
  }

  const withoutExtension = fileName.replace(/\.[a-z0-9]+$/i, '')
  const cleaned = normalizeWhitespace(
    withoutExtension
      .replace(/[_-]+/g, ' ')
      .replace(/[^\w\s()]/g, ' '),
  )

  return cleaned.length > 0 ? cleaned : null
}

function detectProjectName(content: string, fallbackFileName: string | null): string | null {
  const namedPattern = content.match(/project\s*name\s*[:-]\s*([^\n\r.;|]+)/i)
  if (namedPattern?.[1]) {
    return normalizeWhitespace(namedPattern[1])
  }

  const projectPattern = content.match(
    /project\s*[:-]\s*(?!stage|status|value|period|timeline)([^\n\r.;|]+)/i,
  )
  if (projectPattern?.[1]) {
    return normalizeWhitespace(projectPattern[1])
  }

  const firstSentence = normalizeWhitespace(content.split(/[.\n!?]/)[0] ?? '')
  if (
    firstSentence &&
    !/(project stage|construction period|development type|region|value band)/i.test(
      firstSentence,
    )
  ) {
    const stripped = normalizeWhitespace(
      firstSentence.replace(/\bin\s+(kuala lumpur|putrajaya|selangor|perlis|kedah|penang|perak|negeri sembilan|melaka|johor|terengganu|kelantan|pahang|labuan|sabah|sarawak)\b.*/i, ''),
    )
    if (stripped.length >= 6) {
      return stripped
    }
  }

  return fallbackFileName
}

function detectLocation(content: string, facts: MetadataFactInput[]): string | null {
  for (const rule of LOCATION_PATTERNS) {
    if (rule.pattern.test(content)) {
      return rule.label
    }
  }

  const regionFact = facts.find((fact) => fact.factKey === 'region')?.factValue
  if (regionFact) {
    return titleize(regionFact)
  }

  return null
}

export function extractLeadMetadata(input: LeadMetadataInput): ExtractedLeadMetadata {
  const content = collectContent(input.rawExtraction)
  const facts = input.facts ?? []
  const fileNameFallback = sanitizeFileName(input.fileName ?? null)

  return {
    projectName: detectProjectName(content, fileNameFallback),
    locationText: detectLocation(content, facts),
  }
}

export function resolveLeadDisplay(input: LeadDisplayInput): {
  projectName: string
  locationText: string
} {
  const currentProjectName = normalizeWhitespace(input.projectName ?? '')
  const currentLocationText = normalizeWhitespace(input.locationText ?? '')

  const derived = extractLeadMetadata({
    rawExtraction: input.sourceDocument?.rawExtraction ?? {},
    fileName: input.sourceDocument?.fileName ?? null,
    facts: input.facts ?? [],
  })

  return {
    projectName: currentProjectName || derived.projectName || 'Untitled project',
    locationText: currentLocationText || derived.locationText || 'Unknown location',
  }
}

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

const INVALID_PROJECT_NAME_PATTERNS: RegExp[] = [
  /^\s*(hi|hello|dear|good morning|good afternoon|good evening)\b/i,
  /^\s*(we|i)\s+(are|have|am)\b/i,
  /\b(got your contact|previous project|please|kindly|thank you|thanks)\b/i,
  /\b(call me|contact me|reach me|whatsapp|email me)\b/i,
  /\b(http:\/\/|https:\/\/|www\.|@)\b/i,
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

function isLikelyProjectName(value: string): boolean {
  const normalized = normalizeWhitespace(value)
  if (!normalized) {
    return false
  }

  if (normalized.length < 6 || normalized.length > 120) {
    return false
  }

  if (normalized.split(' ').length > 14) {
    return false
  }

  if (/[:?]/.test(normalized)) {
    return false
  }

  if (
    LOCATION_PATTERNS.some((rule) => rule.label.toLowerCase() === normalized.toLowerCase()) ||
    /\b(central|northern|southern|east coast|east malaysia)\s+region\b/i.test(normalized)
  ) {
    return false
  }

  if (INVALID_PROJECT_NAME_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false
  }

  if (
    /(project stage|construction period|development type|region|value band|information according)/i.test(
      normalized,
    )
  ) {
    return false
  }

  return true
}

function detectProjectName(content: string, fallbackFileName: string | null): string | null {
  const namedPattern = content.match(/project\s*name\s*[:-]\s*([^\n\r.;|]+)/i)
  if (namedPattern?.[1]) {
    const candidate = normalizeWhitespace(namedPattern[1])
    if (isLikelyProjectName(candidate)) {
      return candidate
    }
  }

  const projectPattern = content.match(
    /project\s*[:-]\s*(?!stage|status|value|period|timeline)([^\n\r.;|]+)/i,
  )
  if (projectPattern?.[1]) {
    const candidate = normalizeWhitespace(projectPattern[1])
    if (isLikelyProjectName(candidate)) {
      return candidate
    }
  }

  const sentenceCandidates = content.split(/[.\n!?]+/).map(normalizeWhitespace).filter(Boolean)
  for (const sentence of sentenceCandidates) {
    const stripped = normalizeWhitespace(
      sentence.replace(/\bin\s+(kuala lumpur|putrajaya|selangor|perlis|kedah|penang|perak|negeri sembilan|melaka|johor|terengganu|kelantan|pahang|labuan|sabah|sarawak)\b.*/i, ''),
    )
    if (isLikelyProjectName(stripped)) {
      return stripped
    }
  }

  return fallbackFileName && isLikelyProjectName(fallbackFileName) ? fallbackFileName : null
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
    projectName:
      (isLikelyProjectName(currentProjectName) ? currentProjectName : '') ||
      derived.projectName ||
      'Untitled project',
    locationText: currentLocationText || derived.locationText || 'Unknown location',
  }
}

export function selectPreferredProjectName(currentProjectName: string | null, fallbackProjectName: string | null): string | null {
  const current = normalizeWhitespace(currentProjectName ?? '')
  if (isLikelyProjectName(current)) {
    return current
  }

  const fallback = normalizeWhitespace(fallbackProjectName ?? '')
  return isLikelyProjectName(fallback) ? fallback : null
}

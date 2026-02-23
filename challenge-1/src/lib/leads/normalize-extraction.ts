export const ROUTING_CORE_FACT_KEYS = [
  'project_type',
  'project_stage',
  'development_type',
  'region',
  'construction_start_year',
  'construction_end_year',
  'project_value_band',
  'stakeholder_role',
  'stakeholder_name',
] as const

export type RoutingFactKey = (typeof ROUTING_CORE_FACT_KEYS)[number]

export type NormalizedFact = {
  factKey: RoutingFactKey
  factValue: string
  confidence: number
}

type AnalyzeResultPayload = {
  content?: string
  paragraphs?: Array<{ content?: string }>
}

type RawExtractionPayload = {
  analyzeResult?: AnalyzeResultPayload
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

  return parts.join('\n').trim()
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function detectProjectType(text: string): NormalizedFact | null {
  const lower = text.toLowerCase()

  if (/(apartment|condominium|condo|residential|townhouse|bungalow|villa|housing)/.test(lower)) {
    return { factKey: 'project_type', factValue: 'residential', confidence: 0.88 }
  }
  if (/(office|retail|shopping|mall|commercial|hotel|hospitality|data centre|data center)/.test(lower)) {
    return { factKey: 'project_type', factValue: 'commercial', confidence: 0.84 }
  }
  if (/(industrial|factory|manufacturing|warehouse|plant|processing)/.test(lower)) {
    return { factKey: 'project_type', factValue: 'industrial', confidence: 0.84 }
  }
  if (/(bridge|rail|road|drain|manhole|infrastructure|pipeline|subdivision)/.test(lower)) {
    return { factKey: 'project_type', factValue: 'infrastructure', confidence: 0.8 }
  }

  return null
}

function detectProjectStage(text: string): NormalizedFact | null {
  const lower = text.toLowerCase()

  if (/(early planning|planning|design tender|design approval)/.test(lower)) {
    return { factKey: 'project_stage', factValue: 'planning', confidence: 0.8 }
  }
  if (/(tender|tenderers listed|contract awarded)/.test(lower)) {
    return { factKey: 'project_stage', factValue: 'tender', confidence: 0.82 }
  }
  if (/(construction|site works commenced|subcontractor)/.test(lower)) {
    return { factKey: 'project_stage', factValue: 'construction', confidence: 0.82 }
  }
  if (/(completed|handed over|finished)/.test(lower)) {
    return { factKey: 'project_stage', factValue: 'completed', confidence: 0.78 }
  }

  return null
}

function detectDevelopmentType(text: string): NormalizedFact | null {
  const lower = text.toLowerCase()

  if (/(fit out|interior fit out)/.test(lower)) {
    return { factKey: 'development_type', factValue: 'fit_out', confidence: 0.86 }
  }
  if (/(renovation|refurbishment|restoration|upgrading|maintenance)/.test(lower)) {
    return { factKey: 'development_type', factValue: 'refurbishment', confidence: 0.8 }
  }
  if (/(extension|addition)/.test(lower)) {
    return { factKey: 'development_type', factValue: 'extension', confidence: 0.76 }
  }
  if (/(new construction|new build|new project|construction period)/.test(lower)) {
    return { factKey: 'development_type', factValue: 'new_construction', confidence: 0.75 }
  }

  return null
}

function detectRegion(text: string): NormalizedFact | null {
  const lower = text.toLowerCase()

  const rules: Array<{ pattern: RegExp; region: string; confidence: number }> = [
    {
      pattern:
        /(kuala lumpur|putrajaya|selangor|central region|kl)/,
      region: 'central',
      confidence: 0.9,
    },
    {
      pattern: /(perlis|kedah|penang|perak|northern region)/,
      region: 'northern',
      confidence: 0.88,
    },
    {
      pattern: /(negeri sembilan|melaka|johor|southern region)/,
      region: 'southern',
      confidence: 0.88,
    },
    {
      pattern: /(terengganu|kelantan|pahang|east coast)/,
      region: 'east_coast',
      confidence: 0.88,
    },
    {
      pattern: /(labuan|sabah|sarawak|east malaysia)/,
      region: 'east_malaysia',
      confidence: 0.88,
    },
  ]

  for (const rule of rules) {
    if (rule.pattern.test(lower)) {
      return {
        factKey: 'region',
        factValue: rule.region,
        confidence: rule.confidence,
      }
    }
  }

  return null
}

function detectConstructionYears(text: string): NormalizedFact[] {
  const yearMatches = Array.from(text.matchAll(/\b(20\d{2})\b/g))
    .map((match) => Number(match[1]))
    .filter((year) => year >= 2000 && year <= 2100)

  if (yearMatches.length === 0) {
    return []
  }

  const uniqueYears = [...new Set(yearMatches)].sort((a, b) => a - b)
  const startYear = uniqueYears[0]
  const endYear = uniqueYears[uniqueYears.length - 1]

  const facts: NormalizedFact[] = [
    {
      factKey: 'construction_start_year',
      factValue: String(startYear),
      confidence: 0.72,
    },
  ]

  if (endYear !== startYear) {
    facts.push({
      factKey: 'construction_end_year',
      factValue: String(endYear),
      confidence: 0.7,
    })
  }

  return facts
}

function detectProjectValueBand(text: string): NormalizedFact | null {
  const lower = text.toLowerCase()

  if (/(above\s*rm\s*100\s*(mil|million|m)|>\s*rm\s*100\s*(mil|million|m))/.test(lower)) {
    return { factKey: 'project_value_band', factValue: 'gt_100m', confidence: 0.86 }
  }

  if (/(between\s*rm\s*50\s*(mil|million|m)\s*(to|-|and)\s*rm\s*100\s*(mil|million|m))/.test(lower)) {
    return { factKey: 'project_value_band', factValue: '50m_100m', confidence: 0.85 }
  }

  if (/(between\s*rm\s*10\s*(mil|million|m)\s*(to|-|and)\s*rm\s*50\s*(mil|million|m))/.test(lower)) {
    return { factKey: 'project_value_band', factValue: '10m_50m', confidence: 0.85 }
  }

  if (/(below\s*rm\s*10\s*(mil|million|m)|under\s*rm\s*10\s*(mil|million|m)|<\s*rm\s*10\s*(mil|million|m))/.test(lower)) {
    return { factKey: 'project_value_band', factValue: 'lt_10m', confidence: 0.84 }
  }

  const rmMatches = Array.from(lower.matchAll(/rm\s*([0-9]+(?:\.[0-9]+)?)\s*(mil|million|m)?/g))
  if (rmMatches.length > 0) {
    const amounts = rmMatches
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value))

    if (amounts.length > 0) {
      const max = Math.max(...amounts)
      if (max < 10) {
        return { factKey: 'project_value_band', factValue: 'lt_10m', confidence: 0.72 }
      }
      if (max < 50) {
        return { factKey: 'project_value_band', factValue: '10m_50m', confidence: 0.72 }
      }
      if (max < 100) {
        return { factKey: 'project_value_band', factValue: '50m_100m', confidence: 0.72 }
      }

      return { factKey: 'project_value_band', factValue: 'gt_100m', confidence: 0.72 }
    }
  }

  return null
}

function detectStakeholders(text: string): NormalizedFact[] {
  const facts: NormalizedFact[] = []
  const matches = Array.from(
    text.matchAll(
      /(developer|consultant|main contractor|contractor)\s*[:-]\s*([^\n\r;,.]+)/gi,
    ),
  )

  for (const match of matches) {
    const role = normalizeWhitespace(match[1].toLowerCase())
    const stakeholder = normalizeWhitespace(match[2])

    if (stakeholder.length === 0) {
      continue
    }

    facts.push({
      factKey: 'stakeholder_role',
      factValue: role.replace(/\s+/g, '_'),
      confidence: 0.76,
    })

    facts.push({
      factKey: 'stakeholder_name',
      factValue: stakeholder,
      confidence: 0.78,
    })
  }

  return facts
}

function dedupeFacts(facts: NormalizedFact[]): NormalizedFact[] {
  const seen = new Set<string>()
  const output: NormalizedFact[] = []

  for (const fact of facts) {
    const key = `${fact.factKey}:${fact.factValue}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    output.push(fact)
  }

  return output
}

export function normalizeToLeadFacts(rawResult: unknown): NormalizedFact[] {
  const content = collectContent(rawResult)
  if (!content) {
    return []
  }

  const facts: NormalizedFact[] = []
  const singleFacts = [
    detectProjectType(content),
    detectProjectStage(content),
    detectDevelopmentType(content),
    detectRegion(content),
    detectProjectValueBand(content),
  ]

  for (const fact of singleFacts) {
    if (fact) {
      facts.push(fact)
    }
  }

  facts.push(...detectConstructionYears(content))
  facts.push(...detectStakeholders(content))

  return dedupeFacts(facts)
}

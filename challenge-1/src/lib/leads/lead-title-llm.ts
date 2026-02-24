import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'

type LeadTitleFact = {
  factKey: string
  factValue: string
}

type GenerateLeadTitleInput = {
  rawExtraction: unknown
  fileName?: string | null
  locationText?: string | null
  fallbackTitle?: string | null
  facts?: LeadTitleFact[]
}

type RawExtractionPayload = {
  analyzeResult?: {
    content?: string
    paragraphs?: Array<{ content?: string }>
  }
}

const LEAD_TITLE_OUTPUT_SCHEMA = z.object({
  title: z.string().min(4).max(120),
})

let cachedModel: ChatOpenAI | null = null
let cachedModelKey: string | null = null

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function isLeadTitleLlmEnabled(): boolean {
  const flag = process.env.LEAD_TITLE_LLM_ENABLED?.toLowerCase().trim()
  if (flag === '0' || flag === 'false' || flag === 'off') {
    return false
  }
  return true
}

function getAzureEndpoint(): string | null {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim()
  return endpoint || null
}

function getChatModel(): ChatOpenAI | null {
  if (!isLeadTitleLlmEnabled()) {
    return null
  }

  const azureApiKey = process.env.AZURE_OPENAI_API_KEY?.trim()
  const azureEndpoint = getAzureEndpoint()
  const azureModelName =
    process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
    process.env.AZURE_OPENAI_MODEL?.trim() ||
    ''

  if (azureApiKey && azureEndpoint && azureModelName) {
    const modelKey = `azure:${azureEndpoint}:${azureModelName}:${azureApiKey.slice(0, 8)}`
    if (cachedModel && cachedModelKey === modelKey) {
      return cachedModel
    }

    cachedModel = new ChatOpenAI({
      apiKey: azureApiKey,
      model: azureModelName,
      temperature: 0,
      configuration: {
        baseURL: azureEndpoint,
      },
    })
    cachedModelKey = modelKey
    return cachedModel
  }

  const openAiApiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openAiApiKey) {
    return null
  }

  const openAiModel = process.env.OPENAI_LEAD_TITLE_MODEL?.trim() || 'gpt-4o-mini'
  const modelKey = `${openAiModel}:${openAiApiKey.slice(0, 8)}`
  if (cachedModel && cachedModelKey === modelKey) {
    return cachedModel
  }

  cachedModel = new ChatOpenAI({
    apiKey: openAiApiKey,
    model: openAiModel,
    temperature: 0,
  })
  cachedModelKey = modelKey
  return cachedModel
}

function collectExtractionText(raw: unknown): string {
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

function extractContentText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  const parts: string[] = []
  for (const part of content) {
    if (!part || typeof part !== 'object') {
      continue
    }
    const text = (part as { text?: unknown }).text
    if (typeof text === 'string') {
      parts.push(text)
    }
  }

  return normalizeWhitespace(parts.join('\n'))
}

function parseJsonCandidate(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fencedMatch ? fencedMatch[1] : trimmed

  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function sanitizeTitle(value: string): string {
  return normalizeWhitespace(value)
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.]+$/g, '')
}

export async function generateLeadProjectTitleWithLlm(
  input: GenerateLeadTitleInput,
): Promise<string | null> {
  const model = getChatModel()
  if (!model) {
    return null
  }

  const extractionText = collectExtractionText(input.rawExtraction)
  if (!extractionText) {
    return null
  }

  const factsPreview = (input.facts ?? []).slice(0, 12)
  const prompt = `
Create a clean CRM project title from lead text.

Output rules:
- Return strict JSON only: {"title":"..."}
- 4 to 12 words.
- No greeting, no first-person phrasing, no sales wording.
- Focus on project type/scope and location when available.
- Do not include full sentences.

Filename: ${input.fileName || 'N/A'}
Location hint: ${input.locationText || 'N/A'}
Fallback title hint: ${input.fallbackTitle || 'N/A'}
Lead facts: ${JSON.stringify(factsPreview)}
Lead text:
${extractionText.slice(0, 4000)}
`.trim()

  try {
    const response = await model.invoke([
      new SystemMessage('You generate concise construction project titles for CRM.'),
      new HumanMessage(prompt),
    ])

    const content = extractContentText(response.content)
    const parsed = parseJsonCandidate(content)
    const validated = LEAD_TITLE_OUTPUT_SCHEMA.safeParse(parsed)
    if (!validated.success) {
      return null
    }

    const title = sanitizeTitle(validated.data.title)
    return title || null
  } catch (error) {
    console.warn('[leads.title-llm.failed]', {
      error: error instanceof Error ? error.message : 'Unknown error',
      fileName: input.fileName ?? null,
    })
    return null
  }
}

import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'

type LangChainSwarmInput = {
  businessUnitCode: string
  businessUnitName: string
  role: string
  finalScore: number
  deterministicReason: string
  contextSummary: string
  leadFacts: Array<{ factKey: string; factValue: string }>
  availableSkus: Array<{
    id: string
    skuCode: string
    skuName: string
    skuCategory: string | null
  }>
}

export type LangChainSwarmOutput = {
  synergyMessage: string
  buReplySummary: string
  skuProposals: Array<{
    skuId: string
    confidence: number
    rationale: string
  }>
}

const SWARM_OUTPUT_SCHEMA = z.object({
  synergyMessage: z.string().min(1),
  buReplySummary: z.string().min(1),
  skuProposals: z
    .array(
      z.object({
        skuId: z.string().min(1),
        confidence: z.number().min(0).max(1),
        rationale: z.string().min(1),
      }),
    )
    .max(3),
})

let cachedModel: ChatOpenAI | null = null
let cachedModelKey: string | null = null

function isLangChainEnabled(): boolean {
  const flag = process.env.SWARM_LANGCHAIN_ENABLED?.toLowerCase().trim()
  if (flag === '0' || flag === 'false' || flag === 'off') {
    return false
  }
  return true
}

function getAzureEndpoint(): string | null {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim()
  if (!endpoint) {
    return null
  }
  return endpoint
}

function getChatModel(): ChatOpenAI | null {
  if (!isLangChainEnabled()) {
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
      temperature: 0.1,
      configuration: {
        baseURL: azureEndpoint,
      },
    })
    cachedModelKey = modelKey
    return cachedModel
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return null
  }

  const modelName = process.env.OPENAI_SWARM_MODEL?.trim() || 'gpt-4o-mini'
  const modelKey = `${modelName}:${apiKey.slice(0, 8)}`
  if (cachedModel && cachedModelKey === modelKey) {
    return cachedModel
  }

  cachedModel = new ChatOpenAI({
    apiKey,
    model: modelName,
    temperature: 0.1,
  })
  cachedModelKey = modelKey
  return cachedModel
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

  return parts.join('\n').trim()
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

export async function runLangChainBuConversation(
  input: LangChainSwarmInput,
): Promise<LangChainSwarmOutput | null> {
  const model = getChatModel()
  if (!model) {
    return null
  }

  const skuList = input.availableSkus.map((sku) => ({
    skuId: sku.id,
    skuCode: sku.skuCode,
    skuName: sku.skuName,
    skuCategory: sku.skuCategory,
  }))

  const systemPrompt =
    'You are a Synergy routing orchestrator coordinating with one business-unit specialist agent. Return only strict JSON.'

  const userPrompt = `
Generate a Synergy to BU conversation outcome for CRM.

Rules:
- Keep content concise and concrete.
- Use only provided SKU ids.
- Maximum 3 SKU proposals.
- Confidence must be 0 to 1.
- Output valid JSON only with this shape:
{
  "synergyMessage": "string",
  "buReplySummary": "string",
  "skuProposals": [
    { "skuId": "string", "confidence": 0.0, "rationale": "string" }
  ]
}

Business Unit:
${JSON.stringify(
    {
      code: input.businessUnitCode,
      name: input.businessUnitName,
      role: input.role,
      finalScore: input.finalScore,
      deterministicReason: input.deterministicReason,
    },
    null,
    2,
  )}

Lead Context:
${input.contextSummary}

Lead Facts:
${JSON.stringify(input.leadFacts, null, 2)}

Available SKUs:
${JSON.stringify(skuList, null, 2)}
`.trim()

  try {
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ])

    const contentText = extractContentText(response.content)
    const parsed = parseJsonCandidate(contentText)
    const validated = SWARM_OUTPUT_SCHEMA.safeParse(parsed)
    if (!validated.success) {
      return null
    }

    return validated.data
  } catch (error) {
    console.warn('[swarm.langchain.invoke.failed]', {
      businessUnitCode: input.businessUnitCode,
      error: error instanceof Error ? error.message : 'Unknown LangChain error',
    })
    return null
  }
}

import {
  runDeterministicRoutingForLead,
  type RoutingLiveEvent as DeterministicRoutingLiveEvent,
} from '@/lib/routing/run-deterministic-routing'
import type { DeterministicBuScore } from '@/lib/routing/deterministic-engine'
import {
  runDeepAgentsRoutingForLead,
  type DeepAgentsRoutingEvent,
} from '@/lib/swarm/deep-agents-routing'

export type RoutingEngine = 'deterministic' | 'deep_agents'

export type RoutingLiveEvent = DeterministicRoutingLiveEvent | DeepAgentsRoutingEvent

export type RoutingRunSummary = {
  routingRunId: string
  engineVersion: string
  leadId: string
  scoredBusinessUnits: number
  recommendationsCount: number
  assignmentCount: number
  scores: DeterministicBuScore[]
  status: 'COMPLETED' | 'PENDING_APPROVAL'
}

type RunRoutingInput = {
  leadId: string
  triggeredBy: string
  previewDelayMs?: number
  onEvent?: (event: RoutingLiveEvent) => Promise<void> | void
}

function resolveRoutingEngine(): RoutingEngine {
  const raw = process.env.SWARM_ENGINE?.trim().toLowerCase()
  if (raw === 'deep_agents') {
    return 'deep_agents'
  }
  return 'deterministic'
}

export async function runRoutingForLead(input: RunRoutingInput): Promise<RoutingRunSummary> {
  const engine = resolveRoutingEngine()
  if (engine === 'deep_agents') {
    const summary = await runDeepAgentsRoutingForLead({
      leadId: input.leadId,
      triggeredBy: input.triggeredBy,
      onEvent: input.onEvent,
    })

    return {
      ...summary,
      scores: [],
    }
  }

  const deterministicSummary = await runDeterministicRoutingForLead({
    leadId: input.leadId,
    triggeredBy: input.triggeredBy,
    previewDelayMs: input.previewDelayMs,
    onEvent: input.onEvent as ((event: DeterministicRoutingLiveEvent) => Promise<void> | void) | undefined,
  })

  return {
    ...deterministicSummary,
    status: 'COMPLETED',
  }
}

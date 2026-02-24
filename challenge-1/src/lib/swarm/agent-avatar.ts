export type AgentAvatar = {
  label: string
  imagePath: string
}

function normalizeAgentId(agentId: string): string {
  return agentId.trim().toLowerCase()
}

function fallbackLabel(agentId: string): string {
  return agentId
    .replace(/_agent$/i, '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const AGENT_AVATAR_MAP: Partial<Record<string, AgentAvatar>> = {
  synergy_router: {
    label: 'Synergy',
    imagePath: '/agent-avatars/synergy.svg',
  },
  synergy_deterministic_router: {
    label: 'Synergy',
    imagePath: '/agent-avatars/synergy.svg',
  },
  gcast_agent: {
    label: 'GCast',
    imagePath: '/agent-avatars/gcast.svg',
  },
  sag_agent: {
    label: 'SAG',
    imagePath: '/agent-avatars/sag.svg',
  },
  makna_agent: {
    label: 'Makna',
    imagePath: '/agent-avatars/makna.svg',
  },
  starken_aac_agent: {
    label: 'Starken AAC',
    imagePath: '/agent-avatars/starken-aac.svg',
  },
  starken_drymix_agent: {
    label: 'Starken Drymix',
    imagePath: '/agent-avatars/starken-drymix.svg',
  },
}

export function getAgentAvatar(agentId: string): AgentAvatar {
  const normalized = normalizeAgentId(agentId)
  const mapped = AGENT_AVATAR_MAP[normalized]
  if (mapped) {
    return mapped
  }

  return {
    label: fallbackLabel(agentId),
    imagePath: '/agent-avatars/generic.svg',
  }
}

type AgentLogRecord = {
  id: string
  agentId: string
  recipientId: string | null
  messageType: string
  content: string
  evidenceRefs: unknown
  createdAt: Date
}

export type AssignmentConversationMessage = {
  id: string
  agentId: string
  recipientId: string | null
  messageType: string
  content: string
  createdAt: Date
  evidenceRefs: unknown
}

function buildBuAgentId(businessUnitCode: string): string {
  return `${businessUnitCode.toLowerCase()}_agent`
}

function isBuConversationMessage(
  message: AgentLogRecord,
  buAgentId: string,
): boolean {
  if (message.messageType === 'ROUTING_DECISION') {
    return true
  }

  if (message.agentId === buAgentId || message.recipientId === buAgentId) {
    return true
  }

  if (message.agentId === 'synergy_router' && message.recipientId === buAgentId) {
    return true
  }

  if (message.agentId === 'synergy_router' && message.recipientId === null) {
    return true
  }

  return false
}

export function buildAssignmentConversation(
  businessUnitCode: string,
  messages: AgentLogRecord[],
): AssignmentConversationMessage[] {
  const buAgentId = buildBuAgentId(businessUnitCode)

  return messages
    .filter((message) => isBuConversationMessage(message, buAgentId))
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((message) => ({
      id: message.id,
      agentId: message.agentId,
      recipientId: message.recipientId,
      messageType: message.messageType,
      content: message.content,
      createdAt: message.createdAt,
      evidenceRefs: message.evidenceRefs,
    }))
}

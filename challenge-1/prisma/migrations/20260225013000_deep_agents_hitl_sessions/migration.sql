-- Add deep agent session persistence for human-in-the-loop delegation.
CREATE TYPE "AgentSessionStatus" AS ENUM (
  'IN_PROGRESS',
  'PENDING_APPROVAL',
  'COMPLETED',
  'REJECTED',
  'FAILED'
);

CREATE TYPE "AgentDelegationStepStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXECUTED',
  'FAILED'
);

CREATE TABLE "AgentSession" (
  "id" TEXT NOT NULL,
  "routingRunId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "status" "AgentSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "pendingStepId" TEXT,
  "initiatedBy" TEXT NOT NULL,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentSession_routingRunId_fkey" FOREIGN KEY ("routingRunId") REFERENCES "RoutingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentSession_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentSession_routingRunId_key" ON "AgentSession"("routingRunId");
CREATE INDEX "AgentSession_status_updatedAt_idx" ON "AgentSession"("status", "updatedAt");
CREATE INDEX "AgentSession_leadId_createdAt_idx" ON "AgentSession"("leadId", "createdAt");

CREATE TABLE "AgentDelegationStep" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "stepIndex" INTEGER NOT NULL,
  "subagentName" TEXT NOT NULL,
  "status" "AgentDelegationStepStatus" NOT NULL DEFAULT 'PENDING',
  "requestPayload" JSONB,
  "decisionBy" TEXT,
  "decisionReason" TEXT,
  "decidedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentDelegationStep_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentDelegationStep_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentDelegationStep_sessionId_stepIndex_key" ON "AgentDelegationStep"("sessionId", "stepIndex");
CREATE INDEX "AgentDelegationStep_status_createdAt_idx" ON "AgentDelegationStep"("status", "createdAt");

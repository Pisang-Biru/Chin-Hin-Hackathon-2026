-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('BCI', 'NON_BCI', 'OTHER');

-- CreateEnum
CREATE TYPE "IntakeChannel" AS ENUM ('FILE_UPLOAD', 'MANUAL', 'API_IMPORT');

-- CreateEnum
CREATE TYPE "DocumentParseStatus" AS ENUM ('UPLOADED', 'EXTRACTED', 'NORMALIZED', 'FAILED');

-- CreateEnum
CREATE TYPE "RuleSetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RuleOperator" AS ENUM ('EQ', 'IN', 'NOT_IN', 'EXISTS', 'GT', 'GTE', 'LT', 'LTE');

-- CreateEnum
CREATE TYPE "RoutingStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecommendationRole" AS ENUM ('PRIMARY', 'CROSS_SELL');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('APPROVED', 'DISPATCHED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('JSON', 'PDF');

-- CreateEnum
CREATE TYPE "OutcomeStatus" AS ENUM ('TENDERED', 'QUOTED', 'SUPPLIED', 'SECURED', 'LOST');

-- CreateTable
CREATE TABLE "LeadDocument" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL DEFAULT 'OTHER',
    "parseStatus" "DocumentParseStatus" NOT NULL DEFAULT 'UPLOADED',
    "rawExtraction" JSONB,
    "extractionProvider" TEXT NOT NULL DEFAULT 'azure_document_intelligence',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "externalLeadRef" TEXT,
    "projectName" TEXT,
    "locationText" TEXT,
    "sourceDocumentId" TEXT,
    "intakeChannel" "IntakeChannel" NOT NULL DEFAULT 'FILE_UPLOAD',
    "currentStatus" TEXT NOT NULL DEFAULT 'parsed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadFact" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "factKey" TEXT NOT NULL,
    "factValue" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 1.0,
    "sourceDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUnit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuSku" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "skuCode" TEXT NOT NULL,
    "skuName" TEXT NOT NULL,
    "skuCategory" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuSku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingRuleSet" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "RuleSetStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutingRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingRuleCondition" (
    "id" TEXT NOT NULL,
    "ruleSetId" TEXT NOT NULL,
    "factKey" TEXT NOT NULL,
    "operator" "RuleOperator" NOT NULL,
    "comparisonValue" TEXT,
    "comparisonValues" JSONB,
    "weight" DECIMAL(5,2) NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingRuleCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingRun" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "RoutingStatus" NOT NULL DEFAULT 'PENDING',
    "engineVersion" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RoutingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingRecommendation" (
    "id" TEXT NOT NULL,
    "routingRunId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "role" "RecommendationRole" NOT NULL,
    "ruleScore" DECIMAL(6,4) NOT NULL,
    "aiScore" DECIMAL(6,4),
    "finalScore" DECIMAL(6,4) NOT NULL,
    "confidence" DECIMAL(6,4) NOT NULL,
    "reasonSummary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationSku" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "buSkuId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "confidence" DECIMAL(6,4) NOT NULL,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationSku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLog" (
    "id" TEXT NOT NULL,
    "routingRunId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "recipientId" TEXT,
    "messageType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "evidenceRefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "routingRecommendationId" TEXT NOT NULL,
    "assignedRole" "RecommendationRole" NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'APPROVED',
    "requiredActions" JSONB,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentArtifact" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "artifactType" "ArtifactType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "routingRunId" TEXT,
    "outcomeStatus" "OutcomeStatus" NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_externalLeadRef_key" ON "Lead"("externalLeadRef");

-- CreateIndex
CREATE INDEX "Lead_currentStatus_idx" ON "Lead"("currentStatus");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_sourceDocumentId_idx" ON "Lead"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "LeadFact_leadId_factKey_idx" ON "LeadFact"("leadId", "factKey");

-- CreateIndex
CREATE INDEX "LeadFact_factKey_factValue_idx" ON "LeadFact"("factKey", "factValue");

-- CreateIndex
CREATE INDEX "LeadFact_sourceDocumentId_idx" ON "LeadFact"("sourceDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadFact_leadId_factKey_factValue_key" ON "LeadFact"("leadId", "factKey", "factValue");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUnit_code_key" ON "BusinessUnit"("code");

-- CreateIndex
CREATE INDEX "BuSku_businessUnitId_isActive_idx" ON "BuSku"("businessUnitId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BuSku_businessUnitId_skuCode_key" ON "BuSku"("businessUnitId", "skuCode");

-- CreateIndex
CREATE INDEX "RoutingRuleSet_businessUnitId_status_idx" ON "RoutingRuleSet"("businessUnitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingRuleSet_businessUnitId_version_key" ON "RoutingRuleSet"("businessUnitId", "version");

-- CreateIndex
CREATE INDEX "RoutingRuleCondition_ruleSetId_factKey_idx" ON "RoutingRuleCondition"("ruleSetId", "factKey");

-- CreateIndex
CREATE INDEX "RoutingRuleCondition_factKey_operator_idx" ON "RoutingRuleCondition"("factKey", "operator");

-- CreateIndex
CREATE INDEX "RoutingRun_leadId_startedAt_idx" ON "RoutingRun"("leadId", "startedAt");

-- CreateIndex
CREATE INDEX "RoutingRun_status_idx" ON "RoutingRun"("status");

-- CreateIndex
CREATE INDEX "RoutingRecommendation_routingRunId_finalScore_idx" ON "RoutingRecommendation"("routingRunId", "finalScore");

-- CreateIndex
CREATE INDEX "RoutingRecommendation_businessUnitId_role_idx" ON "RoutingRecommendation"("businessUnitId", "role");

-- CreateIndex
CREATE INDEX "RecommendationSku_buSkuId_idx" ON "RecommendationSku"("buSkuId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationSku_recommendationId_rank_key" ON "RecommendationSku"("recommendationId", "rank");

-- CreateIndex
CREATE INDEX "AgentLog_routingRunId_createdAt_idx" ON "AgentLog"("routingRunId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentLog_agentId_idx" ON "AgentLog"("agentId");

-- CreateIndex
CREATE INDEX "Assignment_leadId_businessUnitId_idx" ON "Assignment"("leadId", "businessUnitId");

-- CreateIndex
CREATE INDEX "Assignment_status_idx" ON "Assignment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_routingRecommendationId_key" ON "Assignment"("routingRecommendationId");

-- CreateIndex
CREATE INDEX "AssignmentArtifact_assignmentId_artifactType_idx" ON "AssignmentArtifact"("assignmentId", "artifactType");

-- CreateIndex
CREATE INDEX "FeedbackEvent_leadId_eventAt_idx" ON "FeedbackEvent"("leadId", "eventAt");

-- CreateIndex
CREATE INDEX "FeedbackEvent_businessUnitId_eventAt_idx" ON "FeedbackEvent"("businessUnitId", "eventAt");

-- CreateIndex
CREATE INDEX "FeedbackEvent_routingRunId_idx" ON "FeedbackEvent"("routingRunId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "LeadDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFact" ADD CONSTRAINT "LeadFact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFact" ADD CONSTRAINT "LeadFact_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "LeadDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuSku" ADD CONSTRAINT "BuSku_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingRuleSet" ADD CONSTRAINT "RoutingRuleSet_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingRuleCondition" ADD CONSTRAINT "RoutingRuleCondition_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "RoutingRuleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingRun" ADD CONSTRAINT "RoutingRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingRecommendation" ADD CONSTRAINT "RoutingRecommendation_routingRunId_fkey" FOREIGN KEY ("routingRunId") REFERENCES "RoutingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingRecommendation" ADD CONSTRAINT "RoutingRecommendation_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationSku" ADD CONSTRAINT "RecommendationSku_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "RoutingRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationSku" ADD CONSTRAINT "RecommendationSku_buSkuId_fkey" FOREIGN KEY ("buSkuId") REFERENCES "BuSku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLog" ADD CONSTRAINT "AgentLog_routingRunId_fkey" FOREIGN KEY ("routingRunId") REFERENCES "RoutingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_routingRecommendationId_fkey" FOREIGN KEY ("routingRecommendationId") REFERENCES "RoutingRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentArtifact" ADD CONSTRAINT "AssignmentArtifact_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_routingRunId_fkey" FOREIGN KEY ("routingRunId") REFERENCES "RoutingRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "DocumentParseStatus" ADD VALUE 'ANALYZING';

-- AlterTable
ALTER TABLE "LeadDocument" ADD COLUMN     "analysisCompletedAt" TIMESTAMP(3),
ADD COLUMN     "analysisModel" TEXT,
ADD COLUMN     "analysisOperationId" TEXT,
ADD COLUMN     "analysisOperationLocation" TEXT,
ADD COLUMN     "analysisStartedAt" TIMESTAMP(3),
ADD COLUMN     "blobEtag" TEXT,
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "fileSizeBytes" INTEGER,
ADD COLUMN     "lastError" TEXT;

-- CreateIndex
CREATE INDEX "LeadDocument_parseStatus_createdAt_idx" ON "LeadDocument"("parseStatus", "createdAt");

-- CreateIndex
CREATE INDEX "LeadDocument_analysisOperationId_idx" ON "LeadDocument"("analysisOperationId");

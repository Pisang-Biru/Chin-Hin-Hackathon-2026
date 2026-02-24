-- Add assignment lifecycle statuses for Synergy approval + BU decision workflow.
ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'PENDING_SYNERGY';
ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'BU_REJECTED';

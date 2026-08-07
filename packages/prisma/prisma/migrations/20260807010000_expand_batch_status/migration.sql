-- Align BatchStatus with the domain lifecycle used by batch generation:
-- PENDING → PROCESSING → COMPLETED | PARTIAL | FAILED | CANCELLED
ALTER TYPE "BatchStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "BatchStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

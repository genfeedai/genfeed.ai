import { readWorkflowFalCompletionEvidence } from '@api/collections/credits/services/workflow-fal-completion-evidence.util';
import type { WorkflowGenerationNodeAllocation } from '@genfeedai/contracts/interfaces/billing';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const identity = { id: 'continuation', ingredientId: 'output', organizationId: 'org', executionId: 'execution' };
  const proof = { externalId: 'https://fal.example/actual.mp4', providerResult: { acceptedFalOutput: { externalId: 'https://fal.example/actual.mp4', completionQuantities: { width: 864, height: 496, duration: 6 } } } };
  const artifact = { s3Key: 'org/output/actual.mp4', metadata: { width: 864, height: 496, duration: 6, fps: 24, isDeleted: false } };
  const tx = { workflowNodeContinuation: { findFirst: vi.fn().mockResolvedValue(proof) }, ingredient: { findFirst: vi.fn().mockResolvedValue(artifact) } };
  const allocation = { dispatch: { quantities: { width: 1280, height: 720, duration: 8, framesPerSecond: 24, inputDuration: 3, referenceEvidenceHash: 'a'.repeat(64), selectors: { task: 'extension' } } } } as WorkflowGenerationNodeAllocation;
  return { identity, proof, artifact, allocation, tx: tx as unknown as Prisma.TransactionClient, mocks: tx };
}
describe('durable Fal workflow completion evidence', () => {
  it('uses observed output and admitted input references, never the requested output ceiling', async () => {
    const f = fixture();
    const result = await readWorkflowFalCompletionEvidence(f.tx, f.identity, f.allocation);
    expect(result.assetKey).toBe(f.artifact.s3Key);
    expect(result.completion).toMatchObject({ width: 864, height: 496, duration: 6, framesPerSecond: 24, inputDuration: 3, referenceEvidenceHash: 'a'.repeat(64) });
    expect(f.mocks.ingredient.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org', isDeleted: false, id: 'output' }) }));
  });
  it.each(['missing-provider', 'conflicting-output', 'above-ceiling', 'missing-storage', 'wrong-identity', 'missing-fps'])('retains funding for %s', async (kind) => {
    const f = fixture();
    if (kind === 'missing-provider') f.proof.providerResult.acceptedFalOutput.completionQuantities.duration = 0;
    if (kind === 'conflicting-output') f.artifact.metadata.width = 1000;
    if (kind === 'above-ceiling') f.allocation.dispatch.quantities.duration = 5;
    if (kind === 'missing-storage') f.artifact.s3Key = '';
    if (kind === 'wrong-identity') f.proof.externalId = 'https://fal.example/different.mp4';
    if (kind === 'missing-fps') f.artifact.metadata.fps = 0;
    await expect(readWorkflowFalCompletionEvidence(f.tx, f.identity, f.allocation)).rejects.toThrow();
  });
  it('settles a URL-only provider response using durable server measurements', async () => {
    const f = fixture();
    f.mocks.workflowNodeContinuation.findFirst.mockResolvedValue({
      externalId: f.proof.externalId,
      providerResult: {
        acceptedFalOutput: { externalId: f.proof.externalId },
        measuredFalOutput: { externalId: f.proof.externalId, measurement: { width: 864, height: 496, duration: 6, framesPerSecond: 24, assetHash: 'b'.repeat(64), sizeBytes: 1000, assetKey: f.artifact.s3Key } },
      },
    });
    await expect(readWorkflowFalCompletionEvidence(f.tx, f.identity, f.allocation)).resolves.toMatchObject({ completion: { duration: 6, width: 864, height: 496 } });
  });
  it.each(['wrong-url', 'conflicting-provider', 'conflicting-fps', 'missing-hash'])('refuses invalid measured completion: %s', async (kind) => {
    const f = fixture();
    const measured = { externalId: f.proof.externalId, measurement: { width: 864, height: 496, duration: 6, framesPerSecond: 24, assetHash: 'b'.repeat(64), sizeBytes: 1000, assetKey: f.artifact.s3Key } };
    if (kind === 'wrong-url') measured.externalId = 'different-url';
    if (kind === 'conflicting-provider') measured.measurement.duration = 5;
    if (kind === 'conflicting-fps') measured.measurement.framesPerSecond = 30;
    if (kind === 'missing-hash') measured.measurement.assetHash = '';
    f.mocks.workflowNodeContinuation.findFirst.mockResolvedValue({ ...f.proof, providerResult: { ...f.proof.providerResult, measuredFalOutput: measured } });
    await expect(readWorkflowFalCompletionEvidence(f.tx, f.identity, f.allocation)).rejects.toThrow();
  });
});

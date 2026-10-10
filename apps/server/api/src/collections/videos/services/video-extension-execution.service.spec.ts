import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { VideoExtensionExecutionService } from '@api/collections/videos/services/video-extension-execution.service';
import { PLAYGROUND_FABRICATED_EXTEND_WORKFLOW_ID } from '@api/collections/workflows/services/playground-extend-workflow-definition';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const sourceHash = 'a'.repeat(64);
const frameHash = 'b'.repeat(64);
function fixture() {
  const source = { id: 'source', brandId: 'brand', s3Key: 'videos/source.mp4' };
  const frame = { id: 'frame', s3Key: 'images/frame.jpg' };
  const prisma = { ingredient: { findFirst: vi.fn().mockResolvedValueOnce(source).mockResolvedValueOnce(frame) }, model: { findFirst: vi.fn().mockResolvedValue({ key: 'google/veo-3.1', provider: 'replicate', endpoint: 'google/veo-3.1' }) } };
  const access = { assert: vi.fn().mockResolvedValue(undefined) };
  const personas = { resolveCharacterReferences: vi.fn().mockResolvedValue(undefined) };
  const files = { getPresignedDownloadUrlForObjectKey: vi.fn().mockResolvedValue('https://stored/video'), fingerprintMedia: vi.fn().mockResolvedValueOnce({ assetHash: sourceHash, sizeBytes: 100 }).mockResolvedValueOnce({ assetHash: sourceHash, sizeBytes: 100 }).mockResolvedValueOnce({ assetHash: frameHash, sizeBytes: 10 }), probeMediaFromUrl: vi.fn().mockResolvedValue({ sizeBytes: 100, durationSeconds: 5 }), generateThumbnail: vi.fn().mockResolvedValue('https://stored/thumbnail') };
  const shared = { createMediaDocumentsInternal: vi.fn().mockResolvedValue({ ingredientData: { id: 'frame' } }) };
  const media = { processMediaForIngredient: vi.fn().mockResolvedValue(undefined) };
  const runner = { enqueueWorkflow: vi.fn().mockResolvedValue({ executionId: 'execution', status: 'PENDING' }) };
  const user = { id: 'actor', userId: 'actor', organizationId: 'org', apiKeyId: 'key', isApiKey: true, scopes: ['videos:create'] } as AuthenticatedUser;
  const service = new VideoExtensionExecutionService(prisma as never, access as never, personas as never, files as never, shared as never, media as never, { ingredientsEndpoint: 'https://assets' } as never, runner as never);
  return { prisma, access, personas, files, shared, media, runner, run: () => service.enqueue(user, 'source', { model: 'google/veo-3.1', duration: 8, prompt: 'Continue forward' }) };
}
describe('video continuation execution preparation', () => {
  it('persists and finalizes an independent last-frame asset before queuing the canonical graph', async () => {
    const f = fixture(); expect(await f.run()).toMatchObject({ executionId: 'execution' });
    expect(f.shared.createMediaDocumentsInternal).toHaveBeenCalledWith(expect.objectContaining({ category: IngredientCategory.IMAGE, parentId: 'source', sourceIds: ['source'], brandId: 'brand', organizationId: 'org', userId: 'actor' }));
    expect(f.media.processMediaForIngredient).toHaveBeenCalledWith('frame', IngredientCategory.IMAGE, 'https://stored/thumbnail');
    expect(f.runner.enqueueWorkflow).toHaveBeenCalledWith(expect.objectContaining({ canonicalId: PLAYGROUND_FABRICATED_EXTEND_WORKFLOW_ID, apiKeyId: 'key', actorScopes: ['videos:create'], inputValues: expect.objectContaining({ sourceVideo: { video: 'https://assets/videos/source' }, image: 'https://assets/images/frame', parentIngredientId: 'source', frameIngredientId: 'frame', sourceEvidence: expect.objectContaining({ sourceVersion: sourceHash, frame: expect.objectContaining({ assetId: 'frame', sourceVersion: frameHash }) }) }) }), { dispatchClass: 'interactive' });
    expect(f.media.processMediaForIngredient.mock.invocationCallOrder[0]).toBeLessThan(f.runner.enqueueWorkflow.mock.invocationCallOrder[0]);
    expect(f.prisma.ingredient.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org', brandId: 'brand', category: IngredientCategory.IMAGE, parentId: 'source', status: { in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED] } }) }));
  });
  it.each(['brand', 'character'])('refuses revoked %s access before files or output effects', async (kind) => {
    const f = fixture(); (kind === 'brand' ? f.access.assert : f.personas.resolveCharacterReferences).mockRejectedValueOnce(new Error('Access revoked'));
    await expect(f.run()).rejects.toThrow('Access revoked'); expect(f.files.generateThumbnail).not.toHaveBeenCalled(); expect(f.shared.createMediaDocumentsInternal).not.toHaveBeenCalled(); expect(f.runner.enqueueWorkflow).not.toHaveBeenCalled();
  });
  it('refuses bytes that change during probing without creating a frame or execution', async () => {
    const f = fixture(); f.files.fingerprintMedia.mockReset().mockResolvedValueOnce({ assetHash: sourceHash, sizeBytes: 100 }).mockResolvedValueOnce({ assetHash: frameHash, sizeBytes: 100 });
    await expect(f.run()).rejects.toThrow('source changed'); expect(f.shared.createMediaDocumentsInternal).not.toHaveBeenCalled(); expect(f.runner.enqueueWorkflow).not.toHaveBeenCalled();
  });
  it('never dispatches when the last frame has no persisted storage object', async () => {
    const f = fixture(); f.prisma.ingredient.findFirst.mockReset().mockResolvedValueOnce({ id: 'source', brandId: 'brand', s3Key: 'videos/source.mp4' }).mockResolvedValueOnce(null);
    await expect(f.run()).rejects.toThrow('last frame has not been stored'); expect(f.runner.enqueueWorkflow).not.toHaveBeenCalled();
  });
});

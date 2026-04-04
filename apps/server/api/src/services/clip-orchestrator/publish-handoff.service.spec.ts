import {
  type PublishHandoffPayload,
  PublishHandoffService,
} from '@api/services/clip-orchestrator/publish-handoff.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createLogger = () => ({
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  setContext: vi.fn(),
  verbose: vi.fn(),
  warn: vi.fn(),
});

describe('PublishHandoffService', () => {
  let service: PublishHandoffService;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger();
    service = new PublishHandoffService(logger as any);
  });

  // -----------------------------------------------------------------------
  // preparePublishHandoff — happy path
  // -----------------------------------------------------------------------

  it('should prepare a handoff payload with defaults', async () => {
    const payload = await service.preparePublishHandoff('proj-1', [
      'asset-a',
      'asset-b',
    ]);

    expect(payload.clipProjectId).toBe('proj-1');
    expect(payload.assets).toHaveLength(2);
    expect(payload.platforms).toEqual(['instagram']);
    expect(payload.schedule).toBe('immediate');
    expect(payload.confirmBeforePublish).toBe(true);
    expect(payload.preparedAt).toBeDefined();
  });

  it('should accept custom platforms and schedule', async () => {
    const payload = await service.preparePublishHandoff('proj-2', ['asset-x'], {
      platforms: ['tiktok', 'youtube'],
      schedule: 'scheduled',
    });

    expect(payload.platforms).toEqual(['tiktok', 'youtube']);
    expect(payload.schedule).toBe('scheduled');
  });

  it('should forward metadata to the payload', async () => {
    const meta = { campaignId: 'camp-1', tags: ['viral'] };
    const payload = await service.preparePublishHandoff('proj-3', ['asset-a'], {
      metadata: meta,
    });

    expect(payload.metadata).toEqual(meta);
  });

  it('should always set confirmBeforePublish to true', async () => {
    const payload = await service.preparePublishHandoff('proj-4', ['a']);

    // Even without explicit options, the flag must be true
    expect(payload.confirmBeforePublish).toBe(true);
  });

  // -----------------------------------------------------------------------
  // preparePublishHandoff — error cases
  // -----------------------------------------------------------------------

  it('should throw when clipProjectId is empty', async () => {
    await expect(
      service.preparePublishHandoff('', ['asset-a']),
    ).rejects.toThrow('clipProjectId is required');
  });

  it('should throw when assetIds is empty', async () => {
    await expect(service.preparePublishHandoff('proj-1', [])).rejects.toThrow(
      'At least one asset ID is required',
    );
  });

  // -----------------------------------------------------------------------
  // validatePayload
  // -----------------------------------------------------------------------

  it('should validate a correct payload', async () => {
    const payload = await service.preparePublishHandoff('proj-1', ['a']);
    const result = service.validatePayload(payload);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should flag invalid payload with missing fields', () => {
    const payload: PublishHandoffPayload = {
      assets: [],
      clipProjectId: '',
      confirmBeforePublish: true,
      platforms: [],
      preparedAt: new Date().toISOString(),
      schedule: 'immediate',
    };

    const result = service.validatePayload(payload);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

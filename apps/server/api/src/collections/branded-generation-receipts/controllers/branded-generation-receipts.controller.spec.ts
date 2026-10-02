import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

const hash = `sha256:${'a'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';
function receipt(): BrandedGenerationReceiptV1 {
  return {
    schemaVersion: 1,
    id: 'receipt',
    organizationId: 'org',
    brandId: 'brand',
    actorId: 'PRIVATE_ACTOR',
    requestKey: 'PRIVATE_REQUEST',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'created',
    mode: 'raw',
    surface: 'api',
    contentType: 'post',
    format: 'text',
    createdAt: time,
    updatedAt: time,
    snapshot: null,
    resolutionHash: null,
    layers: [],
    learning: null,
    prompts: {
      original: { contentHash: hash, retention: 'pending' },
      enhanced: null,
      compiled: null,
    },
    execution: null,
    artifact: null,
    validation: null,
    compliance: 'not_claimed',
    diagnostics: [],
    costs: [{ id: 'cost', stage: 'generation', status: 'pending' }],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 0,
    },
    isDeleted: false,
  };
}

import 'reflect-metadata';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandedGenerationReceiptsController } from '@api/collections/branded-generation-receipts/controllers/branded-generation-receipts.controller';
import {
  BrandedGenerationPromptInspectionQueryDto,
  BrandedGenerationReceiptEmptyQueryDto,
  BrandedGenerationReceiptHistoryQueryDto,
  BrandedGenerationReceiptListQueryDto,
  BrandIdentityPreviewQueryDto,
} from '@api/collections/branded-generation-receipts/dto/branded-generation-receipt-query.dto';
import type { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import type { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import {
  BadRequestException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = { originalUrl: '/brands/brand/generation-receipts' } as Request;
const user = {
  organizationId: 'org',
  userId: 'actor',
  id: 'legacy',
} as AuthenticatedUser;
function setup() {
  const snapshot: BrandIdentitySnapshotV1 = {
    schemaVersion: 1,
    organizationId: 'org',
    brandId: 'brand',
    revisionId: 'revision',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: time,
    contentHash: hash,
    identity: { name: 'Saved identity' },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: {
      schemaVersion: 1,
      evidence: [],
      facts: [],
      palette: [],
      typography: [],
      mandatory: [],
      avoid: [],
      examples: [],
      assets: [],
    },
    diagnostics: [],
  };
  const identities = { preview: vi.fn().mockResolvedValue(snapshot) };
  const service = {
    list: vi
      .fn()
      .mockResolvedValue({ items: [receipt()], nextCursor: 'cursor' }),
    get: vi.fn().mockResolvedValue(receipt()),
    history: vi
      .fn()
      .mockResolvedValue({ items: [receipt()], nextAfterRevision: null }),
    readPrompt: vi.fn().mockResolvedValue({
      status: 'retained',
      text: 'Exact saved bytes',
      contentHash: hash,
    }),
  };
  return {
    service,
    identities,
    snapshot,
    controller: new BrandedGenerationReceiptsController(
      service as unknown as BrandedGenerationReceiptsService,
      identities as unknown as BrandIdentitySnapshotService,
    ),
  };
}
describe('receipt read controller', () => {
  beforeEach(() => vi.clearAllMocks());
  it('mounts a real serialized identity preview with server-derived actor and exact current-versus-receipt source', async () => {
    const { controller, identities, service, snapshot } = setup();
    const current = await controller.identityPreview(
      request,
      user,
      'brand',
      {},
    );
    expect(identities.preview).toHaveBeenCalledExactlyOnceWith(
      { organizationId: 'org', actorId: 'actor', brandId: 'brand' },
      undefined,
    );
    expect(current.data).toMatchObject({
      id: snapshot.contentHash,
      type: 'brand-identity-preview',
      attributes: { snapshot, source: 'current_approved_revision' },
    });
    const historical = await controller.identityPreview(
      request,
      user,
      'brand',
      { receiptId: 'receipt' },
    );
    expect(identities.preview).toHaveBeenLastCalledWith(
      { organizationId: 'org', actorId: 'actor', brandId: 'brand' },
      'receipt',
    );
    expect(historical.data).toMatchObject({
      attributes: { source: 'receipt_snapshot' },
    });
    const attributes = historical.data?.attributes;
    if (!attributes || typeof attributes !== 'object')
      throw new Error('Expected preview attributes');
    expect(Object.keys(attributes).sort()).toEqual(['snapshot', 'source']);
    expect(service.readPrompt).not.toHaveBeenCalled();
    expect(service.get).not.toHaveBeenCalled();
  });
  it('denies forged/missing scope and malformed receipt selection before identity lookup, preserving stable unavailable reasons', async () => {
    const { controller, identities } = setup();
    await expect(
      controller.identityPreview(request, {} as AuthenticatedUser, 'brand', {}),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.identityPreview(request, user, 'bad\u0080id', {}),
    ).rejects.toThrow('receipt_query_invalid');
    await expect(
      controller.identityPreview(request, user, 'brand', {
        receiptId: 'bad\u0000id',
      }),
    ).rejects.toThrow('receipt_query_invalid');
    expect(identities.preview).not.toHaveBeenCalled();
    const failure = new Error('brand_identity_snapshot_unavailable');
    identities.preview.mockRejectedValueOnce(failure);
    await expect(
      controller.identityPreview(request, user, 'brand', {
        receiptId: 'receipt',
      }),
    ).rejects.toBe(failure);
  });
  it('accepts only an optional canonical bounded scalar receiptId and rejects additional caller authority', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const metadata = {
      type: 'query' as const,
      metatype: BrandIdentityPreviewQueryDto,
    };
    expect(await pipe.transform({}, metadata)).toEqual({});
    expect(
      await pipe.transform({ receiptId: 'x'.repeat(256) }, metadata),
    ).toMatchObject({ receiptId: 'x'.repeat(256) });
    for (const receiptId of [
      null,
      '',
      'x'.repeat(257),
      'bad\u0000id',
      'bad\u0080id',
      ['receipt'],
      { id: 'receipt' },
    ])
      await expect(pipe.transform({ receiptId }, metadata)).rejects.toThrow();
    for (const key of [
      'actorId',
      'organizationId',
      'brandId',
      'snapshot',
      'mode',
      'source',
      'revisionId',
    ])
      await expect(
        pipe.transform({ [key]: 'forged' }, metadata),
      ).rejects.toThrow();
  });
  it('passes only authenticated actor and route brand and actual cursor links', async () => {
    const { service, controller } = setup();
    const result = await controller.list(request, user, 'brand', { limit: 10 });
    expect(service.list).toHaveBeenCalledExactlyOnceWith(
      { organizationId: 'org', actorId: 'actor', brandId: 'brand' },
      { limit: 10 },
    );
    expect(result.links).toMatchObject({
      cursor: { hasMore: true, limit: 10, nextCursor: 'cursor' },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
    expect(service.readPrompt).not.toHaveBeenCalled();
  });
  it('reads current metadata/history without decrypt and requires an exact historical revision', async () => {
    const { service, controller } = setup();
    await controller.get(request, user, 'brand', 'receipt', {});
    await controller.history(request, user, 'brand', 'receipt', {
      limit: 10,
      afterRevision: 0,
    });
    await controller.getRevision(request, user, 'brand', 'receipt', '0', {});
    expect(service.history).toHaveBeenLastCalledWith(
      { organizationId: 'org', actorId: 'actor', brandId: 'brand' },
      'receipt',
      { limit: 1 },
    );
    await expect(
      controller.getRevision(request, user, 'brand', 'receipt', '1', {}),
    ).rejects.toThrow('receipt_not_found');
    expect(service.readPrompt).not.toHaveBeenCalled();
  });
  it('reads only explicit exact prompt stage/revision and preserves forbidden/purged behavior', async () => {
    const { service, controller } = setup();
    await controller.readPrompt(request, user, 'brand', 'receipt', 'original', {
      revision: 2,
    });
    expect(service.readPrompt).toHaveBeenCalledExactlyOnceWith(
      { organizationId: 'org', actorId: 'actor', brandId: 'brand' },
      'receipt',
      'original',
      2,
    );
    const denied = new ForbiddenException('receipt_access_denied');
    service.readPrompt.mockRejectedValueOnce(denied);
    await expect(
      controller.readPrompt(request, user, 'brand', 'receipt', 'compiled', {
        revision: 2,
      }),
    ).rejects.toBe(denied);
    service.readPrompt.mockResolvedValueOnce({
      status: 'unavailable',
      reasonCode: 'prompt_payload_purged',
    });
    expect(
      JSON.stringify(
        await controller.readPrompt(
          request,
          user,
          'brand',
          'receipt',
          'compiled',
          { revision: 2 },
        ),
      ),
    ).toContain('prompt_payload_purged');
  });
  it.each(['01', '-1', '2147483648', '1e2', '1.0', ''])(
    'rejects malformed revision %s before lookup',
    async (revision) => {
      const { service, controller } = setup();
      await expect(
        controller.getRevision(request, user, 'brand', 'receipt', revision, {}),
      ).rejects.toThrow(BadRequestException);
      expect(service.history).not.toHaveBeenCalled();
    },
  );
  it('denies missing auth and malformed route IDs before source calls', async () => {
    const { service, controller } = setup();
    await expect(
      controller.list(request, {} as AuthenticatedUser, 'brand', { limit: 10 }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.get(request, user, 'brand', 'bad\u0000id', {}),
    ).rejects.toThrow(BadRequestException);
    expect(service.get).not.toHaveBeenCalled();
  });
  it('strictly validates every read query including empty metadata queries', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    for (const metatype of [
      BrandedGenerationReceiptListQueryDto,
      BrandedGenerationReceiptHistoryQueryDto,
      BrandedGenerationPromptInspectionQueryDto,
      BrandedGenerationReceiptEmptyQueryDto,
    ])
      await expect(
        pipe.transform({ actorId: 'forged' }, { type: 'query', metatype }),
      ).rejects.toThrow();
    await expect(
      pipe.transform(
        { revision: ['0', '1'] },
        { type: 'query', metatype: BrandedGenerationPromptInspectionQueryDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { limit: 11 },
        { type: 'query', metatype: BrandedGenerationReceiptListQueryDto },
      ),
    ).rejects.toThrow();
    expect(
      await pipe.transform(
        { revision: '0' },
        { type: 'query', metatype: BrandedGenerationPromptInspectionQueryDto },
      ),
    ).toMatchObject({ revision: 0 });
  });
  it.each(['organizationId', 'userId'] as const)(
    'rejects malformed authenticated %s without lookup',
    async (field) => {
      const { controller, service } = setup();
      await expect(
        controller.list(request, { ...user, [field]: 'bad\u0000id' }, 'brand', {
          limit: 10,
        }),
      ).rejects.toThrow('receipt_query_invalid');
      expect(service.list).not.toHaveBeenCalled();
    },
  );
});

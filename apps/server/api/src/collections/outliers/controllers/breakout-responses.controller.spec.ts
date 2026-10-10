import 'reflect-metadata';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BreakoutResponsesController } from '@api/collections/outliers/controllers/breakout-responses.controller';
import {
  BreakoutResponseDetailDto,
  BreakoutResponseListDto,
} from '@api/collections/outliers/dto/breakout-response-query.dto';
import type { BreakoutResponseReadsService } from '@api/collections/outliers/services/breakout-response-reads.service';
import { runWithTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import type { BreakoutResponseView } from '@genfeedai/contracts/interfaces';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

const user: AuthenticatedUser = {
  id: 'legacy-display-id',
  userId: 'canonical-user',
  organizationId: 'org-a',
  brandId: 'brand-a',
};
const request = {
  originalUrl: '/brands/brand-a/breakout-responses',
} as Request;
const view: BreakoutResponseView = {
  id: 'response-a',
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: 'twitter',
  state: 'detected',
  detectedAt: '2026-10-09T12:00:00Z',
  createdAt: '2026-10-09T12:00:00Z',
  updatedAt: '2026-10-09T12:00:00Z',
  isDeleted: false,
  source: {
    kind: 'native_source_post',
    id: 'native-a',
    externalId: 'tweet-a',
    logicalPostId: 'logical-a',
    format: 'text',
    publishedAt: '2026-10-09T11:00:00Z',
    status: 'current',
  },
  trigger: null,
  outputs: null,
  outputRegistryStatus: 'not_loaded',
  capacity: null,
  readAt: '2026-10-09T12:00:00Z',
};
function fixture() {
  const list = vi.fn(async () => ({
    docs: [view],
    page: 1,
    limit: 20,
    totalDocs: 1,
    totalPages: 1,
  }));
  const detail = vi.fn(async () => view);
  const controller = new BreakoutResponsesController({
    list,
    detail,
  } as unknown as BreakoutResponseReadsService);
  return { list, detail, controller };
}
describe('manual read-only breakout HTTP contracts', () => {
  it('uses canonical user and selected tenant scope, then the canonical JSON:API serializer', async () => {
    const h = fixture();
    const result = await runWithTenantReadScope(
      {
        organizationId: 'org-selected',
        brandId: 'brand-a',
        isOrganizationOverride: true,
      },
      () =>
        h.controller.list(
          request,
          user,
          'brand-a',
          new BreakoutResponseListDto(),
        ),
    );
    expect(h.list).toHaveBeenCalledWith(
      {
        organizationId: 'org-selected',
        brandId: 'brand-a',
        actorId: user.userId,
      },
      expect.any(BreakoutResponseListDto),
    );
    expect(result).toMatchObject({
      data: [
        {
          id: view.id,
          type: 'breakout-response',
          attributes: {
            state: 'detected',
            source: { kind: 'native_source_post' },
          },
        },
      ],
    });
    expect(result).not.toHaveProperty('docs');
  });
  it('does not create a fallback principal from display identity when canonical user context is missing', async () => {
    const h = fixture();
    await expect(
      h.controller.detail(
        request,
        { ...user, userId: '' },
        'brand-a',
        view.id,
        new BreakoutResponseDetailDto(),
      ),
    ).rejects.toThrow('breakout_access_denied');
    expect(h.detail).not.toHaveBeenCalled();
  });
  it('holds API-key reads rather than dropping a capped key context into the manual member authority', async () => {
    const h = fixture();
    await expect(
      h.controller.detail(
        request,
        { ...user, isApiKey: true, apiKeyId: 'key-a' },
        'brand-a',
        view.id,
        new BreakoutResponseDetailDto(),
      ),
    ).rejects.toThrow('breakout_access_denied');
    expect(h.detail).not.toHaveBeenCalled();
  });
  it.each([{ limit: 101 }, { page: 0 }, { credentialId: '' }])(
    'rejects invalid list query %j',
    async (query) => {
      expect(
        (await validate(plainToInstance(BreakoutResponseListDto, query)))
          .length,
      ).toBeGreaterThan(0);
    },
  );
  it('rejects a blank capacity strategy and preserves explicit absence', async () => {
    expect(
      (
        await validate(
          plainToInstance(BreakoutResponseDetailDto, { strategyId: '' }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(await validate(new BreakoutResponseDetailDto())).toEqual([]);
  });
});

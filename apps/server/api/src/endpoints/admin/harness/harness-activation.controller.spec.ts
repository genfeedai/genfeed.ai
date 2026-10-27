import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { HarnessActivationController } from '@api/endpoints/admin/harness/harness-activation.controller';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

const request = {
  get: () => 'api.genfeed.ai',
  originalUrl: '/admin/harness/activation',
  protocol: 'https',
  query: {},
  url: '/admin/harness/activation',
} as unknown as Request;

function createController(): HarnessActivationController {
  const config = { get: () => undefined } as unknown as ConfigService;
  const logger = { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService;
  return new HarnessActivationController(
    new ContentHarnessService(config, logger),
  );
}

type ActivationDocument = {
  data: {
    attributes: {
      builtInPackIds: string[];
      external: unknown[];
      generatedAt: string;
      packs: Array<{ id: string; version: string }>;
    };
    type: string;
  };
};

describe('HarnessActivationController', () => {
  it('is reachable only by an allow-listed platform admin', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      HarnessActivationController,
    ) as unknown[];
    expect(guards).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it('reports the packs the running process loaded, with versions', async () => {
    const document = (await createController().getActivation(
      request,
    )) as unknown as ActivationDocument;
    const { attributes } = document.data;

    expect(document.data.type).toBe('harness-activation-report');
    expect(attributes.builtInPackIds).toContain('core-baseline');
    expect(attributes.builtInPackIds).toContain('platform-linkedin');
    expect(attributes.external).toEqual([]);
    expect(attributes.packs.map((pack) => pack.id)).toEqual(
      attributes.builtInPackIds,
    );
    for (const pack of attributes.packs) {
      expect(pack.version).toMatch(/^\d+\.\d+\.\d+/u);
    }
    expect(Number.isNaN(Date.parse(attributes.generatedAt))).toBe(false);
  });
});

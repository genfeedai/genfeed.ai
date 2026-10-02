import 'reflect-metadata';
import { BrandedGenerationReceiptsHttpModule } from '@api/collections/branded-generation-receipts/branded-generation-receipts-http.module';
import { BrandedGenerationReceiptsController } from '@api/collections/branded-generation-receipts/controllers/branded-generation-receipts.controller';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  PIPES_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

describe('receipt HTTP module boundary', () => {
  it('imports existing storage exactly once with no duplicated providers', () => {
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        BrandedGenerationReceiptsHttpModule,
      ),
    ).toEqual([BrandedGenerationReceiptsModule]);
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.CONTROLLERS,
        BrandedGenerationReceiptsHttpModule,
      ),
    ).toEqual([BrandedGenerationReceiptsController]);
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        BrandedGenerationReceiptsHttpModule,
      ) ?? [],
    ).toEqual([]);
  });
  it('protects every GET with private no-store caching and authenticated strict validation', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, BrandedGenerationReceiptsController),
    ).toHaveLength(1);
    expect(
      Reflect.getMetadata(PIPES_METADATA, BrandedGenerationReceiptsController),
    ).toHaveLength(1);
    for (const method of [
      'list',
      'identityPreview',
      'get',
      'history',
      'getRevision',
      'readPrompt',
    ] as const) {
      const headers = Reflect.getMetadata(
        HEADERS_METADATA,
        BrandedGenerationReceiptsController.prototype[method],
      );
      expect(headers).toEqual(
        expect.arrayContaining([
          { name: 'Cache-Control', value: 'private,no-store' },
          { name: 'Vary', value: 'Cookie,Authorization' },
        ]),
      );
    }
  });
  it('registers and exports the required preview service exactly once and orders its static GET before receipt parameters', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      BrandedGenerationReceiptsModule,
    );
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      BrandedGenerationReceiptsModule,
    );
    expect(
      providers.filter(
        (provider: unknown) => provider === BrandIdentitySnapshotService,
      ),
    ).toEqual([BrandIdentitySnapshotService]);
    expect(
      exports.filter(
        (provider: unknown) => provider === BrandIdentitySnapshotService,
      ),
    ).toEqual([BrandIdentitySnapshotService]);
    const prototype = BrandedGenerationReceiptsController.prototype;
    expect(Reflect.getMetadata(PATH_METADATA, prototype.identityPreview)).toBe(
      'identity-preview',
    );
    expect(
      Reflect.getMetadata(METHOD_METADATA, prototype.identityPreview),
    ).toBe(0);
    const methods = Object.getOwnPropertyNames(prototype);
    expect(methods.indexOf('identityPreview')).toBeLessThan(
      methods.indexOf('get'),
    );
  });
});

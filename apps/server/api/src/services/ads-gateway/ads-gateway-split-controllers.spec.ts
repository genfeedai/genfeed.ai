import { readFileSync } from 'node:fs';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { GoogleAdsAdapter } from '@api/services/ads-gateway/adapters/google-ads.adapter';
import { MetaAdsAdapter } from '@api/services/ads-gateway/adapters/meta-ads.adapter';
import { TikTokAdsAdapter } from '@api/services/ads-gateway/adapters/tiktok-ads.adapter';
import { XAdsAdapter } from '@api/services/ads-gateway/adapters/x-ads.adapter';
import { AdsGatewayController } from '@api/services/ads-gateway/ads-gateway.controller';
import { AdsGatewayModule } from '@api/services/ads-gateway/ads-gateway.module';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { AdsGatewayRequestContextService } from '@api/services/ads-gateway/ads-gateway-request-context.service';
import { AdsGatewayWriteController } from '@api/services/ads-gateway/ads-gateway-write.controller';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

const WRITE_ROUTES = [
  [
    'createCampaign',
    ':platform/campaigns',
    RequestMethod.POST,
    'AdsGatewayController.createCampaign',
  ],
  [
    'updateCampaign',
    ':platform/campaigns/:campaignId',
    RequestMethod.PUT,
    'AdsGatewayController.updateCampaign',
  ],
  [
    'createAdSet',
    ':platform/adsets',
    RequestMethod.POST,
    'AdsGatewayController.createAdSet',
  ],
  [
    'createAd',
    ':platform/ads',
    RequestMethod.POST,
    'AdsGatewayController.createAd',
  ],
] as const;

describe('Ads Gateway split controllers', () => {
  it.each(WRITE_ROUTES)(
    'preserves %s path, verb, and legacy OpenAPI identity',
    (methodName, path, method, operationId) => {
      const handler = AdsGatewayWriteController.prototype[methodName];

      expect(
        Reflect.getMetadata(PATH_METADATA, AdsGatewayWriteController),
      ).toBe('ads');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({ operationId, summary: methodName });
    },
  );

  it.each([AdsGatewayWriteController, AdsGatewayController])(
    'preserves the shared role guard on %s',
    (controllerClass) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controllerClass)).toContain(
        RolesGuard,
      );
    },
  );

  it('registers the write sibling before the read controller and shares context orchestration', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AdsGatewayModule),
    ).toEqual([AdsGatewayWriteController, AdsGatewayController]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AdsGatewayModule),
    ).toEqual([
      AdsGatewayService,
      AdsGatewayRequestContextService,
      MetaAdsAdapter,
      GoogleAdsAdapter,
      TikTokAdsAdapter,
      XAdsAdapter,
    ]);
  });

  it('registers one unique transport for every read and write route', () => {
    const prototypes = [
      AdsGatewayWriteController.prototype,
      AdsGatewayController.prototype,
    ] as unknown as Array<Record<string, object>>;
    const routeSignatures = prototypes.flatMap((prototype) =>
      Object.getOwnPropertyNames(prototype)
        .filter((name) => name !== 'constructor')
        .map((name) => prototype[name])
        .filter((handler) => Reflect.hasMetadata(PATH_METADATA, handler))
        .map(
          (handler) =>
            `${Reflect.getMetadata(METHOD_METADATA, handler)}:${Reflect.getMetadata(PATH_METADATA, handler)}`,
        ),
    );

    expect(routeSignatures).toHaveLength(13);
    expect(new Set(routeSignatures).size).toBe(routeSignatures.length);
  });

  it.each(WRITE_ROUTES.map(([methodName]) => methodName))(
    'removes moved handler %s from AdsGatewayController',
    (methodName) => {
      expect(
        Reflect.get(AdsGatewayController.prototype, methodName),
      ).toBeUndefined();
    },
  );

  it('keeps the two controllers and shared context service within their line budgets', () => {
    const sources = [
      './ads-gateway.controller.ts',
      './ads-gateway-write.controller.ts',
      './ads-gateway-request-context.service.ts',
    ].map((relativePath) =>
      readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    );

    expect(sources[0].trimEnd().split('\n').length).toBeLessThan(500);
    expect(sources[1].trimEnd().split('\n').length).toBeLessThan(300);
    expect(sources[2].trimEnd().split('\n').length).toBeLessThan(300);
  });
});

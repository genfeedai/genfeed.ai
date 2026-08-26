import { OutreachCampaignTargetsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaign-targets.controller';
import { OutreachCampaignsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaigns.controller';
import { OutreachCampaignsModule } from '@api/collections/outreach-campaigns/outreach-campaigns.module';
import { RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('Outreach campaign split controllers', () => {
  it.each([
    ['addTargets', ':id/targets', RequestMethod.POST],
    ['parseUrlEndpoint', 'parse-url', RequestMethod.POST],
    ['getTargets', ':id/targets', RequestMethod.GET],
    ['discoverTargets', ':id/targets/discover', RequestMethod.POST],
    ['previewReply', ':id/targets/:targetId/preview', RequestMethod.POST],
  ] as const)(
    'preserves OutreachCampaignsController.%s route and OpenAPI metadata',
    (methodName, path, requestMethod) => {
      const handler = Reflect.get(
        OutreachCampaignTargetsController.prototype,
        methodName,
      );

      expect(
        Reflect.getMetadata(PATH_METADATA, OutreachCampaignTargetsController),
      ).toBe('outreach-campaigns');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({
        operationId: `OutreachCampaignsController.${methodName}`,
      });
    },
  );

  it.each([
    'addTargets',
    'parseUrlEndpoint',
    'discoverTargets',
    'previewReply',
  ] as const)('preserves explicit 200 status for %s', (methodName) => {
    const handler = Reflect.get(
      OutreachCampaignTargetsController.prototype,
      methodName,
    );

    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
  });

  it.each([
    'addTargets',
    'parseUrlEndpoint',
    'getTargets',
    'discoverTargets',
    'previewReply',
  ] as const)(
    'removes moved handler %s from the CRUD controller',
    (methodName) => {
      expect(
        Reflect.get(OutreachCampaignsController.prototype, methodName),
      ).toBeUndefined();
    },
  );

  it('registers the target sibling before the wildcard CRUD controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, OutreachCampaignsModule),
    ).toEqual([OutreachCampaignTargetsController, OutreachCampaignsController]);
  });
});

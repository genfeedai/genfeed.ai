import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminFleetController } from '@api/endpoints/admin/fleet/fleet.controller';
import { AdminFleetModule } from '@api/endpoints/admin/fleet/fleet.module';
import { AdminFleetMediaController } from '@api/endpoints/admin/fleet/fleet-media.controller';
import { AdminFleetOperationsController } from '@api/endpoints/admin/fleet/fleet-operations.controller';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('Admin Fleet split controllers', () => {
  it.each([
    [AdminFleetMediaController, 'listAssets', 'assets', RequestMethod.GET],
    [
      AdminFleetMediaController,
      'reviewAsset',
      'assets/:id/review',
      RequestMethod.PATCH,
    ],
    [
      AdminFleetMediaController,
      'publishAsset',
      'assets/:id/publish',
      RequestMethod.POST,
    ],
    [
      AdminFleetMediaController,
      'generateImage',
      'generate',
      RequestMethod.POST,
    ],
    [
      AdminFleetMediaController,
      'createGenerateJob',
      'generate/jobs',
      RequestMethod.POST,
    ],
    [
      AdminFleetMediaController,
      'getGenerateJob',
      'generate/jobs/:jobId',
      RequestMethod.GET,
    ],
    [
      AdminFleetMediaController,
      'generateLipSync',
      'lip-sync',
      RequestMethod.POST,
    ],
    [
      AdminFleetMediaController,
      'getLipSyncStatus',
      'lip-sync/:jobId',
      RequestMethod.GET,
    ],
    [AdminFleetMediaController, 'listVoices', 'voices', RequestMethod.GET],
    [
      AdminFleetMediaController,
      'generateVoice',
      'voices/generate',
      RequestMethod.POST,
    ],
    [
      AdminFleetMediaController,
      'listTrainings',
      'trainings',
      RequestMethod.GET,
    ],
    [
      AdminFleetMediaController,
      'getTraining',
      'trainings/:id',
      RequestMethod.GET,
    ],
    [
      AdminFleetMediaController,
      'startTraining',
      'trainings',
      RequestMethod.POST,
    ],
    [
      AdminFleetOperationsController,
      'listCampaigns',
      'pipeline/campaigns',
      RequestMethod.GET,
    ],
    [
      AdminFleetOperationsController,
      'getPipelineStats',
      'pipeline/stats',
      RequestMethod.GET,
    ],
    [
      AdminFleetOperationsController,
      'getEC2Status',
      'infrastructure/ec2/status',
      RequestMethod.GET,
    ],
    [
      AdminFleetOperationsController,
      'ec2Action',
      'infrastructure/ec2/action',
      RequestMethod.POST,
    ],
    [
      AdminFleetOperationsController,
      'ec2ActionAll',
      'infrastructure/ec2/action-all',
      RequestMethod.POST,
    ],
    [
      AdminFleetOperationsController,
      'invalidateCloudFront',
      'infrastructure/cloudfront/invalidate',
      RequestMethod.POST,
    ],
    [
      AdminFleetOperationsController,
      'getServiceHealth',
      'infrastructure/services',
      RequestMethod.GET,
    ],
    [
      AdminFleetOperationsController,
      'getFleetHealth',
      'infrastructure/fleet/health',
      RequestMethod.GET,
    ],
  ] as const)('preserves %s.%s route and OpenAPI identity', (controllerClass, methodName, path, requestMethod) => {
    const handler = Reflect.get(
      controllerClass.prototype,
      methodName,
    ) as object;

    expect(Reflect.getMetadata(PATH_METADATA, controllerClass)).toEqual([
      'admin/fleet',
      'admin/darkroom',
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
    expect(controllerClass.name).toBe('AdminFleetController');
  });

  it.each([
    AdminFleetMediaController,
    AdminFleetOperationsController,
    AdminFleetController,
  ])('preserves the shared admin Fleet guard boundary', (controllerClass) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controllerClass)).toEqual([
      IpWhitelistGuard,
      SuperAdminGuard,
    ]);
  });

  it('registers static sibling controllers before the character facade', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AdminFleetModule),
    ).toEqual([
      AdminFleetMediaController,
      AdminFleetOperationsController,
      AdminFleetController,
    ]);
  });
});

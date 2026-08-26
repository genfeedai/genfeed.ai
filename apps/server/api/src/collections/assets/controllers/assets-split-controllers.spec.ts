import { readFileSync } from 'node:fs';
import { AssetsModule } from '@api/collections/assets/assets.module';
import { AssetsController } from '@api/collections/assets/controllers/assets.controller';
import { AssetsIngestionController } from '@api/collections/assets/controllers/operations/assets-ingestion.controller';
import { AssetsOperationsController } from '@api/collections/assets/controllers/operations/assets-operations.controller';
import { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import { CreateFromIngredientDto } from '@api/collections/assets/dto/create-from-ingredient.dto';
import { AssetIngestionService } from '@api/collections/assets/services/asset-ingestion.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';

describe('Assets split controllers', () => {
  it.each([
    ['createUpload', 'upload', 'AssetsOperationsController.createUpload'],
    [
      'createFromIngredient',
      'from-ingredient',
      'AssetsOperationsController.createFromIngredient',
    ],
  ] as const)(
    'preserves %s route and legacy OpenAPI metadata',
    (methodName, path, operationId) => {
      const handler = Reflect.get(
        AssetsIngestionController.prototype,
        methodName,
      ) as object;

      expect(
        Reflect.getMetadata(PATH_METADATA, AssetsIngestionController),
      ).toBe('assets');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({ operationId, summary: methodName });
    },
  );

  it.each([
    AssetsIngestionController,
    AssetsOperationsController,
    AssetsController,
  ])('preserves the shared assets role guard on %s', (controllerClass) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controllerClass)).toContain(
      RolesGuard,
    );
  });

  it('preserves upload interception and DTO runtime metadata', () => {
    expect(
      Reflect.getMetadata(
        INTERCEPTORS_METADATA,
        AssetsIngestionController.prototype.createUpload,
      ),
    ).toHaveLength(1);
    const uploadParameterTypes = Reflect.getMetadata(
      'design:paramtypes',
      AssetsIngestionController.prototype,
      'createUpload',
    ) as Array<{ name?: string }>;
    expect(uploadParameterTypes[0]?.name).toBe('Request');
    expect(uploadParameterTypes.slice(1)).toEqual([
      Object,
      Object,
      CreateAssetDto,
    ]);
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        AssetsIngestionController.prototype,
        'createFromIngredient',
      ),
    ).toEqual([uploadParameterTypes[0], Object, CreateFromIngredientDto]);

    const routeArguments = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      AssetsIngestionController,
      'createUpload',
    ) as Record<string, { index: number; pipes: unknown[] }>;
    const fileArgument = Object.values(routeArguments).find(
      ({ index }) => index === 2,
    );
    const uploadPipe = fileArgument?.pipes.find(
      (pipe) => pipe instanceof UploadValidationPipe,
    ) as unknown as {
      allowedExtensions: Set<string>;
      allowedMimeTypes: Set<string>;
      maxSizeBytes: number;
    };

    expect(uploadPipe.maxSizeBytes).toBe(50 * 1024 * 1024);
    expect([...uploadPipe.allowedExtensions]).toEqual([
      'jpg',
      'jpeg',
      'png',
      'webp',
      'gif',
    ]);
    expect([...uploadPipe.allowedMimeTypes]).toEqual([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
  });

  it('preserves generation credit guards and interception', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AssetsOperationsController.prototype.generate,
      ),
    ).toEqual([SubscriptionGuard, CreditsGuard]);
    expect(
      Reflect.getMetadata(
        INTERCEPTORS_METADATA,
        AssetsOperationsController.prototype.generate,
      ),
    ).toEqual([CreditsInterceptor]);
  });

  it('moves ingestion handlers off the generation controller', () => {
    expect(
      Reflect.get(AssetsOperationsController.prototype, 'createUpload'),
    ).toBeUndefined();
    expect(
      Reflect.get(AssetsOperationsController.prototype, 'createFromIngredient'),
    ).toBeUndefined();
  });

  it('registers static operation controllers before the wildcard CRUD controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AssetsModule),
    ).toEqual([
      AssetsIngestionController,
      AssetsOperationsController,
      AssetsController,
    ]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AssetsModule),
    ).toEqual([
      AssetsService,
      AssetIngestionService,
      CreditsGuard,
      CreditsInterceptor,
    ]);
  });

  it('keeps each split production surface within its line budget', () => {
    const operationController = readFileSync(
      new URL('./operations/assets-operations.controller.ts', import.meta.url),
      'utf8',
    );
    const ingestionController = readFileSync(
      new URL('./operations/assets-ingestion.controller.ts', import.meta.url),
      'utf8',
    );
    const ingestionService = readFileSync(
      new URL('../services/asset-ingestion.service.ts', import.meta.url),
      'utf8',
    );

    expect(operationController.trimEnd().split('\n').length).toBeLessThan(300);
    expect(ingestionController.trimEnd().split('\n').length).toBeLessThan(500);
    expect(ingestionService.trimEnd().split('\n').length).toBeLessThan(500);
    expect(ingestionController).toContain('fileSize: MAX_ASSET_UPLOAD_BYTES');
  });
});

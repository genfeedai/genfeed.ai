import { readFileSync } from 'node:fs';
import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import { CredentialsPublishingController } from '@api/collections/credentials/controllers/credentials-publishing.controller';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CredentialPublishingOperationsService } from '@api/collections/credentials/services/credential-publishing-operations.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { API_KEY_POSTING_CONFIGURATION_SCOPES } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

const MOVED_ROUTES = [
  [
    'listBrandAccountHealth',
    'brand/:brandId/account-health',
    RequestMethod.GET,
  ],
  [
    'listBrandPublishingReadiness',
    'brand/:brandId/publishing-readiness',
    RequestMethod.GET,
  ],
  ['listPostingTimes', ':credentialId/posting-times', RequestMethod.GET],
  ['replacePostingTimes', ':credentialId/posting-times', RequestMethod.PUT],
  ['addPostingTime', ':credentialId/posting-times', RequestMethod.POST],
  ['removePostingTime', ':credentialId/posting-times', RequestMethod.DELETE],
  ['findNextPostingSlot', ':credentialId/next-slot', RequestMethod.GET],
  [
    'getPublishingContext',
    ':credentialId/publishing-context',
    RequestMethod.GET,
  ],
  [
    'assessAccountHealth',
    ':credentialId/account-health/assess',
    RequestMethod.POST,
  ],
  [
    'overrideAccountHealth',
    ':credentialId/account-health/override',
    RequestMethod.PATCH,
  ],
  ['getMentions', 'mentions', RequestMethod.GET],
  ['getQuotaStatus', ':credentialId/quota', RequestMethod.GET],
] as const;

describe('Credentials split controllers', () => {
  it.each(MOVED_ROUTES)(
    'preserves CredentialsController.%s route and OpenAPI identity',
    (methodName, path, method) => {
      const handler = Reflect.get(
        CredentialsPublishingController.prototype,
        methodName,
      ) as object;

      expect(
        Reflect.getMetadata(PATH_METADATA, CredentialsPublishingController),
      ).toBe('credentials');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({
        operationId: `CredentialsController.${methodName}`,
        summary: methodName,
      });
    },
  );

  it('exposes manual account-health overrides via PATCH, never POST', () => {
    const handler =
      CredentialsPublishingController.prototype.overrideAccountHealth;

    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).not.toBe(
      RequestMethod.POST,
    );
  });

  it.each([CredentialsPublishingController, CredentialsController])(
    'preserves the shared credentials role guard on %s',
    (controllerClass) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controllerClass)).toContain(
        RolesGuard,
      );
    },
  );

  it.each([
    'replacePostingTimes',
    'addPostingTime',
    'removePostingTime',
  ] as const)(
    'preserves posting configuration API-key scopes on %s',
    (methodName) => {
      expect(
        Reflect.getMetadata(
          API_KEY_SCOPES_KEY,
          CredentialsPublishingController.prototype[methodName],
        ),
      ).toEqual(API_KEY_POSTING_CONFIGURATION_SCOPES);
    },
  );

  it.each(MOVED_ROUTES)(
    'removes moved handler %s from the legacy controller',
    (methodName) => {
      expect(
        Reflect.get(CredentialsController.prototype, methodName),
      ).toBeUndefined();
    },
  );

  it('registers the publishing sibling before the wildcard legacy controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CredentialsModule),
    ).toEqual([CredentialsPublishingController, CredentialsController]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CredentialsModule),
    ).toEqual([CredentialPublishingOperationsService]);
  });

  it('reduces the legacy controller from 18 to 12 constructor dependencies', () => {
    expect(
      Reflect.getMetadata('design:paramtypes', CredentialsController),
    ).toHaveLength(12);
  });

  it.each([
    ['./credentials.controller.ts', 500],
    ['./credentials-publishing.controller.ts', 500],
    ['../services/credential-publishing-operations.service.ts', 300],
  ] as const)('keeps %s below %i lines', (relativePath, limit) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    expect(source.trimEnd().split('\n').length).toBeLessThan(limit);
  });
});

import { SkillPackageImportController } from '@api/collections/skills/controllers/skill-package-import.controller';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('SkillsModule', () => {
  it('should be defined', () => {
    expect(SkillsModule).toBeDefined();
  });
});

describe('SkillsModule ordinary import registration', () => {
  it('registers exactly one authoritative POST skills/import handler', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      SkillsModule,
    ) as Array<{ prototype: object }>;
    expect(controllers).toContain(SkillPackageImportController);
    const routes = controllers.flatMap((controller) =>
      Object.getOwnPropertyNames(controller.prototype)
        .filter((name) => name !== 'constructor')
        .map((name) => {
          const handler = Reflect.get(controller.prototype, name) as object;
          const base = Reflect.getMetadata(PATH_METADATA, controller) ?? '';
          const path = Reflect.getMetadata(PATH_METADATA, handler);
          return {
            method: Reflect.getMetadata(METHOD_METADATA, handler),
            path: [base, path].filter(Boolean).join('/'),
          };
        }),
    );
    expect(
      routes.filter(
        (route) =>
          route.method === RequestMethod.POST && route.path === 'skills/import',
      ),
    ).toHaveLength(1);
  });
});

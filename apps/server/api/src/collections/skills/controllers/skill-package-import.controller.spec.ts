import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { SkillPackageImportController } from '@api/collections/skills/controllers/skill-package-import.controller';
import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import {
  RATE_LIMIT_KEY,
  RateLimitPresets,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

describe('SkillPackageImportController validated HTTP admission', () => {
  let app: INestApplication;
  const importValidatedPackage = vi.fn(async () => ({
    id: 'new-skill',
    name: 'Imported',
    slug: 'upload',
    config: {},
  }));
  const present = vi.fn(async (_actor: unknown, docs: unknown[]) => docs);
  let user = {
    id: 'legacy-auth-id',
    userId: 'canonical-user',
    organizationId: 'org-1',
  } as AuthenticatedUser;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SkillPackageImportController],
      providers: [
        {
          provide: SkillLibraryService,
          useValue: { importValidatedPackage, present },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.use(
      (req: { user?: AuthenticatedUser }, _res: unknown, next: () => void) => {
        req.user = user;
        next();
      },
    );
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    user = {
      id: 'legacy-auth-id',
      userId: 'canonical-user',
      organizationId: 'org-1',
    } as AuthenticatedUser;
  });
  afterAll(async () => {
    await app.close();
  });
  function payload() {
    return {
      slug: 'upload',
      package: {
        format: 'files',
        files: [
          {
            path: 'SKILL.md',
            content:
              '---\nname: Imported\ndescription: Useful\n---\nInstructions',
          },
        ],
      },
    };
  }
  it('uses the canonical actor and the per-user upload preset', async () => {
    await request(app.getHttpServer())
      .post('/skills/import')
      .send(payload())
      .expect(201);
    expect(importValidatedPackage).toHaveBeenCalledWith(
      { organizationId: 'org-1', userId: 'canonical-user' },
      expect.objectContaining(payload()),
    );
    expect(
      Reflect.getMetadata(
        RATE_LIMIT_KEY,
        SkillPackageImportController.prototype.importSkillPackage,
      ),
    ).toEqual(RateLimitPresets.uploads);
    expect(RateLimitPresets.uploads.scope).toBe('user');
  });
  it.each([
    { slug: 'legacy', name: 'Unvalidated' },
    { ...payload(), ownerKind: 'system' },
    {
      ...payload(),
      package: { format: 'files', files: [], archiveBase64: 'UEs=' },
    },
  ])(
    'denies legacy, spoofed and mixed requests before service admission',
    async (body) => {
      await request(app.getHttpServer())
        .post('/skills/import')
        .send(body)
        .expect(400);
      expect(importValidatedPackage).not.toHaveBeenCalled();
    },
  );
  it('refuses missing canonical identity/context without legacy-id fallback', async () => {
    user = {
      id: 'legacy-auth-id',
      organizationId: 'org-1',
    } as AuthenticatedUser;
    await request(app.getHttpServer())
      .post('/skills/import')
      .send(payload())
      .expect(403);
    expect(importValidatedPackage).not.toHaveBeenCalled();
    user = { userId: 'canonical-user' } as AuthenticatedUser;
    await request(app.getHttpServer())
      .post('/skills/import')
      .send(payload())
      .expect(403);
  });
});

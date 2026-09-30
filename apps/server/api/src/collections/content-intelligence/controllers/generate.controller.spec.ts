import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { GenerateController } from '@api/collections/content-intelligence/controllers/generate.controller';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { RATE_LIMIT_KEY } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';

describe('GenerateController', () => {
  it('should be defined', () => {
    expect(GenerateController).toBeDefined();
  });

  it('should have rate limit on generate endpoint', () => {
    const metadata = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      GenerateController.prototype.generate,
    );
    expect(metadata).toEqual({
      limit: 30,
      scope: 'organization',
      windowMs: 60000,
    });
  });

  it('should have rate limit scope set to organization', () => {
    const metadata = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      GenerateController.prototype.generate,
    );
    expect(metadata.scope).toBe('organization');
  });

  describe('generate', () => {
    let controller: GenerateController;
    let contentGeneratorService: {
      generateContentWorkflow: ReturnType<typeof vi.fn>;
    };
    let apiKeysService: {
      findOne: ReturnType<typeof vi.fn>;
    };
    let brandsService: {
      findOne: ReturnType<typeof vi.fn>;
    };
    let membersService: {
      findOne: ReturnType<typeof vi.fn>;
    };

    const mockUser = {
      id: 'user_123',
      organizationId: testId('org'),
      userId: testId('user'),
    } as unknown as User;

    /**
     * `brandsService.findOne` is org-scoped in real life (`BaseService`
     * excludes soft-deleted rows and requires a matching `organizationId`).
     * This stub mirrors that: it only "finds" a brand whose id is in
     * `validBrandIds` for the given mockUser's organization.
     */
    function stubValidBrands(validBrandIds: readonly string[]): void {
      brandsService.findOne.mockImplementation(
        async (query: { id?: unknown; organizationId?: unknown }) => {
          if (
            typeof query.id === 'string' &&
            validBrandIds.includes(query.id) &&
            query.organizationId === mockUser.organizationId
          ) {
            return { id: query.id };
          }
          return null;
        },
      );
    }

    beforeEach(async () => {
      contentGeneratorService = {
        generateContentWorkflow: vi.fn().mockResolvedValue([
          {
            body: 'Generated body',
            content: 'Full content',
            cta: 'Click here',
            hashtags: ['#ai'],
            hook: 'Did you know?',
            patternId: 'p1',
            patternUsed: 'storytelling',
          },
        ]),
      };
      apiKeysService = {
        findOne: vi.fn(),
      };
      brandsService = {
        findOne: vi.fn().mockResolvedValue(null),
      };
      membersService = {
        findOne: vi.fn().mockResolvedValue(null),
      };

      const module = await Test.createTestingModule({
        controllers: [GenerateController],
        providers: [
          {
            provide: ContentGeneratorService,
            useValue: contentGeneratorService,
          },
          {
            provide: ApiKeysService,
            useValue: apiKeysService,
          },
          {
            provide: BrandsService,
            useValue: brandsService,
          },
          {
            provide: MembersService,
            useValue: membersService,
          },
          {
            provide: LoggerService,
            useValue: { debug: vi.fn(), error: vi.fn(), log: vi.fn() },
          },
        ],
      }).compile();

      controller = module.get(GenerateController);
    });

    it('should return JSON:API formatted collection', async () => {
      stubValidBrands(['b1']);

      const result = await controller.generate({} as Request, mockUser, {
        brandId: 'b1',
      } as never);

      expect(result.data).toBeInstanceOf(Array);
      expect(result.data[0].type).toBe('generated-content');
      expect(result.data[0].id).toBe('generated-0');
    });

    it('should include meta with pagination info', async () => {
      stubValidBrands(['b1']);

      const result = await controller.generate({} as Request, mockUser, {
        brandId: 'b1',
      } as never);

      expect(result.meta.page).toBe(1);
      expect(result.meta.totalDocs).toBe(1);
    });

    it('should pass organizationId as ObjectId to service', async () => {
      stubValidBrands(['b1']);

      await controller.generate({} as Request, mockUser, {
        brandId: 'b1',
      } as never);

      expect(
        contentGeneratorService.generateContentWorkflow,
      ).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );
    });

    describe('brand resolution (#5219/#5292 — generation always has an explicit brand)', () => {
      it('rejects with 400 when no brandId, apiKey default, user.brandId, or member currentBrandId resolves', async () => {
        // brandsService/membersService already stubbed to resolve nothing.
        await expect(
          controller.generate({} as Request, mockUser, {} as never),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
          controller.generate({} as Request, mockUser, {} as never),
        ).rejects.toThrow('brandId is required to generate content.');
        expect(
          contentGeneratorService.generateContentWorkflow,
        ).not.toHaveBeenCalled();
      });

      it("falls back to the acting member's currentBrandId (user.brandId) for app/agent callers", async () => {
        stubValidBrands(['member-current-brand']);
        const appUser = { ...mockUser, brandId: 'member-current-brand' };

        await controller.generate({} as Request, appUser as User, {} as never);

        expect(
          contentGeneratorService.generateContentWorkflow,
        ).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({ brandId: 'member-current-brand' }),
        );
      });

      it("prefers the request's explicit brandId over user.brandId", async () => {
        stubValidBrands(['explicit-brand', 'member-current-brand']);
        const appUser = { ...mockUser, brandId: 'member-current-brand' };

        await controller.generate(
          {} as Request,
          appUser as User,
          {
            brandId: 'explicit-brand',
          } as never,
        );

        expect(
          contentGeneratorService.generateContentWorkflow,
        ).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({ brandId: 'explicit-brand' }),
        );
      });

      it("falls back to the acting member's currentBrandId when user.brandId is stale (deleted/relocated since auth)", async () => {
        // Simulates a brand deleted just after the request's identity was
        // cached: user.brandId is no longer a valid brand, but the member row
        // itself now points at a different, valid, current brand.
        stubValidBrands(['fresh-current-brand']);
        membersService.findOne.mockResolvedValue({
          currentBrandId: 'fresh-current-brand',
        });
        const appUser = { ...mockUser, brandId: 'stale-deleted-brand' };

        await controller.generate({} as Request, appUser as User, {} as never);

        expect(
          contentGeneratorService.generateContentWorkflow,
        ).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({ brandId: 'fresh-current-brand' }),
        );
      });

      it("resolves an API-key caller's brand from the key's validated defaultBrandId", async () => {
        stubValidBrands(['key-default-brand']);
        const apiKeyUser = {
          ...mockUser,
          apiKeyId: 'apikey-1',
          isApiKey: true,
        };
        apiKeysService.findOne.mockResolvedValue({
          defaultBrandId: 'key-default-brand',
        });

        await controller.generate(
          {} as Request,
          apiKeyUser as User,
          {} as never,
        );

        expect(apiKeysService.findOne).toHaveBeenCalledWith({
          id: 'apikey-1',
        });
        expect(
          contentGeneratorService.generateContentWorkflow,
        ).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({ brandId: 'key-default-brand' }),
        );
      });

      it("falls back to the key owner's member currentBrandId when the key has no valid default brand", async () => {
        stubValidBrands(['owner-current-brand']);
        const apiKeyUser = {
          ...mockUser,
          apiKeyId: 'apikey-1',
          isApiKey: true,
        };
        apiKeysService.findOne.mockResolvedValue({ defaultBrandId: null });
        membersService.findOne.mockResolvedValue({
          currentBrandId: 'owner-current-brand',
        });

        await controller.generate(
          {} as Request,
          apiKeyUser as User,
          {} as never,
        );

        expect(membersService.findOne).toHaveBeenCalledWith({
          organizationId: mockUser.organizationId,
          userId: mockUser.userId,
        });
        expect(
          contentGeneratorService.generateContentWorkflow,
        ).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({ brandId: 'owner-current-brand' }),
        );
      });

      it('rejects an API-key caller whose key has no valid default brand and whose owner has no current brand — never widens to "any brand in the org"', async () => {
        const apiKeyUser = {
          ...mockUser,
          apiKeyId: 'apikey-1',
          isApiKey: true,
          // Even if user.brandId happens to carry a value for this auth path,
          // the API-key branch must not fall through to it.
          brandId: 'should-not-be-used',
        };
        apiKeysService.findOne.mockResolvedValue({ defaultBrandId: null });
        membersService.findOne.mockResolvedValue(null);

        await expect(
          controller.generate({} as Request, apiKeyUser as User, {} as never),
        ).rejects.toThrow(
          'brandId is required to generate content. Configure a default brand for this API key, or pass brandId explicitly.',
        );
        expect(
          contentGeneratorService.generateContentWorkflow,
        ).not.toHaveBeenCalled();
      });

      it('rejects an API-key caller whose explicit brandId belongs to another organization, never trusting it unvalidated', async () => {
        // 'other-org-brand' never appears in stubValidBrands, so it never
        // resolves for this organizationId — the request must reject rather
        // than pass the cross-org id straight through.
        stubValidBrands([]);
        const apiKeyUser = {
          ...mockUser,
          apiKeyId: 'apikey-1',
          isApiKey: true,
        };
        apiKeysService.findOne.mockResolvedValue({ defaultBrandId: null });
        membersService.findOne.mockResolvedValue(null);

        await expect(
          controller.generate(
            {} as Request,
            apiKeyUser as User,
            { brandId: 'other-org-brand' } as never,
          ),
        ).rejects.toThrow(
          'brandId is required to generate content. Configure a default brand for this API key, or pass brandId explicitly.',
        );
        expect(
          contentGeneratorService.generateContentWorkflow,
        ).not.toHaveBeenCalled();
      });
    });
  });
});

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { GenerateController } from '@api/collections/content-intelligence/controllers/generate.controller';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
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
      resolveValidDefaultBrandId: ReturnType<typeof vi.fn>;
    };

    const mockUser = {
      id: 'user_123',
      organizationId: testId('org'),
      userId: testId('user'),
    } as unknown as User;

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
        resolveValidDefaultBrandId: vi.fn(),
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
            provide: LoggerService,
            useValue: { debug: vi.fn(), error: vi.fn(), log: vi.fn() },
          },
        ],
      }).compile();

      controller = module.get(GenerateController);
    });

    it('should return JSON:API formatted collection', async () => {
      const result = await controller.generate({} as Request, mockUser, {
        brandId: 'b1',
      } as never);

      expect(result.data).toBeInstanceOf(Array);
      expect(result.data[0].type).toBe('generated-content');
      expect(result.data[0].id).toBe('generated-0');
    });

    it('should include meta with pagination info', async () => {
      const result = await controller.generate({} as Request, mockUser, {
        brandId: 'b1',
      } as never);

      expect(result.meta.page).toBe(1);
      expect(result.meta.totalDocs).toBe(1);
    });

    it('should pass organizationId as ObjectId to service', async () => {
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

    describe('brand resolution (#5219 — generation always has an explicit brand)', () => {
      it('rejects with 400 when no brandId, apiKey default, or user.brandId resolves', async () => {
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

      it("resolves an API-key caller's brand from the key's validated defaultBrandId", async () => {
        const apiKeyUser = {
          ...mockUser,
          apiKeyId: 'apikey-1',
          isApiKey: true,
        };
        apiKeysService.findOne.mockResolvedValue({
          defaultBrandId: 'key-default-brand',
        });
        apiKeysService.resolveValidDefaultBrandId.mockResolvedValue(
          'key-default-brand',
        );

        await controller.generate(
          {} as Request,
          apiKeyUser as User,
          {} as never,
        );

        expect(apiKeysService.resolveValidDefaultBrandId).toHaveBeenCalledWith(
          mockUser.organizationId,
          'key-default-brand',
        );
        expect(
          contentGeneratorService.generateContentWorkflow,
        ).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({ brandId: 'key-default-brand' }),
        );
      });

      it('rejects an API-key caller whose key has no valid default brand — never widens to "any brand in the org"', async () => {
        const apiKeyUser = {
          ...mockUser,
          apiKeyId: 'apikey-1',
          isApiKey: true,
          // Even if user.brandId happens to carry a value for this auth path,
          // the API-key branch must not fall through to it.
          brandId: 'should-not-be-used',
        };
        apiKeysService.findOne.mockResolvedValue({ defaultBrandId: null });
        apiKeysService.resolveValidDefaultBrandId.mockResolvedValue(undefined);

        await expect(
          controller.generate({} as Request, apiKeyUser as User, {} as never),
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

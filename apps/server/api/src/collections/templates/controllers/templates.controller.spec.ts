vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { TemplatesController } from '@api/collections/templates/controllers/templates.controller';
import { CreateTemplateDto } from '@api/collections/templates/dto/create-template.dto';
import { SuggestTemplatesDto } from '@api/collections/templates/dto/suggest-templates.dto';
import { UpdateTemplateDto } from '@api/collections/templates/dto/update-template.dto';
import { UseTemplateDto } from '@api/collections/templates/dto/use-template.dto';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { AssetScope } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { Test, TestingModule } from '@nestjs/testing';

const organizationId = testId('org');
const templateId = testId('template');

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let service: TemplatesService;
  let creditsUtilsService: {
    checkOrganizationCreditsAvailable: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let modelsService: { findOne: ReturnType<typeof vi.fn> };

  const mockUser: User = {
    id: 'user_123',
    organizationId,
    userId: testId('user'),
  } as unknown as User;

  const mockTemplate = {
    _id: templateId,
    categories: ['marketing'],
    category: 'email',
    createdAt: new Date(),
    description: 'Professional email template',
    label: 'Marketing Email Template',
    organization: organizationId,
    platforms: ['email'],
    scope: AssetScope.PUBLIC,
    updatedAt: new Date(),
  };

  const mockTemplatesService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
    suggestTemplates: vi.fn(),
    update: vi.fn(),
    useTemplate: vi.fn(),
  };

  const mockReq = {} as import('express').Request;

  beforeEach(async () => {
    creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
    };
    modelsService = { findOne: vi.fn().mockResolvedValue(null) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [
        {
          provide: CreditsUtilsService,
          useValue: creditsUtilsService,
        },
        {
          provide: ModelsService,
          useValue: modelsService,
        },
        {
          provide: TemplatesService,
          useValue: mockTemplatesService,
        },
      ],
    })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TemplatesController>(TemplatesController);
    service = module.get<TemplatesService>(TemplatesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a template', async () => {
      const dto: CreateTemplateDto = {
        category: 'email',
        description: 'Professional email template',
        label: 'Marketing Email Template',
        purpose: 'content',
      };

      mockTemplatesService.create.mockResolvedValue(mockTemplate);

      const result = await controller.create(mockReq, dto, mockUser);

      expect(service.create).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
        mockUser.id,
      );
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('findAll', () => {
    it('should return all templates', async () => {
      const templates = [mockTemplate];
      mockTemplatesService.findAll.mockResolvedValue(templates);

      const result = await controller.findAll(mockReq, mockUser, {});

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual(templates);
    });
  });

  describe('findOne', () => {
    it('should return a template by id', async () => {
      const id = templateId;
      mockTemplatesService.findOne.mockResolvedValue(mockTemplate);

      const result = await controller.findOne(mockReq, id, mockUser);

      expect(service.findOne).toHaveBeenCalledWith(id, mockUser.organizationId);
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('update', () => {
    it('should update a template', async () => {
      const id = templateId;
      const dto: UpdateTemplateDto = {
        label: 'Updated Template',
      };

      const updatedTemplate = { ...mockTemplate, ...dto };
      mockTemplatesService.update.mockResolvedValue(updatedTemplate);

      const result = await controller.update(mockReq, id, dto, mockUser);

      expect(service.update).toHaveBeenCalledWith(
        id,
        dto,
        mockUser.organizationId,
      );
      expect(result).toEqual(updatedTemplate);
    });
  });

  describe('remove', () => {
    it('should delete a template', async () => {
      const id = templateId;
      mockTemplatesService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(id, mockUser);

      expect(service.remove).toHaveBeenCalledWith(id, mockUser.organizationId);
      expect(result).toEqual({ message: 'Template deleted successfully' });
    });
  });

  describe('useTemplate', () => {
    it('should use template with variables', async () => {
      const dto: UseTemplateDto = {
        templateId,
        variables: { name: 'John', product: 'SaaS' },
      };

      const filled = {
        content: 'Hi John, check out our SaaS product!',
        templateId: dto.templateId,
      };

      mockTemplatesService.useTemplate.mockResolvedValue(filled);

      const result = await controller.useTemplate(mockReq, dto, mockUser);

      expect(service.useTemplate).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
        mockUser.id,
        expect.any(Function),
        undefined,
      );
      expect(result).toEqual(filled);
    });

    // #5375: BYOK — when the guard already granted a bypass, the platform
    // credits floor preflight is skipped and the resolved key reaches the
    // service call.
    it('skips the credits preflight and forwards the resolved BYOK key when the guard bypassed', async () => {
      const dto: UseTemplateDto = {
        additionalInstructions: 'Make it punchier',
        templateId,
        variables: { name: 'John' },
      };
      const byokReq = {
        creditsConfig: {
          byokApiKeyOverride: 'org-openrouter-key',
          isByokBypass: true,
        },
      } as unknown as import('express').Request;
      mockTemplatesService.useTemplate.mockResolvedValue({
        content: 'ok',
        templateId: dto.templateId,
      });

      await controller.useTemplate(byokReq, dto, mockUser);
      // getDefaultTextMinimumCredits(modelsService) backs the preflight; the
      // whole preflight block is skipped when the guard already bypassed.
      expect(modelsService.findOne).not.toHaveBeenCalled();
      expect(service.useTemplate).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
        mockUser.id,
        expect.any(Function),
        'org-openrouter-key',
      );
    });

    it('still runs the credits preflight when the guard did not bypass', async () => {
      const dto: UseTemplateDto = {
        additionalInstructions: 'Make it punchier',
        templateId,
        variables: { name: 'John' },
      };
      mockTemplatesService.useTemplate.mockResolvedValue({
        content: 'ok',
        templateId: dto.templateId,
      });

      await controller.useTemplate(mockReq, dto, mockUser);
      expect(modelsService.findOne).toHaveBeenCalled();
    });
  });

  describe('suggestTemplates', () => {
    it('should suggest relevant templates', async () => {
      const dto: SuggestTemplatesDto = {
        goal: 'increase engagement',
        industry: 'tech',
        platform: 'instagram',
      };

      const suggestions = [mockTemplate];
      mockTemplatesService.suggestTemplates.mockResolvedValue(suggestions);

      const result = await controller.suggestTemplates(mockReq, dto, mockUser);

      expect(service.suggestTemplates).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
        expect.any(Function),
        undefined,
      );
      expect(result).toEqual(suggestions);
    });

    it('skips the credits preflight and forwards the resolved BYOK key when the guard bypassed', async () => {
      const dto: SuggestTemplatesDto = {
        goal: 'increase engagement',
        industry: 'tech',
        platform: 'instagram',
      };
      const byokReq = {
        creditsConfig: {
          byokApiKeyOverride: 'org-openrouter-key',
          isByokBypass: true,
        },
      } as unknown as import('express').Request;
      mockTemplatesService.suggestTemplates.mockResolvedValue([mockTemplate]);

      await controller.suggestTemplates(byokReq, dto, mockUser);
      expect(modelsService.findOne).not.toHaveBeenCalled();
      expect(service.suggestTemplates).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
        expect.any(Function),
        'org-openrouter-key',
      );
    });

    it('still runs the credits preflight when the guard did not bypass', async () => {
      const dto: SuggestTemplatesDto = {
        goal: 'increase engagement',
        industry: 'tech',
        platform: 'instagram',
      };
      mockTemplatesService.suggestTemplates.mockResolvedValue([mockTemplate]);

      await controller.suggestTemplates(mockReq, dto, mockUser);
      expect(modelsService.findOne).toHaveBeenCalled();
    });
  });

  describe('findAll with sort=popular', () => {
    it('should pass sort and limit filters through to the service', async () => {
      const popular = [mockTemplate];
      mockTemplatesService.findAll.mockResolvedValue(popular);

      const result = await controller.findAll(mockReq, mockUser, {
        limit: 20,
        sort: 'popular',
      });

      expect(service.findAll).toHaveBeenCalledWith(
        mockUser.organizationId,
        expect.objectContaining({ limit: 20, sort: 'popular' }),
      );
      expect(result).toEqual(popular);
    });
  });
});

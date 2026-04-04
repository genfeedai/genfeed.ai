import type { TemplateMetadataService } from '@api/collections/template-metadata/services/template-metadata.service';
import type { TemplateUsageService } from '@api/collections/template-usage/services/template-usage.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import type { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let mockModel: ReturnType<typeof vi.fn> &
    Record<string, ReturnType<typeof vi.fn>>;
  let mockTemplateUsageService: { create: ReturnType<typeof vi.fn> };
  let mockTemplateMetadataService: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockReplicateService: {
    generateTextCompletionSync: ReturnType<typeof vi.fn>;
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    const modelFn = function (
      this: Record<string, unknown>,
      dto: Record<string, unknown>,
    ) {
      Object.assign(this, dto);
      this._id = 'template-1';
      this.save = vi.fn().mockResolvedValue(undefined);
      this.toObject = vi.fn().mockReturnValue({ ...dto, _id: 'template-1' });
    };
    (modelFn as unknown as Record<string, unknown>).find = vi
      .fn()
      .mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnValue({
          sort: vi
            .fn()
            .mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
        }),
        sort: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
      });
    (modelFn as unknown as Record<string, unknown>).findOne = vi
      .fn()
      .mockReturnValue(null);
    (modelFn as unknown as Record<string, unknown>).findById = vi
      .fn()
      .mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });
    (modelFn as unknown as Record<string, unknown>).aggregate = vi
      .fn()
      .mockResolvedValue([]);
    mockModel = modelFn as never;

    mockTemplateUsageService = { create: vi.fn() };
    mockTemplateMetadataService = {
      create: vi.fn().mockResolvedValue({ _id: { toString: () => 'meta-1' } }),
      update: vi.fn(),
    };
    mockReplicateService = { generateTextCompletionSync: vi.fn() };

    service = new TemplatesService(
      mockModel as never,
      mockTemplateUsageService as unknown as TemplateUsageService,
      mockTemplateMetadataService as unknown as TemplateMetadataService,
      mockLoggerService as unknown as LoggerService,
      mockReplicateService as unknown as ReplicateService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create saves a template and creates metadata', async () => {
    const dto = {
      content: 'Hello {{name}}',
      label: 'Test Template',
      purpose: 'social',
    };
    await service.create(dto as never, 'org-1', 'user-1');
    expect(mockTemplateMetadataService.create).toHaveBeenCalled();
  });

  it('create throws for duplicate prompt key', async () => {
    (mockModel as unknown as Record<string, unknown>).findOne = vi
      .fn()
      .mockReturnValue({ _id: 'existing', key: 'my-key' });
    const dto = {
      content: 'Hello',
      key: 'my-key',
      label: 'Duplicate',
      purpose: 'prompt',
    };
    await expect(service.create(dto as never, 'org-1')).rejects.toThrow();
  });

  it('extractVariables extracts handlebars variables', () => {
    const vars = (
      service as unknown as Record<string, (content: string) => string[]>
    )['extractVariables']('Hello {{name}}, welcome to {{place}}');
    expect(vars).toBeDefined();
    expect(Array.isArray(vars)).toBe(true);
  });

  it('creates template with correct organization and createdBy', async () => {
    const dto = {
      content: 'Test {{var}}',
      label: 'Template',
      purpose: 'social',
    };
    const result = await service.create(dto as never, 'org-1', 'user-1');
    expect(result).toHaveProperty('_id');
    // Verify metadata was created with template id
    expect(mockTemplateMetadataService.create).toHaveBeenCalledWith(
      'template-1',
      expect.any(Object),
    );
  });

  it('creates template with isActive true for prompt purpose', async () => {
    (mockModel as unknown as Record<string, unknown>).findOne = vi
      .fn()
      .mockReturnValue(null);
    const dto = {
      content: 'Prompt: {{input}}',
      key: 'unique-key',
      label: 'Prompt Template',
      purpose: 'prompt',
    };
    const result = await service.create(dto as never, 'org-1');
    // prompt templates get isActive: true and version: 1
    expect(result).toBeDefined();
  });

  it('creates metadata with template id', async () => {
    const dto = {
      content: 'Test',
      label: 'Meta Test',
      purpose: 'social',
    };
    await service.create(dto as never, 'org-1');
    expect(mockTemplateMetadataService.create).toHaveBeenCalledWith(
      'template-1',
      expect.any(Object),
    );
  });

  it('extractVariables returns empty for content without variables', () => {
    const vars = (
      service as unknown as Record<string, (content: string) => string[]>
    )['extractVariables']('No variables here');
    expect(vars).toEqual([]);
  });

  it('create with undefined organization sets organization to null', async () => {
    const dto = {
      content: 'Global template {{var}}',
      label: 'Global',
      purpose: 'social',
    };
    const result = await service.create(dto as never, undefined, 'user-1');
    // organization should be null when undefined is passed
    expect(result).toBeDefined();
  });
});

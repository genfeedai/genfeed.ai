import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  type ContentPlanInput,
  PersonaContentPlanService,
} from '@api/services/persona-content/persona-content-plan.service';
import { PersonaContentFormat, PostCategory } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const objectId = () => 'test-object-id';

const makeInput = (
  overrides: Partial<ContentPlanInput> = {},
): ContentPlanInput => ({
  brandId: objectId(),
  credentialId: objectId(),
  days: 7,
  organizationId: objectId(),
  personaId: objectId(),
  userId: objectId(),
  ...overrides,
});

const makePersona = (
  overrides: Partial<PersonaDocument> = {},
): PersonaDocument =>
  ({
    id: objectId(),
    contentStrategy: {
      formats: [PersonaContentFormat.PHOTO],
      frequency: 'daily',
      topics: ['tech', 'ai'],
    },
    label: 'TestPersona',
    ...overrides,
  }) as unknown as PersonaDocument;

describe('PersonaContentPlanService', () => {
  let service: PersonaContentPlanService;
  const moduleAccess = { assertAccess: vi.fn().mockResolvedValue(undefined) };
  const mockPersonasService = { findOne: vi.fn() };
  const mockPostsService = {
    create: vi.fn().mockResolvedValue({}),
    find: vi.fn(),
  };
  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    moduleAccess.assertAccess.mockReset().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonaContentPlanService,
        { provide: OrganizationModuleAccessService, useValue: moduleAccess },
        { provide: LoggerService, useValue: mockLogger },
        { provide: PersonasService, useValue: mockPersonasService },
        { provide: PostsService, useValue: mockPostsService },
      ],
    }).compile();

    service = module.get<PersonaContentPlanService>(PersonaContentPlanService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should throw NotFoundException when persona not found', async () => {
    mockPersonasService.findOne.mockResolvedValueOnce(null);
    await expect(service.generateContentPlan(makeInput())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should generate entries for the requested number of days with daily frequency', async () => {
    const persona = makePersona({
      contentStrategy: {
        formats: [PersonaContentFormat.PHOTO],
        frequency: 'daily',
        topics: ['tech'],
      },
    } as Partial<PersonaDocument>);
    mockPersonasService.findOne.mockResolvedValueOnce(persona);

    const result = await service.generateContentPlan(makeInput({ days: 5 }));
    expect(result.entries.length).toBe(5);
    expect(result.totalPosts).toBe(5);
  });

  it('should generate fewer entries for weekly frequency', async () => {
    const persona = makePersona({
      contentStrategy: {
        formats: [PersonaContentFormat.VIDEO],
        frequency: 'weekly',
        topics: ['fitness'],
      },
    } as Partial<PersonaDocument>);
    mockPersonasService.findOne.mockResolvedValueOnce(persona);

    const result = await service.generateContentPlan(makeInput({ days: 14 }));
    expect(result.entries.length).toBe(2);
  });

  it('should cycle through topics and formats', async () => {
    const persona = makePersona({
      contentStrategy: {
        formats: [PersonaContentFormat.PHOTO, PersonaContentFormat.VIDEO],
        frequency: 'daily',
        topics: ['a', 'b', 'c'],
      },
    } as Partial<PersonaDocument>);
    mockPersonasService.findOne.mockResolvedValueOnce(persona);

    const result = await service.generateContentPlan(makeInput({ days: 6 }));
    expect(result.entries[0].topic).toBe('a');
    expect(result.entries[0].format).toBe(PersonaContentFormat.PHOTO);
    expect(result.entries[1].topic).toBe('b');
    expect(result.entries[1].format).toBe(PersonaContentFormat.VIDEO);
    expect(result.entries[3].topic).toBe('a');
  });

  it('should map formats to correct post categories', async () => {
    const persona = makePersona({
      contentStrategy: {
        formats: [
          PersonaContentFormat.PHOTO,
          PersonaContentFormat.VIDEO,
          PersonaContentFormat.REEL,
          PersonaContentFormat.ARTICLE,
        ],
        frequency: 'daily',
        topics: ['t'],
      },
    } as Partial<PersonaDocument>);
    mockPersonasService.findOne.mockResolvedValueOnce(persona);

    const result = await service.generateContentPlan(makeInput({ days: 4 }));
    expect(result.entries[0].category).toBe(PostCategory.IMAGE);
    expect(result.entries[1].category).toBe(PostCategory.VIDEO);
    expect(result.entries[2].category).toBe(PostCategory.REEL);
    expect(result.entries[3].category).toBe(PostCategory.ARTICLE);
  });

  it('should default to daily frequency when strategy frequency is undefined', async () => {
    const persona = makePersona({
      contentStrategy: {
        formats: [PersonaContentFormat.TEXT],
        topics: ['default'],
      },
    } as Partial<PersonaDocument>);
    mockPersonasService.findOne.mockResolvedValueOnce(persona);

    const result = await service.generateContentPlan(makeInput({ days: 3 }));
    expect(result.entries.length).toBe(3);
  });

  it('should use default topics and formats when strategy is empty', async () => {
    const persona = makePersona({
      contentStrategy: undefined,
    } as Partial<PersonaDocument>);
    mockPersonasService.findOne.mockResolvedValueOnce(persona);

    const result = await service.generateContentPlan(makeInput({ days: 2 }));
    expect(result.entries.length).toBe(2);
    expect(result.entries[0].topic).toBe('general');
    expect(result.entries[0].format).toBe(PersonaContentFormat.PHOTO);
  });

  it.each(['disabled', 'unavailable'])(
    'rejects %s Publishing access before creating a draft',
    async (reason) => {
      const denied = new HttpException(
        {
          code:
            reason === 'disabled'
              ? 'ORGANIZATION_MODULE_DISABLED'
              : 'ORGANIZATION_MODULE_UNAVAILABLE',
          moduleId: 'publishing',
        },
        reason === 'disabled'
          ? HttpStatus.FORBIDDEN
          : HttpStatus.SERVICE_UNAVAILABLE,
      );
      moduleAccess.assertAccess.mockRejectedValueOnce(denied);
      await expect(
        service.createDraftPosts(makeInput(), [
          {
            category: PostCategory.IMAGE,
            description: 'Draft',
            format: PersonaContentFormat.PHOTO,
            scheduledDate: new Date(),
            topic: 'topic',
          },
        ]),
      ).rejects.toBe(denied);
      expect(moduleAccess.assertAccess).toHaveBeenCalledWith(
        objectId(),
        'publishing',
      );
      expect(mockPostsService.create).not.toHaveBeenCalled();
    },
  );

  it('rechecks module access before the next draft creation attempt', async () => {
    const entries = [
      {
        category: PostCategory.IMAGE,
        description: 'Draft',
        format: PersonaContentFormat.PHOTO,
        scheduledDate: new Date(),
        topic: 'topic',
      },
    ];
    await service.createDraftPosts(makeInput(), entries);
    const denied = new Error('Publishing disabled after the first attempt');
    moduleAccess.assertAccess.mockRejectedValueOnce(denied);
    await expect(service.createDraftPosts(makeInput(), entries)).rejects.toBe(
      denied,
    );
    expect(moduleAccess.assertAccess).toHaveBeenCalledTimes(2);
    expect(mockPostsService.create).toHaveBeenCalledOnce();
  });

  it('keeps a pure content plan available without a Publishing write grant', async () => {
    mockPersonasService.findOne.mockResolvedValueOnce(makePersona());
    moduleAccess.assertAccess.mockRejectedValue(
      new Error('Publishing disabled'),
    );
    const result = await service.generateContentPlan(
      makeInput({ credentialId: undefined, days: 2 }),
    );
    expect(result.totalPosts).toBe(2);
    expect(moduleAccess.assertAccess).not.toHaveBeenCalled();
    expect(mockPostsService.create).not.toHaveBeenCalled();
  });

  it('preserves the no-credential no-op without a Publishing write', async () => {
    const result = await service.createDraftPosts(
      makeInput({ credentialId: undefined }),
      [],
    );
    expect(result).toBe(0);
    expect(moduleAccess.assertAccess).not.toHaveBeenCalled();
    expect(mockPostsService.create).not.toHaveBeenCalled();
  });

  it('should create draft posts and return created count', async () => {
    const entries = [
      {
        category: PostCategory.IMAGE,
        description: 'desc',
        format: PersonaContentFormat.PHOTO,
        scheduledDate: new Date(),
        topic: 'topic',
      },
    ];

    const count = await service.createDraftPosts(makeInput(), entries);
    expect(count).toBe(1);
    expect(mockPostsService.create).toHaveBeenCalledOnce();
  });

  it('should continue creating posts when one fails and log error', async () => {
    mockPostsService.create
      .mockRejectedValueOnce(new Error('db error'))
      .mockResolvedValueOnce({});

    const entries = [
      {
        category: PostCategory.IMAGE,
        description: 'd1',
        format: PersonaContentFormat.PHOTO,
        scheduledDate: new Date(),
        topic: 't1',
      },
      {
        category: PostCategory.VIDEO,
        description: 'd2',
        format: PersonaContentFormat.VIDEO,
        scheduledDate: new Date(),
        topic: 't2',
      },
    ];

    const count = await service.createDraftPosts(makeInput(), entries);
    expect(count).toBe(1);
    expect(mockLogger.error).toHaveBeenCalledOnce();
  });
});

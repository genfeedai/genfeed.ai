import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ContextsController } from '@api/collections/contexts/controllers/contexts.controller';
import { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';
import { AutoCreateContextDto } from '@api/collections/contexts/dto/autocreate.dto';
import { CreateContextDto } from '@api/collections/contexts/dto/create-context.dto';
import { EnhancePromptDto } from '@api/collections/contexts/dto/enhance-prompt.dto';
import { QueryContextDto } from '@api/collections/contexts/dto/query.dto';
import { UpdateContextDto } from '@api/collections/contexts/dto/update-context.dto';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { MemberRole } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const organizationId = testId('org');
const userId = testId('user');
const contextId = testId('context');

describe('ContextsController', () => {
  let controller: ContextsController;
  let service: ContextsService;

  const mockUser: User = {
    id: 'user_123',
    organizationId,
    userId,
  } as unknown as User;

  const mockContext = {
    _id: contextId,
    createdAt: new Date(),
    description: 'A test context base',
    entries: [],
    isActive: true,
    label: 'Test Context',
    organization: organizationId,
    type: 'general',
    updatedAt: new Date(),
  };

  const mockContextsService = {
    addEntry: vi.fn(),
    backfillEmbeddings: vi.fn(),
    autoCreateFromAccount: vi.fn(),
    create: vi.fn(),
    enhancePrompt: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    getStats: vi.fn(),
    queryContext: vi.fn(),
    remove: vi.fn(),
    removeEntry: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContextsController],
      providers: [
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: ContextsService,
          useValue: mockContextsService,
        },
      ],
    })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ContextsController>(ContextsController);
    service = module.get<ContextsService>(ContextsService);
  });

  const mockReq = { originalUrl: '/contexts' } as Request;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns the bounded operation receipt as legal meta and omits all embedding internals', async () => {
    const admission = { admitted: 2, skipped: 1, nextCursor: 'next-entry' };
    mockContextsService.backfillEmbeddings.mockResolvedValue({
      contextBase: {
        ...mockContext,
        id: contextId,
        organizationId,
        leaseToken: 'private-lease',
        actorUserId: 'private-actor',
        embeddingJobs: [{ id: 'private-job' }],
        embedding: [1],
        sourceSnapshotHash: 'private-hash',
        content: 'private-source-content',
      },
      admission,
    });
    const result = await controller.backfillEmbeddings(
      mockReq,
      contextId,
      { maxEntries: 3 },
      mockUser,
    );
    expect(service.backfillEmbeddings).toHaveBeenCalledExactlyOnceWith(
      contextId,
      organizationId,
      { organizationId, userId, isApiKey: false, scopes: [] },
      { maxEntries: 3 },
    );
    expect(result.meta).toEqual(admission);
    const encoded = JSON.stringify(result);
    for (const secret of [
      'private-lease',
      'private-actor',
      'private-job',
      'private-hash',
      'private-source-content',
    ])
      expect(encoded).not.toContain(secret);
    expect(encoded).not.toContain('"embedding"');
    expect(Reflect.getMetadata('roles', controller.backfillEmbeddings)).toEqual(
      [MemberRole.OWNER, MemberRole.ADMIN],
    );
    expect(
      Reflect.getMetadata('__guards__', controller.backfillEmbeddings),
    ).toContain(RolesGuard);
  });

  describe('context base lifecycle', () => {
    type StoredContext = {
      category?: string;
      createdBy?: string;
      description?: string;
      entries: { content: string; id: string; provenance: unknown }[];
      id: string;
      isActive: boolean;
      isDeleted: boolean;
      label: string;
      organization: string;
    };
    let store: StoredContext[];

    const visible = (id: string, org: string) => {
      const row = store.find(
        (item) =>
          item.id === id && item.organization === org && !item.isDeleted,
      );
      if (!row) throw new NotFoundException('Context base', id);
      return row;
    };

    beforeEach(() => {
      store = [
        {
          category: 'general',
          entries: [],
          id: contextId,
          isActive: true,
          isDeleted: false,
          label: 'Brand voice',
          organization: organizationId,
        },
        {
          category: 'general',
          entries: [],
          id: 'foreign-context',
          isActive: true,
          isDeleted: false,
          label: 'Brand voice elsewhere',
          organization: 'org-other',
        },
      ];
      mockContextsService.create.mockImplementation(
        async (dto: CreateContextDto, org: string, createdBy: string) => {
          const row = {
            ...dto,
            createdBy,
            entries: [],
            id: `context-${store.length + 1}`,
            isActive: true,
            isDeleted: false,
            organization: org,
          };
          store.push(row);
          return row;
        },
      );
      mockContextsService.findAll.mockImplementation(
        async (
          org: string,
          filters: { category?: string; isActive?: boolean; search?: string },
          paging: { limit: number; page: number },
        ) => {
          const docs = store.filter(
            (row) =>
              row.organization === org &&
              !row.isDeleted &&
              (filters.category === undefined ||
                row.category === filters.category) &&
              (filters.isActive === undefined ||
                row.isActive === filters.isActive) &&
              (filters.search === undefined ||
                row.label.toLowerCase().includes(filters.search)),
          );
          return {
            docs: docs.slice(
              (paging.page - 1) * paging.limit,
              paging.page * paging.limit,
            ),
            limit: paging.limit,
            page: paging.page,
            totalDocs: docs.length,
          };
        },
      );
      mockContextsService.findOne.mockImplementation(
        async (id: string, org: string) => visible(id, org),
      );
      mockContextsService.update.mockImplementation(
        async (id: string, dto: UpdateContextDto, org: string) =>
          Object.assign(visible(id, org), dto),
      );
      mockContextsService.remove.mockImplementation(
        async (id: string, org: string) => {
          visible(id, org).isDeleted = true;
        },
      );
      mockContextsService.addEntry.mockImplementation(
        async (
          id: string,
          dto: AddEntryDto,
          org: string,
          _options: unknown,
          provenance: unknown,
        ) => {
          const entry = {
            content: dto.content,
            id: `entry-${id}-${visible(id, org).entries.length + 1}`,
            provenance,
          };
          visible(id, org).entries.push(entry);
          return { ...entry, contextBase: id, organization: org };
        },
      );
      mockContextsService.removeEntry.mockImplementation(
        async (id: string, entryId: string, org: string) => {
          const row = visible(id, org);
          row.entries = row.entries.filter((entry) => entry.id !== entryId);
        },
      );
      mockContextsService.getStats.mockImplementation(
        async (id: string, org: string) => ({
          totalEntries: visible(id, org).entries.length,
        }),
      );
    });

    it('creates a context base owned by the caller organization and user', async () => {
      const createDto: CreateContextDto = {
        description: 'A test context base',
        label: 'Test Context',
        type: 'custom',
      };

      const result = await controller.create(mockReq, createDto, mockUser);

      expect(store.at(-1)).toMatchObject({
        createdBy: userId,
        label: 'Test Context',
        organization: organizationId,
      });
      expect(result).toMatchObject({
        data: {
          attributes: {
            createdBy: userId,
            label: 'Test Context',
          },
          id: 'context-3',
        },
      });
    });

    it('lists only the caller organization with default paging', async () => {
      const result = await controller.findAll(mockReq, mockUser);

      expect(result).toMatchObject({
        data: [{ attributes: { label: 'Brand voice' }, id: contextId }],
      });
      expect(JSON.stringify(result)).not.toContain('foreign-context');
    });

    it('applies the category, active, search and page filters', async () => {
      store.push(
        {
          category: 'general',
          entries: [],
          id: 'inactive-voice',
          isActive: false,
          isDeleted: false,
          label: 'Old voice notes',
          organization: organizationId,
        },
        {
          category: 'general',
          entries: [],
          id: 'inactive-faq',
          isActive: false,
          isDeleted: false,
          label: 'FAQ',
          organization: organizationId,
        },
      );

      const firstPage = await controller.findAll(mockReq, mockUser, {
        category: 'general',
        isActive: 'false',
        limit: 50,
        page: 1,
        search: 'voice',
      });
      const thirdPage = await controller.findAll(mockReq, mockUser, {
        category: 'general',
        isActive: 'false',
        limit: 50,
        page: 3,
        search: 'voice',
      });

      expect(firstPage).toMatchObject({ data: [{ id: 'inactive-voice' }] });
      expect(thirdPage).toMatchObject({ data: [] });
    });

    it('reads a context only inside the caller organization', async () => {
      await expect(
        controller.findOne(mockReq, contextId, mockUser),
      ).resolves.toMatchObject({
        data: { attributes: { label: 'Brand voice' }, id: contextId },
      });
      await expect(
        controller.findOne(mockReq, 'foreign-context', mockUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the caller context and leaves other tenants untouched', async () => {
      const result = await controller.update(
        mockReq,
        contextId,
        { label: 'Updated Context' },
        mockUser,
      );

      expect(result).toMatchObject({
        data: { attributes: { label: 'Updated Context' }, id: contextId },
      });
      await expect(
        controller.update(
          mockReq,
          'foreign-context',
          { label: 'Hijacked' },
          mockUser,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(store[1].label).toBe('Brand voice elsewhere');
    });

    it('soft-deletes the caller context and confirms it', async () => {
      const result = await controller.remove(contextId, mockUser);

      expect(result).toEqual({ message: 'Context base deleted successfully' });
      expect(store[0].isDeleted).toBe(true);
      await expect(
        controller.findOne(mockReq, contextId, mockUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('adds an entry attributed to the acting member', async () => {
      const addEntryDto: AddEntryDto = {
        content: 'New entry content',
        metadata: {},
      };

      const result = await controller.addEntry(
        mockReq,
        contextId,
        addEntryDto,
        mockUser,
      );

      expect(result).toMatchObject({
        data: {
          attributes: {
            content: 'New entry content',
            contextBase: contextId,
          },
        },
      });
      expect(store[0].entries).toEqual([
        {
          content: 'New entry content',
          id: `entry-${contextId}-1`,
          provenance: {
            actor: { isApiKey: false, organizationId, scopes: [], userId },
            origin: 'ACTOR',
          },
        },
      ]);
    });

    it('removes an entry and reports the new count in stats', async () => {
      await controller.addEntry(
        mockReq,
        contextId,
        { content: 'First', metadata: {} },
        mockUser,
      );
      await controller.addEntry(
        mockReq,
        contextId,
        { content: 'Second', metadata: {} },
        mockUser,
      );

      const result = await controller.removeEntry(
        contextId,
        `entry-${contextId}-1`,
        mockUser,
      );

      expect(result).toEqual({ message: 'Entry removed successfully' });
      await expect(controller.getStats(contextId, mockUser)).resolves.toEqual({
        totalEntries: 1,
      });
    });

    it('refuses stats for another tenant context', async () => {
      await expect(
        controller.getStats('foreign-context', mockUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('autoCreateFromAccount', () => {
    it('creates the context for the acting member and returns it serialized', async () => {
      const dto: AutoCreateContextDto = {
        brandId: 'account123' as AutoCreateContextDto['brandId'],
        description: 'Auto context',
        label: 'Auto Context',
        platform: 'twitter',
      };
      mockContextsService.autoCreateFromAccount.mockImplementation(
        async (
          input: AutoCreateContextDto,
          org: string,
          createdBy: string,
          provenance: { actor: { userId: string } },
        ) => ({
          ...mockContext,
          createdBy: `${createdBy}:${provenance.actor.userId}`,
          id: 'auto-context',
          label: input.label,
          organization: org,
        }),
      );

      const result = await controller.autoCreateFromAccount(
        mockReq,
        dto,
        mockUser,
      );

      expect(result).toMatchObject({
        data: {
          attributes: {
            createdBy: `${userId}:${userId}`,
            label: 'Auto Context',
          },
          id: 'auto-context',
        },
      });
    });
  });

  describe('retrieval', () => {
    beforeEach(() => {
      mockContextsService.enhancePrompt.mockImplementation(
        async (dto: EnhancePromptDto, org: string, actorUserId: string) => ({
          context: [],
          enhancedPrompt: dto.prompt,
          originalPrompt: dto.prompt,
          scope: { actorUserId, brandId: dto.brandId, org },
        }),
      );
      mockContextsService.queryContext.mockImplementation(
        async (dto: QueryContextDto, org: string, actorUserId: string) => ({
          results: [{ content: `${dto.query} in ${org} for ${actorUserId}` }],
        }),
      );
    });

    it.each([
      ['an explicit brand', 'brand-explicit', undefined, 'brand-explicit'],
      ['the active request brand', undefined, 'brand-active', 'brand-active'],
      ['no brand', undefined, undefined, undefined],
    ])(
      'scopes prompt enhancement to %s',
      async (_label, dtoBrand, activeBrand, expectedBrand) => {
        const result = await controller.enhancePrompt(
          {
            brandId: dtoBrand,
            contentType: 'caption',
            prompt: 'Original prompt',
          },
          { ...mockUser, brandId: activeBrand } as User,
        );

        expect(result).toEqual({
          context: [],
          enhancedPrompt: 'Original prompt',
          originalPrompt: 'Original prompt',
          scope: {
            actorUserId: userId,
            brandId: expectedBrand,
            org: organizationId,
          },
        });
      },
    );

    it('queries the context base as the acting member in the caller organization', async () => {
      const result = await controller.queryContext(
        { contextBaseId: contextId, query: 'What is AI?' },
        mockUser,
      );

      expect(result).toEqual({
        results: [
          { content: `What is AI? in ${organizationId} for ${userId}` },
        ],
      });
    });
  });
});

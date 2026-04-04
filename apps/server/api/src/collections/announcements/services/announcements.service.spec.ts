import {
  Announcement,
  type AnnouncementDocument,
} from '@api/collections/announcements/schemas/announcement.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AnnouncementsService } from './announcements.service';

const makeDoc = (overrides: Partial<Announcement> = {}): AnnouncementDocument =>
  ({
    _id: new Types.ObjectId(),
    authorId: 'author-1',
    body: 'Test announcement body',
    channels: ['discord'],
    isDeleted: false,
    ...overrides,
  }) as unknown as AnnouncementDocument;

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let mockModel: {
    aggregatePaginate: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };

  const doc = makeDoc();

  beforeEach(async () => {
    mockModel = {
      aggregate: vi.fn().mockReturnValue({ exec: vi.fn() }),
      aggregatePaginate: vi.fn(),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        {
          provide: getModelToken(Announcement.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AnnouncementsService>(AnnouncementsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAnnouncement', () => {
    it('delegates to base create and returns the document', async () => {
      vi.spyOn(service, 'create').mockResolvedValue(doc);

      const result = await service.createAnnouncement({
        authorId: 'a1',
        body: 'Hello',
        channels: [],
      });

      expect(service.create).toHaveBeenCalled();
      expect(result).toBe(doc);
    });

    it('passes the data through to create', async () => {
      const spy = vi.spyOn(service, 'create').mockResolvedValue(doc);
      const data = {
        authorId: 'author-2',
        body: 'New announcement',
        channels: ['twitter'],
      };

      await service.createAnnouncement(data);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'New announcement' }),
      );
    });

    it('propagates errors from create', async () => {
      vi.spyOn(service, 'create').mockRejectedValue(
        new Error('DB write failed'),
      );

      await expect(
        service.createAnnouncement({
          authorId: 'a',
          body: 'Oops',
          channels: [],
        }),
      ).rejects.toThrow('DB write failed');
    });
  });

  describe('getAll', () => {
    const paginateResult = {
      docs: [makeDoc(), makeDoc()],
      hasNextPage: false,
      hasPrevPage: false,
      limit: 200,
      page: 1,
      totalDocs: 2,
      totalPages: 1,
    };

    it('returns the docs array from findAll result', async () => {
      vi.spyOn(service, 'findAll').mockResolvedValue(paginateResult as never);

      const result = await service.getAll();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('calls findAll with $match isDeleted: false', async () => {
      const spy = vi
        .spyOn(service, 'findAll')
        .mockResolvedValue(paginateResult as never);

      await service.getAll();

      const pipeline = spy.mock.calls[0][0] as Array<Record<string, unknown>>;
      const matchStage = pipeline.find((s) => s['$match'] !== undefined);
      expect(matchStage).toBeDefined();
      expect(
        (matchStage?.['$match'] as Record<string, unknown>).isDeleted,
      ).toBe(false);
    });

    it('calls findAll with $sort createdAt: -1', async () => {
      const spy = vi
        .spyOn(service, 'findAll')
        .mockResolvedValue(paginateResult as never);

      await service.getAll();

      const pipeline = spy.mock.calls[0][0] as Array<Record<string, unknown>>;
      const sortStage = pipeline.find((s) => s['$sort'] !== undefined);
      expect(sortStage?.['$sort']).toEqual({ createdAt: -1 });
    });

    it('applies a $limit of 200', async () => {
      const spy = vi
        .spyOn(service, 'findAll')
        .mockResolvedValue(paginateResult as never);

      await service.getAll();

      const pipeline = spy.mock.calls[0][0] as Array<Record<string, unknown>>;
      const limitStage = pipeline.find((s) => s['$limit'] !== undefined);
      expect(limitStage?.['$limit']).toBe(200);
    });

    it('passes limit: 200 and page: 1 in pagination options', async () => {
      const spy = vi
        .spyOn(service, 'findAll')
        .mockResolvedValue(paginateResult as never);

      await service.getAll();

      const options = spy.mock.calls[0][1] as Record<string, unknown>;
      expect(options.limit).toBe(200);
      expect(options.page).toBe(1);
    });

    it('returns empty array when no announcements exist', async () => {
      vi.spyOn(service, 'findAll').mockResolvedValue({ docs: [] } as never);

      const result = await service.getAll();

      expect(result).toEqual([]);
    });

    it('propagates errors from findAll', async () => {
      vi.spyOn(service, 'findAll').mockRejectedValue(
        new Error('Aggregation failed'),
      );

      await expect(service.getAll()).rejects.toThrow('Aggregation failed');
    });
  });
});

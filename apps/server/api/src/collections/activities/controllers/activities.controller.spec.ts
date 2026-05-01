vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type: string, id: string) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
    statusCode: 404,
  })),
  serializeCollection: vi.fn(
    (_req: unknown, _ser: unknown, data: { docs?: unknown[] }) => ({
      data: data.docs || data,
    }),
  ),
  serializeSingle: vi.fn((_req: unknown, _ser: unknown, data: unknown) => ({
    data,
  })),
}));

import { ActivitiesController } from '@api/collections/activities/controllers/activities.controller';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';

const userId = '507f191e810c19729de860ee';
const orgId = '507f191e810c19729de860ee';

const makeUser = (): User =>
  ({
    publicMetadata: {
      organization: orgId.toString(),
      user: userId.toString(),
    },
  }) as unknown as User;

const mockReq = {} as Request;

describe('ActivitiesController', () => {
  let controller: ActivitiesController;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let loggerService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    service = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    controller = new ActivitiesController(
      loggerService as unknown as LoggerService,
      service as unknown as ActivitiesService,
    );
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  // ── findAll ──────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns serialized collection of activities', async () => {
      const docs = [
        { _id: '507f191e810c19729de860ee', key: 'a' },
        { _id: '507f191e810c19729de860ee', key: 'b' },
      ];
      service.findAll.mockResolvedValue({
        docs,
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 2,
        totalPages: 1,
      } as never);

      const result = await controller.findAll(mockReq, {} as never);

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual({ data: docs });
    });

    it('passes isDeleted filter from query', async () => {
      service.findAll.mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      } as never);

      await controller.findAll(mockReq, { isDeleted: 'true' } as never);

      const aggregateArg = service.findAll.mock.calls[0][0];
      const matchStage = aggregateArg.find(
        (s: Record<string, unknown>) => 'match' in s,
      );
      expect(matchStage.match.isDeleted).toBe(true);
    });
  });

  // ── update ───────────────────────────────────────────────────────────

  describe('update', () => {
    it('returns not found when activity does not exist', async () => {
      service.findOne.mockResolvedValue(null);

      const result = await controller.update(
        mockReq,
        'nonexistent',
        { isRead: true },
        makeUser(),
      );

      expect(result).toHaveProperty('statusCode', 404);
    });

    it('patches the activity when ownership is valid', async () => {
      const activityId = '507f191e810c19729de860ee'.toString();
      const activity = { _id: activityId, organization: orgId, user: userId };

      service.findOne.mockResolvedValue(activity as never);
      service.patch.mockResolvedValue({
        ...activity,
        isRead: true,
      } as never);

      const result = await controller.update(
        mockReq,
        activityId,
        { isRead: true },
        makeUser(),
      );

      expect(service.patch).toHaveBeenCalledWith(activityId, { isRead: true });
      expect(result).toEqual({
        data: { ...activity, isRead: true },
      });
    });
  });

  // ── bulkUpdate ───────────────────────────────────────────────────────

  describe('bulkUpdate', () => {
    it('updates multiple activities and returns counts', async () => {
      const id1 = '507f191e810c19729de860ee'.toString();
      const id2 = '507f191e810c19729de860ee'.toString();

      const activity1 = {
        _id: id1,
        organization: orgId,
        user: userId,
      };
      const activity2 = {
        _id: id2,
        organization: orgId,
        user: userId,
      };

      service.findOne
        .mockResolvedValueOnce(activity1 as never)
        .mockResolvedValueOnce(activity2 as never);
      service.patch.mockResolvedValue({} as never);

      const result = await controller.bulkUpdate(
        mockReq,
        { ids: [id1, id2], isRead: true },
        makeUser(),
      );

      expect(service.patch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        failed: [],
        message: 'Updated 2 of 2 activities',
        updated: [id1, id2],
      });
    });

    it('records failed ids when activity is not found', async () => {
      const id1 = '507f191e810c19729de860ee'.toString();

      service.findOne.mockResolvedValue(null);

      const result = await controller.bulkUpdate(
        mockReq,
        { ids: [id1], isRead: true },
        makeUser(),
      );

      expect(result).toEqual({
        failed: [id1],
        message: 'Updated 0 of 1 activities',
        updated: [],
      });
    });

    it('rejects update when user lacks permission', async () => {
      const id1 = '507f191e810c19729de860ee'.toString();
      const otherUser = '507f191e810c19729de860ee';
      const otherOrg = '507f191e810c19729de860ee';

      service.findOne.mockResolvedValue({
        _id: id1,
        organization: otherOrg,
        user: otherUser,
      } as never);

      const result = await controller.bulkUpdate(
        mockReq,
        { ids: [id1], isRead: true },
        makeUser(),
      );

      expect(result).toEqual({
        failed: [id1],
        message: 'Updated 0 of 1 activities',
        updated: [],
      });
    });

    it('handles errors during individual updates gracefully', async () => {
      const id1 = '507f191e810c19729de860ee'.toString();

      service.findOne.mockResolvedValue({
        _id: id1,
        organization: orgId,
        user: userId,
      } as never);
      service.patch.mockRejectedValue(new Error('DB error'));

      const result = await controller.bulkUpdate(
        mockReq,
        { ids: [id1], isDeleted: true },
        makeUser(),
      );

      expect(result).toEqual({
        failed: [id1],
        message: 'Updated 0 of 1 activities',
        updated: [],
      });
    });
  });
});

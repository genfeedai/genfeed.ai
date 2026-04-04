import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import type { User } from '@clerk/backend';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { StreaksController } from './streaks.controller';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(),
}));

const ORG_ID = 'org-abc-123';
const USER_ID = 'user-xyz-456';

const mockUser = {} as User;

describe('StreaksController', () => {
  let controller: StreaksController;
  let streaksService: vi.Mocked<StreaksService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StreaksController],
      providers: [
        {
          provide: StreaksService,
          useValue: {
            getCalendar: vi.fn(),
            getStreakSummary: vi.fn(),
            useFreeze: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(StreaksController);
    streaksService = module.get(StreaksService);

    vi.mocked(getPublicMetadata).mockReturnValue({
      organization: ORG_ID,
      user: USER_ID,
    } as ReturnType<typeof getPublicMetadata>);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── assertUserOrgAccess ───────────────────────────────────────────────────

  describe('org access guard', () => {
    it('throws BadRequestException when organizationId does not match user metadata', async () => {
      vi.mocked(getPublicMetadata).mockReturnValue({
        organization: 'different-org',
        user: USER_ID,
      } as ReturnType<typeof getPublicMetadata>);

      await expect(controller.getMyStreak(ORG_ID, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── getMyStreak ───────────────────────────────────────────────────────────

  describe('getMyStreak', () => {
    it('returns streak summary for current user', async () => {
      const mockSummary = { currentStreak: 5, longestStreak: 10 };
      streaksService.getStreakSummary.mockResolvedValue(mockSummary as never);

      const result = await controller.getMyStreak(ORG_ID, mockUser);

      expect(streaksService.getStreakSummary).toHaveBeenCalledWith(
        USER_ID,
        ORG_ID,
      );
      expect(result).toEqual(mockSummary);
    });

    it('propagates errors from streaksService', async () => {
      streaksService.getStreakSummary.mockRejectedValue(new Error('DB error'));
      await expect(controller.getMyStreak(ORG_ID, mockUser)).rejects.toThrow(
        'DB error',
      );
    });
  });

  // ── getMyCalendar ─────────────────────────────────────────────────────────

  describe('getMyCalendar', () => {
    it('returns calendar data without date filters', async () => {
      const mockCalendar = [{ active: true, date: '2026-03-01' }];
      streaksService.getCalendar.mockResolvedValue(mockCalendar as never);

      const result = await controller.getMyCalendar(ORG_ID, mockUser, {});

      expect(streaksService.getCalendar).toHaveBeenCalledWith(
        USER_ID,
        ORG_ID,
        undefined,
        undefined,
      );
      expect(result).toEqual(mockCalendar);
    });

    it('passes from/to as Date objects when provided', async () => {
      streaksService.getCalendar.mockResolvedValue([] as never);

      await controller.getMyCalendar(ORG_ID, mockUser, {
        from: '2026-01-01',
        to: '2026-03-01',
      });

      const [, , from, to] = streaksService.getCalendar.mock.calls[0];
      expect(from).toBeInstanceOf(Date);
      expect(to).toBeInstanceOf(Date);
    });
  });

  // ── useFreeze ─────────────────────────────────────────────────────────────

  describe('useFreeze', () => {
    it('applies freeze and returns message + remaining freezes', async () => {
      streaksService.useFreeze.mockResolvedValue({
        streakFreezes: 2,
      } as never);

      const result = await controller.useFreeze(ORG_ID, mockUser);

      expect(streaksService.useFreeze).toHaveBeenCalledWith(USER_ID, ORG_ID);
      expect(result).toEqual({
        message: 'Freeze applied. Your streak is safe for today.',
        streakFreezes: 2,
      });
    });

    it('throws when org id does not match', async () => {
      vi.mocked(getPublicMetadata).mockReturnValue({
        organization: 'other-org',
        user: USER_ID,
      } as ReturnType<typeof getPublicMetadata>);

      await expect(controller.useFreeze(ORG_ID, mockUser)).rejects.toThrow(
        BadRequestException,
      );
      expect(streaksService.useFreeze).not.toHaveBeenCalled();
    });

    it('propagates service errors', async () => {
      streaksService.useFreeze.mockRejectedValue(new Error('No freezes left'));
      await expect(controller.useFreeze(ORG_ID, mockUser)).rejects.toThrow(
        'No freezes left',
      );
    });
  });
});

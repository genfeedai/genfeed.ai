import { ReplyTargetDiscoveryService } from '@api/services/reply-bot/reply-target-discovery.service';
import { WARMUP_MAX_MONITORED_TARGETS } from '@genfeedai/contracts/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = (username: string, engagement: number) => ({
  authorName: username,
  authorUsername: username,
  createdAt: '2026-10-20T00:00:00Z',
  engagement,
  id: `post-${username}`,
  likes: engagement,
  quotes: 0,
  replies: 0,
  retweets: 0,
  text: `post by ${username}`,
});

describe('ReplyTargetDiscoveryService', () => {
  const twitterService = {
    getUserByUsername: vi.fn(),
    searchRecentTweets: vi.fn(),
  };
  const replyBotConfigsService = { create: vi.fn(), find: vi.fn() };
  const monitoredAccountsService = { create: vi.fn() };
  const prisma = {
    credential: { findFirst: vi.fn(), findMany: vi.fn() },
    monitoredAccount: { findMany: vi.fn() },
  };
  const logger = { warn: vi.fn() };
  let service: ReplyTargetDiscoveryService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.monitoredAccount.findMany.mockResolvedValue([]);
    prisma.credential.findFirst.mockResolvedValue({ externalHandle: '@me' });
    service = new ReplyTargetDiscoveryService(
      twitterService as never,
      replyBotConfigsService as never,
      monitoredAccountsService as never,
      prisma as never,
      logger as never,
    );
  });

  describe('discover', () => {
    it('rejects a query that is too short', async () => {
      await expect(
        service.discover({ brandId: 'b', organizationId: 'o', query: 'ai' }),
      ).rejects.toThrow('Describe the niche');
      expect(twitterService.searchRecentTweets).not.toHaveBeenCalled();
    });

    it('suggests in-range accounts, skipping own and monitored handles', async () => {
      prisma.monitoredAccount.findMany.mockResolvedValue([
        { config: { username: 'Watched' } },
      ]);
      twitterService.searchRecentTweets.mockResolvedValue([
        post('big', 90),
        post('me', 80),
        post('watched', 70),
        post('tiny', 60),
        post('giant', 50),
        post('ok', 40),
        post('ok', 10),
      ]);
      twitterService.getUserByUsername.mockImplementation(
        async (username: string) => ({
          followersCount:
            { giant: 5_000_000, ok: 20_000, tiny: 10 }[username] ?? 5_000,
          id: `id-${username}`,
          name: username,
          username,
        }),
      );

      const result = await service.discover({
        brandId: 'b',
        organizationId: 'o',
        query: 'indie hackers',
      });

      expect(result.map((s) => s.username)).toEqual(['big', 'ok']);
      expect(result[1]).toMatchObject({ matchedPosts: 2, engagement: 50 });
      expect(twitterService.getUserByUsername).not.toHaveBeenCalledWith('me');
      expect(twitterService.getUserByUsername).not.toHaveBeenCalledWith(
        'watched',
      );
    });

    it('drops candidates whose lookup fails', async () => {
      twitterService.searchRecentTweets.mockResolvedValue([
        post('a', 10),
        post('b', 5),
      ]);
      twitterService.getUserByUsername
        .mockRejectedValueOnce(new Error('rate limited'))
        .mockResolvedValueOnce({
          followersCount: 3000,
          id: '2',
          username: 'b',
        });

      const result = await service.discover({
        brandId: 'b',
        organizationId: 'o',
        query: 'indie hackers',
      });

      expect(result.map((s) => s.username)).toEqual(['b']);
    });
  });

  describe('addTarget', () => {
    const params = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
      username: '@someone',
    };
    const xUser = {
      followersCount: 4000,
      id: 'x-1',
      name: 'Some One',
      username: 'someone',
    };

    it('creates the monitor on first use and adds the account', async () => {
      twitterService.getUserByUsername.mockResolvedValue(xUser);
      replyBotConfigsService.find.mockResolvedValue([]);
      prisma.credential.findMany.mockResolvedValue([{ id: 'cred-1' }]);
      replyBotConfigsService.create.mockResolvedValue({
        credentialId: 'cred-1',
        id: 'bot-1',
      });
      monitoredAccountsService.create.mockResolvedValue({ id: 'acc-1' });

      const result = await service.addTarget(params);

      expect(twitterService.getUserByUsername).toHaveBeenCalledWith('someone');
      expect(replyBotConfigsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialId: 'cred-1',
          organizationId: 'org-1',
          type: 'account_monitor',
        }),
      );
      expect(monitoredAccountsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          botConfigId: 'bot-1',
          credentialId: 'cred-1',
          organizationId: 'org-1',
          username: 'someone',
        }),
      );
      expect(result).toEqual({
        botConfigId: 'bot-1',
        monitoredAccountId: 'acc-1',
        username: 'someone',
      });
    });

    it('reuses an existing X monitor', async () => {
      twitterService.getUserByUsername.mockResolvedValue(xUser);
      replyBotConfigsService.find.mockResolvedValue([
        { credentialId: 'cred-1', id: 'bot-9', platform: 'twitter' },
      ]);
      monitoredAccountsService.create.mockResolvedValue({ id: 'acc-2' });

      await service.addTarget(params);

      expect(replyBotConfigsService.create).not.toHaveBeenCalled();
      expect(monitoredAccountsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ botConfigId: 'bot-9' }),
      );
    });

    it('refuses to guess when the brand has several X accounts', async () => {
      twitterService.getUserByUsername.mockResolvedValue(xUser);
      replyBotConfigsService.find.mockResolvedValue([]);
      prisma.credential.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      await expect(service.addTarget(params)).rejects.toThrow(
        'Connect one X account',
      );
      expect(replyBotConfigsService.create).not.toHaveBeenCalled();
    });

    it('rejects duplicates and unknown users', async () => {
      prisma.monitoredAccount.findMany.mockResolvedValue([
        { config: { username: 'someone' } },
      ]);
      twitterService.getUserByUsername.mockResolvedValue(xUser);
      await expect(service.addTarget(params)).rejects.toThrow(
        'already monitored',
      );

      prisma.monitoredAccount.findMany.mockResolvedValue([]);
      twitterService.getUserByUsername.mockResolvedValue(null);
      await expect(service.addTarget(params)).rejects.toThrow('not found');
    });

    it('enforces the monitored-account cap', async () => {
      prisma.monitoredAccount.findMany.mockResolvedValue(
        Array.from({ length: WARMUP_MAX_MONITORED_TARGETS }, (_, i) => ({
          config: { username: `u${i}` },
        })),
      );

      await expect(service.addTarget(params)).rejects.toThrow('up to');
      expect(twitterService.getUserByUsername).not.toHaveBeenCalled();
    });
  });
});

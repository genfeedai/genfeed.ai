import {
  axiosResponse,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { AdsResearchService } from '@services/ads/ads-research.service';
import { PostAnalyticsService } from '@services/analytics/publication-analytics.service';
import { AuthService } from '@services/auth/auth.service';
import { StreaksService } from '@services/engagement/streaks.service';
import { HookRemixService } from '@services/hook-remix/hook-remix.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('PostAnalyticsService', () => {
  let service: PostAnalyticsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PostAnalyticsService('post-analytics-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = PostAnalyticsService.getInstance('tok');
    expect(PostAnalyticsService.getInstance('tok')).toBe(first);
  });

  it('getPostAnalytics GETs with only provided dates', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        resourceDocument({ summary: { views: 5 } }, { id: 'pub_1' }),
      ),
    );

    const result = await service.getPostAnalytics(
      'pub_1',
      '2026-01-01',
      '2026-02-01',
    );

    expect(http.get).toHaveBeenCalledWith('/pub_1/analytics', {
      params: { endDate: '2026-02-01', startDate: '2026-01-01' },
    });
    expect(result).toMatchObject({ summary: { views: 5 } });
  });

  it('getPostAnalytics omits missing dates', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        resourceDocument({ summary: { views: 0 } }, { id: 'pub_1' }),
      ),
    );

    await service.getPostAnalytics('pub_1');

    expect(http.get).toHaveBeenCalledWith('/pub_1/analytics', {
      params: {},
    });
  });

  it('postAnalytics POSTs a refresh for one publication', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { lastRefreshed: 'now', summary: { views: 1 } },
          { id: 'pub_1' },
        ),
      ),
    );

    const result = await service.postAnalytics('pub_1');

    expect(http.post).toHaveBeenCalledWith('/pub_1/analytics');
    expect(result).toMatchObject({ lastRefreshed: 'now' });
  });

  it('postAllAnalytics POSTs the bulk refresh', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ refreshed: 3 }, { id: 'refresh_1' })),
    );

    const result = await service.postAllAnalytics();

    expect(http.post).toHaveBeenCalledWith('analytics');
    expect(result).toMatchObject({ refreshed: 3 });
  });
});

describe('StreaksService', () => {
  let service: StreaksService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StreaksService('streaks-token', 'org_1');
    http = installMockHttp(service);
  });

  it('getInstance requires an organizationId', () => {
    expect(() => StreaksService.getInstance('tok')).toThrow(
      'organizationId is required for StreaksService',
    );
  });

  it('getInstance caches per token and organization', () => {
    const first = StreaksService.getInstance('tok', 'org_1');
    expect(StreaksService.getInstance('tok', 'org_1')).toBe(first);
  });

  it('getMyStreak GETs me', async () => {
    const streak = { currentStreak: 4 };
    http.get.mockResolvedValue(axiosResponse(streak));

    const result = await service.getMyStreak();

    expect(http.get).toHaveBeenCalledWith('me');
    expect(result).toEqual(streak);
  });

  it('getMyCalendar GETs me/calendar with the range', async () => {
    const calendar = { days: [] };
    http.get.mockResolvedValue(axiosResponse(calendar));

    const result = await service.getMyCalendar({
      from: '2026-01-01',
      to: '2026-02-01',
    });

    expect(http.get).toHaveBeenCalledWith('me/calendar', {
      params: { from: '2026-01-01', to: '2026-02-01' },
    });
    expect(result).toEqual(calendar);
  });

  it('useFreeze PATCHes the freeze flag', async () => {
    const payload = { message: 'frozen', streakFreezes: 1 };
    http.patch.mockResolvedValue(axiosResponse(payload));

    const result = await service.useFreeze();

    expect(http.patch).toHaveBeenCalledWith('me', { freeze: true });
    expect(result).toEqual(payload);
  });
});

describe('AuthService', () => {
  let service: AuthService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService('auth-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = AuthService.getInstance('tok');
    expect(AuthService.getInstance('tok')).toBe(first);
  });

  it('getBootstrap GETs the protected app bootstrap', async () => {
    const payload = { access: { userId: 'user_1' }, brands: [] };
    http.get.mockResolvedValue(axiosResponse(payload));

    const result = await service.getBootstrap();

    expect(http.get).toHaveBeenCalledWith('bootstrap');
    expect(result).toEqual(payload);
  });

  it('getOverviewBootstrap GETs the overview bootstrap', async () => {
    const payload = { activeRuns: [], runs: [] };
    http.get.mockResolvedValue(axiosResponse(payload));

    const result = await service.getOverviewBootstrap();

    expect(http.get).toHaveBeenCalledWith('bootstrap/overview');
    expect(result).toEqual(payload);
  });
});

describe('HookRemixService', () => {
  let service: HookRemixService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new HookRemixService('hook-remix-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = HookRemixService.getInstance('tok');
    expect(HookRemixService.getInstance('tok')).toBe(first);
  });

  it('createHookRemix POSTs the remix payload', async () => {
    const created = { id: 'job_1', status: 'queued' };
    http.post.mockResolvedValue(axiosResponse(created));

    const data = { videoId: 'video_1' } as Parameters<
      HookRemixService['createHookRemix']
    >[0];
    const result = await service.createHookRemix(data);

    expect(http.post).toHaveBeenCalledWith('/', data);
    expect(result).toEqual(created);
  });

  it('createHookRemix rethrows failures', async () => {
    http.post.mockRejectedValue(new Error('down'));

    const data = { videoId: 'video_1' } as Parameters<
      HookRemixService['createHookRemix']
    >[0];
    await expect(service.createHookRemix(data)).rejects.toThrow('down');
  });

  it('createBatchHookRemix POSTs to /batch', async () => {
    const created = { jobs: [], queued: 2 };
    http.post.mockResolvedValue(axiosResponse(created));

    const data = { videoIds: ['v1', 'v2'] } as Parameters<
      HookRemixService['createBatchHookRemix']
    >[0];
    const result = await service.createBatchHookRemix(data);

    expect(http.post).toHaveBeenCalledWith('/batch', data);
    expect(result).toEqual(created);
  });

  it('createBatchHookRemix rethrows failures', async () => {
    http.post.mockRejectedValue(new Error('down'));

    const data = { videoIds: [] } as unknown as Parameters<
      HookRemixService['createBatchHookRemix']
    >[0];
    await expect(service.createBatchHookRemix(data)).rejects.toThrow('down');
  });

  it('getJobStatus GETs the job', async () => {
    const job = { id: 'job_1', progress: 40, status: 'processing' };
    http.get.mockResolvedValue(axiosResponse(job));

    const result = await service.getJobStatus('job_1');

    expect(http.get).toHaveBeenCalledWith('/job_1');
    expect(result).toEqual(job);
  });

  it('getJobStatus rethrows failures', async () => {
    http.get.mockRejectedValue(new Error('down'));
    await expect(service.getJobStatus('job_1')).rejects.toThrow('down');
  });
});

describe('AdsResearchService', () => {
  let service: AdsResearchService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdsResearchService('ads-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = AdsResearchService.getInstance('tok');
    expect(AdsResearchService.getInstance('tok')).toBe(first);
  });

  it('list GETs with the research filters', async () => {
    const response = { ads: [], total: 0 };
    http.get.mockResolvedValue(axiosResponse(response));

    const filters = { platform: 'meta' } as Parameters<
      AdsResearchService['list']
    >[0];
    const result = await service.list(filters);

    expect(http.get).toHaveBeenCalledWith('', { params: filters });
    expect(result).toEqual(response);
  });

  it('getDetail GETs source/id with remaining params as query', async () => {
    const detail = { id: 'ad_1' };
    http.get.mockResolvedValue(axiosResponse(detail));

    const result = await service.getDetail({
      adAccountId: 'acct_1',
      id: 'ad_1',
      source: 'my_accounts',
    });

    expect(http.get).toHaveBeenCalledWith('my_accounts/ad_1', {
      params: { adAccountId: 'acct_1' },
    });
    expect(result).toEqual(detail);
  });

  it('generateAdPack POSTs to ad-pack', async () => {
    const pack = { id: 'pack_1' };
    http.post.mockResolvedValue(axiosResponse(pack));

    const result = await service.generateAdPack({
      adId: 'ad_1',
      source: 'public',
    });

    expect(http.post).toHaveBeenCalledWith('ad-pack', {
      adId: 'ad_1',
      source: 'public',
    });
    expect(result).toEqual(pack);
  });

  it('createRemixWorkflow POSTs to remix-workflow', async () => {
    const workflow = { workflowId: 'wf_1' };
    http.post.mockResolvedValue(axiosResponse(workflow));

    const result = await service.createRemixWorkflow({
      adId: 'ad_1',
      source: 'public',
    });

    expect(http.post).toHaveBeenCalledWith('remix-workflow', {
      adId: 'ad_1',
      source: 'public',
    });
    expect(result).toEqual(workflow);
  });

  it('prepareCampaignForReview POSTs to launch-prep', async () => {
    const prep = { campaignId: 'camp_1' };
    http.post.mockResolvedValue(axiosResponse(prep));

    const result = await service.prepareCampaignForReview({
      adId: 'ad_1',
      dailyBudget: 20,
      source: 'my_accounts',
    });

    expect(http.post).toHaveBeenCalledWith('launch-prep', {
      adId: 'ad_1',
      dailyBudget: 20,
      source: 'my_accounts',
    });
    expect(result).toEqual(prep);
  });

  it('listAdAccounts GETs the platform accounts endpoint', async () => {
    const accounts = [{ id: 'acct_1', name: 'Main' }];
    http.get.mockResolvedValue(axiosResponse(accounts));

    const result = await service.listAdAccounts({
      credentialId: 'cred_1',
      platform: 'meta' as Parameters<
        AdsResearchService['listAdAccounts']
      >[0]['platform'],
    });

    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('/ads/meta/accounts'),
      { params: { credentialId: 'cred_1', loginCustomerId: undefined } },
    );
    expect(result).toEqual(accounts);
  });
});

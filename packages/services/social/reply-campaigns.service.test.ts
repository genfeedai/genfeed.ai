import { SocialReplyCampaignModel } from '@genfeedai/models/social/social-reply-campaign.model';
import { SocialReplyCampaignRecipientModel } from '@genfeedai/models/social/social-reply-campaign-recipient.model';
import { SocialReplyCampaignsService } from '@services/social/reply-campaigns.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDelete = vi.fn();
const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai/v1' },
}));

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    protected instance = {
      delete: mockDelete,
      get: mockGet,
      patch: mockPatch,
      post: mockPost,
    };
    protected readonly baseURL: string;

    constructor(baseURL: string) {
      this.baseURL = baseURL;
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

function campaignDocument(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      attributes: {
        bodyTemplate: 'Hi {{name}}',
        failedCount: 0,
        maxPerDay: 50,
        maxPerHour: 10,
        messageType: 'reply',
        minDelaySeconds: 60,
        name: 'Welcome wave',
        platform: 'youtube',
        sentCount: 3,
        skippedCount: 1,
        status: 'running',
        totalRecipients: 10,
        ...overrides,
      },
      id: 'campaign-1',
      type: 'social-reply-campaigns',
    },
  };
}

describe('SocialReplyCampaignsService', () => {
  let service: SocialReplyCampaignsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SocialReplyCampaignsService('test-token');
  });

  it('targets the campaigns path, not a nested messages route', () => {
    expect(service).toBeInstanceOf(SocialReplyCampaignsService);
    expect((service as unknown as { baseURL: string }).baseURL).toBe(
      'https://api.genfeed.ai/v1/message-campaigns',
    );
  });

  it('lists campaigns as models with pagination metadata', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [campaignDocument().data],
        links: { pagination: { limit: 25, page: 1, pages: 2, total: 30 } },
      },
    });

    const page = await service.listPage({ status: 'running' });

    expect(mockGet).toHaveBeenCalledWith('', {
      params: { status: 'running' },
      signal: undefined,
    });
    expect(page.items[0]).toBeInstanceOf(SocialReplyCampaignModel);
    expect(page.total).toBe(30);
    expect(page.hasNext).toBe(true);
  });

  it('forwards the abort signal so a stale fetch can be cancelled', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    const controller = new AbortController();

    await service.listPage({}, controller.signal);

    expect(mockGet).toHaveBeenCalledWith('', {
      params: {},
      signal: controller.signal,
    });
  });

  it('sends a transition to the dedicated status route', async () => {
    mockPatch.mockResolvedValue(campaignDocument({ status: 'paused' }));

    const campaign = await service.transition('campaign-1', 'pause');

    expect(mockPatch).toHaveBeenCalledWith('/campaign-1/status', {
      transition: 'pause',
    });
    expect(campaign).toBeInstanceOf(SocialReplyCampaignModel);
    expect(campaign.status).toBe('paused');
  });

  it('lists recipients in the order the API drains them', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            attributes: { conversationId: 'conversation-1', position: 0 },
            id: 'recipient-1',
            type: 'social-reply-campaign-recipients',
          },
          {
            attributes: { conversationId: 'conversation-2', position: 1 },
            id: 'recipient-2',
            type: 'social-reply-campaign-recipients',
          },
        ],
      },
    });

    const page = await service.listRecipientsPage('campaign-1', {
      status: 'pending',
    });

    expect(mockGet).toHaveBeenCalledWith('/campaign-1/recipients', {
      params: { status: 'pending' },
      signal: undefined,
    });
    expect(page.items[0]).toBeInstanceOf(SocialReplyCampaignRecipientModel);
    expect(page.items.map((item) => item.conversationId)).toEqual([
      'conversation-1',
      'conversation-2',
    ]);
  });

  it('creates a campaign from an enrollment payload', async () => {
    mockPost.mockResolvedValue(campaignDocument({ status: 'draft' }));

    await service.createCampaign({
      bodyTemplate: 'Hi {{name}}',
      conversationIds: ['conversation-1', 'conversation-2'],
      name: 'Welcome wave',
      platform: 'youtube',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        conversationIds: ['conversation-1', 'conversation-2'],
        name: 'Welcome wave',
      }),
    );
  });
});

describe('SocialReplyCampaignModel progress', () => {
  it('counts every terminal recipient, not just the successful ones', () => {
    const campaign = new SocialReplyCampaignModel({
      failedCount: 1,
      sentCount: 3,
      skippedCount: 1,
      totalRecipients: 10,
    });

    expect(campaign.processedCount).toBe(5);
    expect(campaign.remainingCount).toBe(5);
    expect(campaign.progressPercent).toBe(50);
  });

  it('reports zero progress rather than dividing by an empty roster', () => {
    const campaign = new SocialReplyCampaignModel({ totalRecipients: 0 });

    expect(campaign.progressPercent).toBe(0);
    expect(campaign.remainingCount).toBe(0);
  });
});

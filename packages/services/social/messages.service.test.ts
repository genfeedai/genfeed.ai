import { SocialConversationModel } from '@genfeedai/models/social/social-conversation.model';
import { SocialMessageModel } from '@genfeedai/models/social/social-message.model';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { SocialMessagesService } from '@services/social/messages.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SocialMessagesService', () => {
  const conversationId = 'conv_1';
  let service: SocialMessagesService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SocialMessagesService('messages-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = SocialMessagesService.getInstance('tok');
    expect(SocialMessagesService.getInstance('tok')).toBe(first);
  });

  describe('list and listPage', () => {
    it('list delegates to findAll with the inbox query', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'conv_1', status: 'open' }])),
      );

      const result = await service.list({ status: 'open' });

      expect(http.get).toHaveBeenCalledWith('', {
        params: { status: 'open' },
        signal: undefined,
      });
      expect(result[0]).toBeInstanceOf(SocialConversationModel);
    });

    it('listPage maps pagination links into the page envelope', async () => {
      http.get.mockResolvedValue(
        axiosResponse(
          collectionDocument([{ id: 'conv_1', status: 'open' }], {
            pagination: { limit: 10, page: 2, pages: 3, total: 30 },
          }),
        ),
      );

      const page = await service.listPage({ page: 2 });

      expect(page).toMatchObject({
        hasNext: true,
        hasPrevious: true,
        page: 2,
        pageSize: 10,
        total: 30,
        totalPages: 3,
      });
      expect(page.items[0]).toBeInstanceOf(SocialConversationModel);
    });

    it('listPage derives totals when pagination links are missing', async () => {
      http.get.mockResolvedValue(
        axiosResponse(
          collectionDocument([
            { id: 'conv_1', status: 'open' },
            { id: 'conv_2', status: 'open' },
          ]),
        ),
      );

      const page = await service.listPage({ limit: 1 });

      expect(page).toMatchObject({
        page: 1,
        pageSize: 1,
        total: 2,
        totalPages: 2,
      });
    });
  });

  it('getConversation fetches a single conversation', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        resourceDocument({ status: 'open' }, { id: conversationId }),
      ),
    );

    const result = await service.getConversation(conversationId);

    expect(http.get).toHaveBeenCalledWith(`/${conversationId}`, {
      params: {},
      signal: undefined,
    });
    expect(result).toBeInstanceOf(SocialConversationModel);
  });

  describe('messages', () => {
    it('listMessages GETs the conversation messages', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'msg_1', text: 'hi' }])),
      );

      const result = await service.listMessages(conversationId, { limit: 20 });

      expect(http.get).toHaveBeenCalledWith(`/${conversationId}/messages`, {
        params: { limit: 20 },
        signal: undefined,
      });
      expect(result[0]).toBeInstanceOf(SocialMessageModel);
    });

    it('listMessagesPage wraps messages in a page envelope', async () => {
      http.get.mockResolvedValue(
        axiosResponse(
          collectionDocument([{ id: 'msg_1', text: 'hi' }], {
            pagination: { limit: 5, page: 1, pages: 1, total: 1 },
          }),
        ),
      );

      const page = await service.listMessagesPage(conversationId);

      expect(page).toMatchObject({
        hasNext: false,
        hasPrevious: false,
        page: 1,
        pageSize: 5,
        total: 1,
        totalPages: 1,
      });
      expect(page.items[0]).toBeInstanceOf(SocialMessageModel);
    });
  });

  describe('draft workflow', () => {
    it('createDraft POSTs to the drafts action', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ text: 'draft' }, { id: 'msg_d' })),
      );

      const result = await service.createDraft(conversationId, {
        text: 'draft',
      });

      expect(http.post).toHaveBeenCalledWith(`/${conversationId}/drafts`, {
        text: 'draft',
      });
      expect(result).toBeInstanceOf(SocialMessageModel);
    });

    it('approveDraft PATCHes the draft to approved', async () => {
      http.patch.mockResolvedValue(
        axiosResponse(resourceDocument({ status: 'approved' }, { id: 'm1' })),
      );

      await service.approveDraft(conversationId, 'm1');

      expect(http.patch).toHaveBeenCalledWith(`/${conversationId}/drafts/m1`, {
        status: 'approved',
      });
    });

    it('rejectDraft PATCHes the draft to rejected with a reason', async () => {
      http.patch.mockResolvedValue(
        axiosResponse(resourceDocument({ status: 'rejected' }, { id: 'm2' })),
      );

      await service.rejectDraft(conversationId, 'm2', 'off brand');

      expect(http.patch).toHaveBeenCalledWith(`/${conversationId}/drafts/m2`, {
        reason: 'off brand',
        status: 'rejected',
      });
    });
  });

  describe('replies and dms', () => {
    it('postReply POSTs to the replies action', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ text: 'reply' }, { id: 'msg_r' })),
      );

      await service.postReply(conversationId, { text: 'reply' });

      expect(http.post).toHaveBeenCalledWith(`/${conversationId}/replies`, {
        text: 'reply',
      });
    });

    it('sendDm POSTs to the dms action', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ text: 'dm' }, { id: 'msg_m' })),
      );

      await service.sendDm(conversationId, { text: 'dm' });

      expect(http.post).toHaveBeenCalledWith(`/${conversationId}/dms`, {
        text: 'dm',
      });
    });
  });

  describe('conversation updates', () => {
    it('updateStatus PATCHes the conversation status', async () => {
      http.patch.mockResolvedValue(
        axiosResponse(
          resourceDocument({ status: 'resolved' }, { id: conversationId }),
        ),
      );

      await service.updateStatus(conversationId, 'resolved');

      expect(http.patch).toHaveBeenCalledWith(`/${conversationId}`, {
        status: 'resolved',
      });
    });

    it('updateTags PATCHes the conversation tags', async () => {
      http.patch.mockResolvedValue(
        axiosResponse(
          resourceDocument({ tags: ['vip'] }, { id: conversationId }),
        ),
      );

      await service.updateTags(conversationId, ['vip']);

      expect(http.patch).toHaveBeenCalledWith(`/${conversationId}`, {
        tags: ['vip'],
      });
    });

    it('assignOwner sends an explicit null through the raw client', async () => {
      http.patch.mockResolvedValue(
        axiosResponse(
          resourceDocument({ status: 'open' }, { id: conversationId }),
        ),
      );

      await service.assignOwner(conversationId, null);

      expect(http.patch).toHaveBeenCalledWith(`/${conversationId}`, {
        assignedOwnerId: null,
      });
    });
  });

  it('syncYoutube POSTs the sync limit', async () => {
    const payload = { jobId: 'job-1', status: 'queued' };
    http.post.mockResolvedValue(axiosResponse(payload));

    const result = await service.syncYoutube(10);

    expect(http.post).toHaveBeenCalledWith('/youtube/sync', { limit: 10 });
    expect(result).toEqual(payload);
  });

  it('syncInstagram enqueues a comment sweep on its own route', async () => {
    const payload = { jobId: 'job-2', status: 'queued' };
    http.post.mockResolvedValue(axiosResponse(payload));

    const result = await service.syncInstagram();

    expect(http.post).toHaveBeenCalledWith('/instagram/sync', { limit: 25 });
    expect(result).toEqual(payload);
  });

  it('syncInstagramDms enqueues a DM sweep on its own route', async () => {
    const payload = { jobId: 'job-3', status: 'queued' };
    http.post.mockResolvedValue(axiosResponse(payload));

    const result = await service.syncInstagramDms(5);

    expect(http.post).toHaveBeenCalledWith('/instagram/dms/sync', { limit: 5 });
    expect(result).toEqual(payload);
  });

  it('wraps transport failures in a structured error', async () => {
    http.post.mockRejectedValue({
      response: { data: { message: 'rate limited' }, status: 429 },
    });

    await expect(service.syncYoutube()).rejects.toMatchObject({
      status: 429,
    });
  });
});

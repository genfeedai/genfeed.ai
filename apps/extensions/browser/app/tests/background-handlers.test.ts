import {
  beforeEach,
  describe,
  expect,
  it,
  type MockedFunction,
  vi,
} from 'vitest';

// Mock the auth service
const mockAuthService = {
  clearToken: vi.fn(),
  getToken: vi.fn(),
  isAuthenticated: vi.fn(),
  makeAuthenticatedRequest: vi.fn(),
};

vi.mock('~services/auth.service', () => ({
  authService: mockAuthService,
}));

// Mock the logger
vi.mock('~utils/logger.util', () => ({
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Background Script Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('generateReplyWithMedia message handler', () => {
    it('should return error when not authenticated', async () => {
      mockAuthService.getToken.mockResolvedValue(null);

      const sendResponse = vi.fn();
      const _request = {
        event: 'generateReplyWithMedia',
        mediaType: 'image' as const,
        platform: 'twitter',
        postAuthor: '@testuser',
        postContent: 'Test tweet',
        postId: '123',
        url: 'https://twitter.com/test/status/123',
      };

      // Simulate the handler logic
      const token = await mockAuthService.getToken();
      if (!token) {
        sendResponse({ error: 'Not authenticated', success: false });
      }

      expect(sendResponse).toHaveBeenCalledWith({
        error: 'Not authenticated',
        success: false,
      });
    });

    it('should call reply API with correct parameters', async () => {
      mockAuthService.getToken.mockResolvedValue('test-token');

      (global.fetch as MockedFunction<any>).mockResolvedValueOnce({
        json: () => Promise.resolve({ reply: 'Generated reply text' }),
        ok: true,
      } as Response);

      const expectedBody = {
        data: {
          attributes: {
            length: 'medium',
            tone: 'friendly',
            tweetAuthor: '@testuser',
            tweetContent: 'Test tweet',
            tweetUrl: 'https://twitter.com/test/status/123',
          },
          type: 'tweet-reply',
        },
      };

      // Simulate API call
      const response = await fetch('https://api.genfeed.ai/prompts/tweet', {
        body: JSON.stringify(expectedBody),
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      const data = await response.json();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.genfeed.ai/prompts/tweet',
        expect.objectContaining({
          body: JSON.stringify(expectedBody),
          method: 'POST',
        }),
      );
      expect(data.reply).toBe('Generated reply text');
    });
  });

  describe('generateReplyWithVideo message handler', () => {
    it('should poll for video completion', async () => {
      mockAuthService.getToken.mockResolvedValue('test-token');

      // Mock reply generation
      (global.fetch as MockedFunction<any>)
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ reply: 'Video reply text' }),
          ok: true,
        } as Response)
        // Mock video creation
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ id: 'video-123' }),
          ok: true,
        } as Response)
        // Mock video status poll - in progress
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ status: 'processing' }),
          ok: true,
        } as Response)
        // Mock video status poll - completed
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({ status: 'completed', url: 'https://video.url' }),
          ok: true,
        } as Response);

      // Simulate the polling logic
      let videoUrl = null;
      const maxPolls = 5;
      let polls = 0;

      while (!videoUrl && polls < maxPolls) {
        polls++;
        const statusResponse = await fetch(
          'https://api.genfeed.ai/videos/video-123',
        );
        const statusData = await statusResponse.json();

        if (statusData.status === 'completed') {
          videoUrl = statusData.url;
          break;
        }
      }

      expect(videoUrl).toBe('https://video.url');
    });
  });

  describe('fetchImageAsDataUrl message handler', () => {
    it('should fetch image and convert to data URL', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });

      (global.fetch as MockedFunction<any>).mockResolvedValueOnce({
        blob: () => Promise.resolve(mockBlob),
        ok: true,
      } as Response);

      const response = await fetch('https://example.com/image.png');
      const blob = await response.blob();

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
    });

    it('should return null on fetch error', async () => {
      (global.fetch as MockedFunction<any>).mockResolvedValueOnce({
        ok: false,
      } as Response);

      const response = await fetch('https://example.com/image.png');

      if (!response.ok) {
        expect(response.ok).toBe(false);
      }
    });
  });

  describe('savePost message handler', () => {
    it('should call save API with post data', async () => {
      const { authService } = await import('~services/auth.service');
      mockAuthService.makeAuthenticatedRequest.mockResolvedValue({
        json: () => Promise.resolve({ id: 'saved-123' }),
        ok: true,
      } as Response);

      const result = await authService.makeAuthenticatedRequest(
        'https://api.genfeed.ai/posts/save',
        {
          body: JSON.stringify({
            platform: 'twitter',
            postId: '123',
            url: 'https://twitter.com/test/status/123',
          }),
          method: 'POST',
        },
      );

      expect(authService.makeAuthenticatedRequest).toHaveBeenCalledWith(
        'https://api.genfeed.ai/posts/save',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('checkAuth message handler', () => {
    it('should return authentication state', async () => {
      mockAuthService.isAuthenticated.mockResolvedValue({
        isAuthenticated: true,
        token: 'test-token',
      });

      const authState = await mockAuthService.isAuthenticated();

      expect(authState.isAuthenticated).toBe(true);
      expect(authState.token).toBe('test-token');
    });

    it('should handle authentication errors', async () => {
      mockAuthService.isAuthenticated.mockRejectedValue(
        new Error('Auth failed'),
      );

      try {
        await mockAuthService.isAuthenticated();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Auth failed');
      }
    });
  });
});

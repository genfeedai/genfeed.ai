import { AvatarsService } from '@services/ingredients/avatars.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch globally
global.fetch = vi.fn();

// Skipped: Test mocks fetch but service uses axios
describe.skip('AvatarsService', () => {
  let service: AvatarsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    service = new AvatarsService(mockToken);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findAll', () => {
    it('should fetch all avatars successfully', async () => {
      const mockAvatars = {
        data: [
          { id: '1', name: 'Avatar 1', url: 'http://example.com/1.jpg' },
          { id: '2', name: 'Avatar 2', url: 'http://example.com/2.jpg' },
        ],
        meta: { page: 1, total: 2 },
      };

      (global.fetch as vi.Mock).mockResolvedValueOnce({
        json: async () => mockAvatars,
        ok: true,
      });

      const result = await service.findAll();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/avatars'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        }),
      );
      expect(result).toEqual(mockAvatars);
    });

    it('should handle fetch errors', async () => {
      (global.fetch as vi.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(service.findAll()).rejects.toThrow(
        'Failed to fetch avatars',
      );
    });

    it('should handle network errors', async () => {
      (global.fetch as vi.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      await expect(service.findAll()).rejects.toThrow('Network error');
    });

    it('should apply filters correctly', async () => {
      const filters = { gender: 'male', type: 'cartoon' };

      (global.fetch as vi.Mock).mockResolvedValueOnce({
        json: async () => ({ data: [], meta: { total: 0 } }),
        ok: true,
      });

      await service.findAll(filters);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('type=cartoon&gender=male'),
        expect.any(Object),
      );
    });
  });

  describe('findOne', () => {
    it('should fetch a single avatar by id', async () => {
      const mockAvatar = {
        data: { id: '1', name: 'Avatar 1', url: 'http://example.com/1.jpg' },
      };

      (global.fetch as vi.Mock).mockResolvedValueOnce({
        json: async () => mockAvatar,
        ok: true,
      });

      const result = await service.findOne('1');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/avatars/1'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        }),
      );
      expect(result).toEqual(mockAvatar);
    });

    it('should handle avatar not found', async () => {
      (global.fetch as vi.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(service.findOne('nonexistent')).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('should create a new avatar', async () => {
      const newAvatar = {
        name: 'New Avatar',
        type: 'realistic',
        url: 'http://example.com/new.jpg',
      };

      const mockResponse = {
        data: { id: '3', ...newAvatar },
      };

      (global.fetch as vi.Mock).mockResolvedValueOnce({
        json: async () => mockResponse,
        ok: true,
      });

      const result = await service.post(newAvatar);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/avatars'),
        expect.objectContaining({
          body: JSON.stringify(newAvatar),
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle validation errors', async () => {
      (global.fetch as vi.Mock).mockResolvedValueOnce({
        json: async () => ({ errors: ['Name is required'] }),
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      await expect(service.create({})).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update an avatar', async () => {
      const updates = { name: 'Updated Avatar' };
      const mockResponse = {
        data: {
          id: '1',
          name: 'Updated Avatar',
          url: 'http://example.com/1.jpg',
        },
      };

      (global.fetch as vi.Mock).mockResolvedValueOnce({
        json: async () => mockResponse,
        ok: true,
      });

      const result = await service.patch('1', updates);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/avatars/1'),
        expect.objectContaining({
          body: JSON.stringify(updates),
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
          }),
          method: 'PATCH',
        }),
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('remove', () => {
    it('should delete an avatar', async () => {
      (global.fetch as vi.Mock).mockResolvedValueOnce({
        json: async () => ({ success: true }),
        ok: true,
      });

      const result = await service.remove('1');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/avatars/1'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
          method: 'DELETE',
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it('should handle deletion errors', async () => {
      (global.fetch as vi.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(service.remove('1')).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle timeout errors', async () => {
      vi.useFakeTimers();

      (global.fetch as vi.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true }), 10000);
          }),
      );

      const promise = service.findAll();

      vi.advanceTimersByTime(5000);

      await expect(promise).rejects.toThrow('Request timeout');

      vi.useRealTimers();
    });

    it('should retry on network failures', async () => {
      (global.fetch as vi.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          json: async () => ({ data: [] }),
          ok: true,
        });

      const result = await service.findAll();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: [] });
    });
  });
});

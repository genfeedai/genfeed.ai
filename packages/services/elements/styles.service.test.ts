import { ElementStyle } from '@models/elements/style.model';
import { StylesService } from '@services/elements/styles.service';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('axios');
vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.test.com',
  },
}));

vi.mock('@genfeedai/constants', () => ({
  API_ENDPOINTS: {
    STYLES: '/styles',
  },
}));

vi.mock('@genfeedai/serializers', () => ({
  StyleSerializer: {
    serialize: (data: Record<string, unknown>) => ({
      data: {
        attributes: data,
        type: 'style',
      },
    }),
  },
}));

describe('StylesService', () => {
  const mockToken = 'test-token-123';
  let service: StylesService;
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    interceptors: {
      request: { use: ReturnType<typeof vi.fn> };
      response: { use: ReturnType<typeof vi.fn> };
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock axios instance
    mockAxiosInstance = {
      delete: vi.fn(),
      get: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      patch: vi.fn(),
      post: vi.fn(),
    };

    vi.mocked(axios.create).mockReturnValue(
      mockAxiosInstance as unknown as ReturnType<typeof axios.create>,
    );

    service = new StylesService(mockToken);
  });

  describe('findAll', () => {
    it('fetches all styles', async () => {
      const mockStyles = [
        {
          description: 'Cinematic style',
          id: '1',
          key: 'cinematic',
          label: 'Cinematic',
        },
        {
          description: 'Documentary style',
          id: '2',
          key: 'documentary',
          label: 'Documentary',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: mockStyles,
        },
      });

      const result = await service.findAll();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('', { params: {} });
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(ElementStyle);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });

    it('returns empty array when no styles exist', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: [],
        },
      });

      const result = await service.findAll();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('', { params: {} });
      expect(result).toEqual([]);
    });

    it('handles API errors gracefully', async () => {
      const error = {
        response: {
          data: { message: 'Internal server error' },
          status: 500,
        },
      };

      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(service.findAll()).rejects.toThrow();
    });
  });

  describe('findOne', () => {
    it('fetches style by id', async () => {
      // Response needs JSON API format with type and attributes
      const mockStyle = {
        attributes: {
          description: 'Cinematic style',
          key: 'cinematic',
          label: 'Cinematic',
        },
        id: '123',
        type: 'styles',
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: mockStyle,
        },
      });

      const result = await service.findOne('123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/123', {
        params: {},
      });
      expect(result).toBeInstanceOf(ElementStyle);
      expect(result.id).toBe('123');
      expect(result.label).toBe('Cinematic');
    });

    it('returns error when style not found', async () => {
      const error = {
        response: {
          data: { message: 'Style not found' },
          status: 404,
        },
      };

      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(service.findOne('999')).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('creates new style', async () => {
      const newStyle = {
        description: 'A new style',
        key: 'new-style',
        label: 'New Style',
      };

      const responseData = {
        attributes: newStyle,
        id: '123',
        type: 'styles',
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: {
          data: responseData,
        },
      });

      const result = await service.post(newStyle);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '',
        expect.objectContaining({
          description: 'A new style',
          key: 'new-style',
          label: 'New Style',
        }),
      );
      expect(result).toBeInstanceOf(ElementStyle);
      expect(result.id).toBe('123');
      expect(result.label).toBe('New Style');
    });

    it('validates style data before creation', async () => {
      const invalidStyle = {
        key: '',
        label: '',
      };

      const error = {
        response: {
          data: {
            errors: {
              key: ['Key is required'],
              label: ['Label is required'],
            },
            message: 'Validation failed',
          },
          status: 400,
        },
      };

      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(service.post(invalidStyle)).rejects.toThrow();
    });

    it('handles duplicate style names', async () => {
      const duplicateStyle = {
        key: 'existing-style',
        label: 'Existing Style',
      };

      const error = {
        response: {
          data: { message: 'Style with this key already exists' },
          status: 409,
        },
      };

      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(service.post(duplicateStyle)).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('updates existing style', async () => {
      const updateData = {
        description: 'Updated description',
        label: 'Updated Style',
      };

      const responseData = {
        attributes: {
          ...updateData,
          key: 'existing-style',
        },
        id: '123',
        type: 'styles',
      };

      mockAxiosInstance.patch.mockResolvedValue({
        data: {
          data: responseData,
        },
      });

      const result = await service.patch('123', updateData);

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/123',
        expect.objectContaining({
          description: 'Updated description',
          label: 'Updated Style',
        }),
      );
      expect(result).toBeInstanceOf(ElementStyle);
      expect(result.id).toBe('123');
      expect(result.label).toBe('Updated Style');
    });

    it('returns error when style not found', async () => {
      const updateData = {
        label: 'Updated Style',
      };

      const error = {
        response: {
          data: { message: 'Style not found' },
          status: 404,
        },
      };

      mockAxiosInstance.patch.mockRejectedValue(error);

      await expect(service.patch('999', updateData)).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('deletes style by id', async () => {
      const responseData = {
        attributes: {
          label: 'Deleted Style',
        },
        id: '123',
        type: 'styles',
      };

      mockAxiosInstance.delete.mockResolvedValue({
        data: {
          data: responseData,
        },
      });

      const result = await service.delete('123');

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/123');
      expect(result).toBeInstanceOf(ElementStyle);
      expect(result.id).toBe('123');
    });

    it('handles deletion of non-existent style', async () => {
      const error = {
        response: {
          data: { message: 'Style not found' },
          status: 404,
        },
      };

      mockAxiosInstance.delete.mockRejectedValue(error);

      await expect(service.delete('999')).rejects.toThrow();
    });
  });
});

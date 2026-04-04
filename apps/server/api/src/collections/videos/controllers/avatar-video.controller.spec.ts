vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    brand: '507f1f77bcf86cd799439015',
    organization: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439013',
  })),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { AvatarVideoController } from '@api/collections/videos/controllers/avatar-video.controller';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('AvatarVideoController', () => {
  let controller: AvatarVideoController;

  const mockRequest = {} as never;
  const mockUser = { id: 'user-123' } as never;
  const mockAvatarVideoGenerationService = {
    generateAvatarVideo: vi.fn(),
  };
  const mockVideosService = {
    findOne: vi.fn(),
  };

  beforeEach(() => {
    controller = new AvatarVideoController(
      mockAvatarVideoGenerationService as unknown as AvatarVideoGenerationService,
      mockVideosService as unknown as VideosService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createAvatarVideo', () => {
    it('delegates avatar generation and returns the created ingredient', async () => {
      mockAvatarVideoGenerationService.generateAvatarVideo.mockResolvedValue({
        externalId: 'heygen-task-123',
        ingredientId: 'ingredient-123',
        status: 'processing',
      });
      mockVideosService.findOne.mockResolvedValue({ _id: 'ingredient-123' });

      const result = await controller.createAvatarVideo(mockRequest, mockUser, {
        audioUrl: 'https://example.com/audio.mp3',
        photoUrl: 'https://example.com/photo.jpg',
        text: 'Hello world',
      });

      expect(
        mockAvatarVideoGenerationService.generateAvatarVideo,
      ).toHaveBeenCalled();
      expect(mockVideosService.findOne).toHaveBeenCalledWith({
        _id: 'ingredient-123',
        isDeleted: false,
        organization: '507f1f77bcf86cd799439011',
      });
      expect(result).toEqual({ _id: 'ingredient-123' });
    });

    it('throws when the ingredient cannot be reloaded for serialization', async () => {
      mockAvatarVideoGenerationService.generateAvatarVideo.mockResolvedValue({
        externalId: 'heygen-task-123',
        ingredientId: 'ingredient-123',
        status: 'processing',
      });
      mockVideosService.findOne.mockResolvedValue(null);

      await expect(
        controller.createAvatarVideo(mockRequest, mockUser, {
          audioUrl: 'https://example.com/audio.mp3',
          photoUrl: 'https://example.com/photo.jpg',
          text: 'Hello world',
        }),
      ).rejects.toThrow(HttpException);

      try {
        await controller.createAvatarVideo(mockRequest, mockUser, {
          audioUrl: 'https://example.com/audio.mp3',
          photoUrl: 'https://example.com/photo.jpg',
          text: 'Hello world',
        });
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    });
  });
});

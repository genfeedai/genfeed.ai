import { Video } from '~models/video.model';
import { BaseService } from '~services/base.service';

export class VideosService extends BaseService<Video> {
  constructor(token: string) {
    super('/videos', token, Video);
  }

  /**
   * Get latest videos for the extension
   * Used by the Chrome extension to fetch recent video content
   */
  getLatest(limit: number = 10): Promise<Video[]> {
    return this.findAll({ limit, sort: 'createdAt:desc' });
  }

  /**
   * Get a specific video by ID
   */
  getById(id: string): Promise<Video> {
    return this.findOne(id);
  }

  /**
   * Get videos with pagination
   */
  getAll(
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
    } = {},
  ): Promise<Video[]> {
    return this.findAll(params);
  }
}

import { Image } from '~models/image.model';
import { BaseService } from '~services/base.service';

export class ImagesService extends BaseService<Image> {
  constructor(token: string) {
    super('/images', token, Image);
  }

  /**
   * Get latest images for the extension
   * Used by the Chrome extension to fetch recent image content
   */
  getLatest(limit: number = 10): Promise<Image[]> {
    return this.findAll({ limit, sort: 'createdAt:desc' });
  }

  /**
   * Get a specific image by ID
   */
  getById(id: string): Promise<Image> {
    return this.findOne(id);
  }

  /**
   * Get images with pagination
   */
  getAll(
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
    } = {},
  ): Promise<Image[]> {
    return this.findAll(params);
  }
}

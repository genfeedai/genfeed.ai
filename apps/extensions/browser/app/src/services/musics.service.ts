import { Music } from '~models/music.model';
import { BaseService } from '~services/base.service';

export class MusicsService extends BaseService<Music> {
  constructor(token: string) {
    super('/musics', token, Music);
  }

  /**
   * Get latest musics for the extension
   * Used by the Chrome extension to fetch recent music content
   */
  getLatest(limit: number = 10): Promise<Music[]> {
    return this.findAll({ limit, sort: 'createdAt:desc' });
  }

  /**
   * Get a specific music by ID
   */
  getById(id: string): Promise<Music> {
    return this.findOne(id);
  }

  /**
   * Get musics with pagination
   */
  getAll(
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
    } = {},
  ): Promise<Music[]> {
    return this.findAll(params);
  }
}

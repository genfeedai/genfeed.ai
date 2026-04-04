import type { IQueryParams, ITag } from '@cloud/interfaces';
import { TagSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import type { TagCategory } from '@genfeedai/enums';
import { Tag } from '@models/content/tag.model';
import { BaseService } from '@services/core/base.service';
import { logger } from '@services/core/logger.service';

export class TagsService extends BaseService<Tag> {
  constructor(token: string) {
    super(API_ENDPOINTS.TAGS, token, Tag, TagSerializer);
  }

  public static getInstance(token: string): TagsService {
    return BaseService.getDataServiceInstance(
      TagsService,
      token,
    ) as TagsService;
  }

  /**
   * Get tags for a specific category
   */
  async getTagsForCategory(category: TagCategory): Promise<Tag[]> {
    const url = `GET /tags?category=${category}`;
    try {
      return await this.instance
        .get('', { params: { category } })
        .then((res) => res.data as ITag[])
        .then((data) => {
          const tags = data.map((tag: ITag) => new Tag(tag));
          logger.info(`${url} success`, tags);
          return tags;
        });
    } catch (error) {
      logger.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Add a tag to an entity
   */
  async addTagToEntity(
    category: TagCategory,
    _entityId: string,
    label: string,
  ): Promise<Tag> {
    const url = 'POST /tags';
    try {
      // Serialize the data before sending - note: no entity field sent to backend
      const data = TagSerializer.serialize({
        category,
        label,
      });

      return await this.instance
        .post('', data)
        .then((res) => res.data)
        .then((data) => {
          const tag = new Tag(data);
          logger.info(`${url} success`, tag);
          return tag;
        });
    } catch (error) {
      logger.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Remove a tag from an entity
   */
  async removeTag(tagId: string): Promise<void> {
    const url = `DELETE /tags/${tagId}`;
    try {
      await this.instance.delete(tagId);
      logger.info(`${url} success`);
    } catch (error) {
      logger.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Update a tag label
   */
  async updateTag(tagId: string, label: string): Promise<Tag> {
    const url = `PATCH /tags/${tagId}`;
    try {
      // Serialize the data before sending
      const serializedData = TagSerializer.serialize({ label });
      return await this.instance
        .patch(tagId, serializedData)
        .then((res) => res.data)
        .then((data) => {
          const tag = new Tag(data);
          logger.info(`${url} success`, tag);
          return tag;
        });
    } catch (error) {
      logger.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Search tags by label
   */
  async searchTags(label: string, category?: TagCategory): Promise<Tag[]> {
    const url = 'GET /tags';
    try {
      const params: IQueryParams = { label };
      if (category) {
        params.category = category;
      }

      return await this.instance
        .get('', { params })
        .then((res) => res.data)
        .then((data) => {
          const dataArray = Array.isArray(data) ? data : [];
          const tags = dataArray.map((tag: ITag) => new Tag(tag));
          logger.info(`${url} success`, tags);
          return tags;
        });
    } catch (error) {
      logger.error(`${url} failed`, error);
      throw error;
    }
  }
}

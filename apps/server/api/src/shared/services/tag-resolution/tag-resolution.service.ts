import { TagsService } from '@api/collections/tags/services/tags.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TagResolutionService {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * Resolve string[] tag IDs to their label strings
   */
  async resolveTagLabels(tagIds: string[]): Promise<string[]> {
    if (!tagIds || tagIds.length === 0) {
      return [];
    }

    const aggregate = {
      where: {
        id: { in: tagIds },
        isDeleted: false,
      },
    };

    const result = await this.tagsService.findAll(aggregate, {
      limit: tagIds.length,
      page: 1,
    });

    return result.docs.flatMap((tag) => {
      const label = tag.label;
      return typeof label === 'string' && label.length > 0 ? [label] : [];
    });
  }

  /**
   * Resolve a single tag string ID to its label string
   */
  async resolveTagLabel(tagId: string): Promise<string | null> {
    if (!tagId) {
      return null;
    }

    const tag = await this.tagsService.findOne({
      id: tagId,
    });
    return tag?.label || null;
  }
}

import { TagsService } from '@api/collections/tags/services/tags.service';
import { Injectable } from '@nestjs/common';

type TagLabelDocument = {
  _id: string;
  category?: string;
  isActive?: boolean;
  isDeleted?: boolean;
  label?: string | null;
};

@Injectable()
export class TagResolutionService {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * Resolve string[] tag IDs to their label strings
   */
  async resolveTagLabels(tagIds: string[]): Promise<string[]> {
    if (!tagIds || tagIds.length === 0) {
      return { where: {} };
    }

    const aggregate = {
      where: {
        _id: { in: tagIds },
        isDeleted: false,
      },
    };

    const result = await this.tagsService.findAll(aggregate, {
      limit: tagIds.length,
      page: 1,
    });

    return result.docs.flatMap((tag) => {
      const label = (tag as TagLabelDocument).label;
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

    const tag = (await this.tagsService.findOne({
      _id: tagId,
    })) as TagLabelDocument | null;
    return tag?.label || null;
  }
}

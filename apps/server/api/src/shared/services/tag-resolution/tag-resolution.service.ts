import { TagsService } from '@api/collections/tags/services/tags.service';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

type TagLabelDocument = {
  _id: Types.ObjectId;
  category?: string;
  isActive?: boolean;
  isDeleted?: boolean;
  label?: string | null;
};

@Injectable()
export class TagResolutionService {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * Resolve ObjectId[] tags to their label strings
   */
  async resolveTagLabels(tagIds: Types.ObjectId[]): Promise<string[]> {
    if (!tagIds || tagIds.length === 0) {
      return [];
    }

    const aggregate = [
      {
        $match: {
          _id: { $in: tagIds },
          isDeleted: false,
        },
      },
      {
        $project: {
          label: 1,
        },
      },
    ];

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
   * Resolve a single tag ObjectId to its label string
   */
  async resolveTagLabel(tagId: Types.ObjectId): Promise<string | null> {
    if (!tagId) {
      return null;
    }

    const tag = (await this.tagsService.findOne({
      _id: tagId,
    })) as TagLabelDocument | null;
    return tag?.label || null;
  }
}

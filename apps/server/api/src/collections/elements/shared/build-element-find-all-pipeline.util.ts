import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';

interface ElementMetadata {
  organization?: string;
  user?: string;
}

interface BuildElementFindAllPipelineOptions {
  adminFilter?: Record<string, unknown>;
  defaultSort?: Record<string, 1 | -1>;
  includeStateFilters?: boolean;
  metadata: ElementMetadata;
  query: BaseQueryDto;
  searchableFields?: string[];
}

export function buildElementFindAllPipeline({
  adminFilter,
  defaultSort = { createdAt: -1, label: 1 },
  includeStateFilters = false,
  metadata,
  query,
  searchableFields = [],
}: BuildElementFindAllPipelineOptions): Record<string, unknown>[] {
  const queryAny = query as unknown as Record<string, unknown>;
  const orConditions: Record<string, unknown>[] = [
    { organization: { $exists: false }, user: { $exists: false } },
  ];

  if (metadata.organization) {
    orConditions.push({
      organization: metadata.organization,
    });
  }

  if (metadata.user) {
    orConditions.push({ user: metadata.user });
  }

  const builder = PipelineBuilder.create().match({
    isDeleted: query.isDeleted ?? false,
    ...(includeStateFilters &&
      typeof queryAny.isActive === 'boolean' && {
        isActive: queryAny.isActive,
      }),
    ...(includeStateFilters &&
      typeof queryAny.isDefault === 'boolean' && {
        isDefault: queryAny.isDefault,
      }),
    ...(adminFilter ?? { $or: orConditions }),
  });

  if (searchableFields.length > 0 && typeof queryAny.search === 'string') {
    builder.match({
      $or: searchableFields.map((field) => ({
        [field]: { $options: 'i', $regex: queryAny.search },
      })),
    });
  }

  builder.sort(query.sort ? handleQuerySort(query.sort) : defaultSort);
  return builder.build();
}

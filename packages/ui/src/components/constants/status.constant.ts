import { ArticleStatus, IngredientStatus, PostStatus } from '@genfeedai/enums';

export interface StatusMeta {
  label: string;
  variant: string;
}

export const STATUS_METADATA = new Map<
  IngredientStatus | ArticleStatus | PostStatus,
  StatusMeta
>([
  [
    IngredientStatus.DRAFT,
    {
      label: 'Draft',
      variant: 'ghost',
    },
  ],
  [
    IngredientStatus.PROCESSING,
    {
      label: 'Processing',
      variant: 'info',
    },
  ],
  [
    IngredientStatus.UPLOADED,
    {
      label: 'Uploaded',
      variant: 'ghost',
    },
  ],
  [
    IngredientStatus.GENERATED,
    {
      label: 'Completed',
      variant: 'success',
    },
  ],
  [
    IngredientStatus.VALIDATED,
    {
      label: 'Validated',
      variant: 'success',
    },
  ],
  [
    IngredientStatus.FAILED,
    {
      label: 'Failed',
      variant: 'destructive',
    },
  ],
  [
    IngredientStatus.ARCHIVED,
    {
      label: 'Archived',
      variant: 'warning',
    },
  ],
  [
    IngredientStatus.REJECTED,
    {
      label: 'Rejected',
      variant: 'destructive',
    },
  ],
  [
    ArticleStatus.DRAFT,
    {
      label: 'Draft',
      variant: 'ghost',
    },
  ],
  [
    ArticleStatus.PUBLIC,
    {
      label: 'Published',
      variant: 'success',
    },
  ],
  [
    ArticleStatus.ARCHIVED,
    {
      label: 'Archived',
      variant: 'warning',
    },
  ],
  [
    PostStatus.DRAFT,
    {
      label: 'Draft',
      variant: 'ghost',
    },
  ],
  [
    PostStatus.SCHEDULED,
    {
      label: 'Scheduled',
      variant: 'info',
    },
  ],
  [
    PostStatus.PUBLIC,
    {
      label: 'Public',
      variant: 'success',
    },
  ],
  [
    PostStatus.PRIVATE,
    {
      label: 'Private',
      variant: 'ghost',
    },
  ],
  [
    PostStatus.UNLISTED,
    {
      label: 'Unlisted',
      variant: 'ghost',
    },
  ],
  [
    PostStatus.PROCESSING,
    {
      label: 'Processing',
      variant: 'info',
    },
  ],
  [
    PostStatus.FAILED,
    {
      label: 'Failed',
      variant: 'destructive',
    },
  ],
]);

const DEFAULT_STATUS_META: StatusMeta = { label: '', variant: 'ghost' };

export function getStatusMeta(
  status: IngredientStatus | ArticleStatus | PostStatus,
): StatusMeta {
  return (
    STATUS_METADATA.get(status) ?? { ...DEFAULT_STATUS_META, label: status }
  );
}

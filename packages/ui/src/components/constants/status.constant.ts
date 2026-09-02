import {
  ArticleStatus,
  IngredientStatus,
  PostStatus,
  StatusDomain,
} from '@genfeedai/contracts';

export interface StatusMeta {
  label: string;
  variant: string;
}

/**
 * Status metadata is keyed **per domain**, never in one shared string keyspace.
 *
 * `IngredientStatus.DRAFT`, `ArticleStatus.DRAFT` — and previously
 * `ArticleStatus.PUBLISHED` against `PostStatus.PUBLIC` — are distinct
 * vocabularies that collide on their raw string values. A single Map keyed on
 * the bare status silently kept whichever entry was declared last, so an
 * article could render a post's label with no type error and no test failure.
 *
 * Splitting per domain makes each vocabulary its own keyspace: two domains may
 * now diverge freely on label or variant without overwriting each other.
 *
 * @see https://github.com/genfeedai/genfeed.ai/pull/2485#discussion_r3737427689
 */
export const INGREDIENT_STATUS_METADATA = new Map<IngredientStatus, StatusMeta>(
  [
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
  ],
);

export const ARTICLE_STATUS_METADATA = new Map<ArticleStatus, StatusMeta>([
  [
    ArticleStatus.DRAFT,
    {
      label: 'Draft',
      variant: 'ghost',
    },
  ],
  [
    ArticleStatus.PUBLISHED,
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
]);

export const POST_STATUS_METADATA = new Map<PostStatus, StatusMeta>([
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
    // Deferred provider-side verification (e.g. TikTok) — distinct from a
    // draft: the post has been handed off and is awaiting the platform.
    PostStatus.PENDING,
    {
      label: 'Verifying',
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

const STATUS_METADATA_BY_DOMAIN: Record<
  StatusDomain,
  ReadonlyMap<string, StatusMeta>
> = {
  [StatusDomain.ARTICLE]: ARTICLE_STATUS_METADATA,
  [StatusDomain.INGREDIENT]: INGREDIENT_STATUS_METADATA,
  [StatusDomain.POST]: POST_STATUS_METADATA,
};

const DEFAULT_STATUS_META: StatusMeta = { label: '', variant: 'ghost' };

/**
 * Resolve the badge label and variant for a status **within its own domain**.
 *
 * `domain` is required on purpose: without it the lookup cannot tell
 * `ArticleStatus.DRAFT` from `IngredientStatus.DRAFT`, which is exactly the
 * cross-domain collision this module exists to prevent.
 */
export function getStatusMeta(
  status: IngredientStatus | ArticleStatus | PostStatus,
  domain: StatusDomain,
): StatusMeta {
  return (
    STATUS_METADATA_BY_DOMAIN[domain].get(status) ?? {
      ...DEFAULT_STATUS_META,
      label: status,
    }
  );
}

import type { IPost } from '@genfeedai/contracts/interfaces';
import type { RecordFact } from '@genfeedai/props/ui/record-detail/record-fact-line.props';
import { getPostsPlatformLabel } from '@helpers/content/posts.helper';

function formatPostStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

/**
 * The post's own known facts for the record detail fact line (#5483). Empty
 * fields are left `undefined` — `RecordFactLine` omits them rather than
 * showing a placeholder.
 */
export function buildPostDetailFacts(
  post: IPost,
  isPublished: boolean,
): RecordFact[] {
  const scheduledOrPublishedAt = isPublished
    ? post.publicationDate
    : post.scheduledDate;

  return [
    {
      id: 'platform',
      label: 'Platform',
      value: post.platform ? getPostsPlatformLabel(post.platform) : undefined,
    },
    {
      id: 'status',
      label: 'Status',
      value: post.status ? formatPostStatus(post.status) : undefined,
    },
    {
      id: 'when',
      label: isPublished ? 'Published' : 'Scheduled',
      value: scheduledOrPublishedAt
        ? new Date(scheduledOrPublishedAt).toLocaleString('en-US', {
            timeZone: 'UTC',
          })
        : undefined,
    },
    {
      id: 'category',
      label: 'Category',
      value: post.category,
    },
    {
      id: 'seoScore',
      label: 'SEO score',
      value: typeof post.seoScore === 'number' ? post.seoScore : undefined,
    },
    {
      id: 'views',
      label: 'Views',
      value:
        isPublished && typeof post.totalViews === 'number'
          ? post.totalViews
          : undefined,
    },
  ];
}

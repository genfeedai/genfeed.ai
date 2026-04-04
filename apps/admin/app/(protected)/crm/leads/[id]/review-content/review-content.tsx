'use client';

import type { ICrmLead, IPost } from '@genfeedai/interfaces';
import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { BadgeProps } from '@props/ui/display/badge.props';
import { AdminCrmService } from '@services/admin/crm.service';
import { logger } from '@services/core/logger.service';
import Badge from '@ui/display/badge/Badge';
import Container from '@ui/layout/container/Container';
import AppLink from '@ui/navigation/link/Link';
import { HiArrowLeft } from 'react-icons/hi2';

const STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  failed: 'error',
  published: 'validated',
  queued: 'info',
  scheduled: 'warning',
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function ReviewContent({ id }: { id: string }) {
  const getCrmService = useAuthedService((token: string) =>
    AdminCrmService.getInstance(token),
  );

  const { data: lead, isLoading: isLoadingLead } = useResource<ICrmLead>(
    async () => {
      const service = await getCrmService();
      return service.getLead(id);
    },
    {
      dependencies: [id],
      onError: (error: Error) => {
        logger.error(`GET /admin/crm/leads/${id} failed`, error);
      },
    },
  );

  const { data: posts, isLoading: isLoadingPosts } = useResource<IPost[]>(
    async () => {
      const service = await getCrmService();
      const response = await service.reviewContent(id);
      return response.posts as IPost[];
    },
    {
      defaultValue: [],
      dependencies: [id],
      onError: (error: Error) => {
        logger.error(`GET /admin/crm/leads/${id}/review-content failed`, error);
      },
    },
  );

  const isLoading = isLoadingLead || isLoadingPosts;

  if (isLoading) {
    return (
      <Container label="Review Content">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-white/5 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="h-48 bg-white/5 rounded-lg"
              />
            ))}
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container
      label={lead ? `Review Content - ${lead.name}` : 'Review Content'}
      description="Generated posts for proactive onboarding review"
    >
      <div className="mb-4">
        <AppLink
          url={`/crm/leads/${id}`}
          label={
            <>
              <HiArrowLeft className="w-4 h-4" /> Back to Lead
            </>
          }
          variant={ButtonVariant.SECONDARY}
        />
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-foreground/40 text-sm">
            No content has been generated yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="rounded-lg border border-white/[0.08] bg-white/[0.05] p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                {post.platform && (
                  <Badge variant="ghost">{post.platform}</Badge>
                )}
                <Badge
                  variant={
                    (STATUS_COLORS[post.status] ??
                      'default') as BadgeProps['variant']
                  }
                >
                  {post.status}
                </Badge>
              </div>

              <p className="text-sm text-foreground/60 line-clamp-4">
                {post.description || post.label || 'No caption'}
              </p>

              <div className="flex flex-col gap-1 text-xs text-foreground/40">
                {post.scheduledDate && (
                  <span>Scheduled: {formatDate(post.scheduledDate)}</span>
                )}
                {post.createdAt && (
                  <span>Created: {formatDate(post.createdAt)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Container>
  );
}

import {
  normalizeReviewDecision,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { AgentDetailPageProps } from '@props/automation/agent-strategy.props';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAgentDetailPosts } from './use-agent-detail-posts';

export default function AgentWorkSection({ agentId }: AgentDetailPageProps) {
  const { href } = useOrgUrl();
  const detail = useTranslations('common.automation.agentDetail');
  const { posts, isLoading, isError } = useAgentDetailPosts(agentId);

  return (
    <section aria-label={detail('contentLabel')} className="space-y-3">
      <h2 className="text-lg font-semibold">{detail('contentTitle')}</h2>
      {isLoading ? (
        <p role="status">{detail('loadingContent')}</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {detail('contentError')}
        </p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {detail('emptyContent')}
        </p>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => {
            const isPending =
              post.targetExecutionState === TargetExecutionState.DRAFT &&
              normalizeReviewDecision(post.reviewDecision) !==
                ReviewDecision.APPROVED;
            return (
              <article
                key={post.id}
                className="space-y-2 rounded border border-border p-4"
              >
                <Link
                  className="font-medium hover:underline"
                  href={href(`${APP_ROUTES.PUBLISHING.POSTS}/${post.id}`)}
                >
                  {post.label || post.description || detail('untitledPost')}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {detail(isPending ? 'postMetaPending' : 'postMeta', {
                    platform: post.platform || detail('platformNotSet'),
                    state: post.targetExecutionState || post.status,
                  })}
                </p>
                <div className="flex flex-wrap gap-3 text-sm">
                  {isPending && (
                    <Link
                      className="underline"
                      href={href(APP_ROUTES.PUBLISHING.REVIEW)}
                    >
                      {detail('reviewContent')}
                    </Link>
                  )}
                  {post.workflowExecutionId ? (
                    <Link
                      className="underline"
                      href={href(
                        `${APP_ROUTES.AUTOMATION.RUNS}/${post.workflowExecutionId}`,
                      )}
                    >
                      {detail('execution', { id: post.workflowExecutionId })}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">
                      {detail('executionUnavailable')}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
          <p className="text-xs text-muted-foreground">
            {detail('latestPosts', { count: posts.length })}
          </p>
        </div>
      )}
    </section>
  );
}

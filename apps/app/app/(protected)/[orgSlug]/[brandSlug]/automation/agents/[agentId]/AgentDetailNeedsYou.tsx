'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  AgentDetailNeedsYouItem,
  AgentDetailNeedsYouProps,
} from '@props/automation/agent-detail-needs-you.props';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useMemo } from 'react';

/**
 * The agent's own open work: consecutive run failures and content it
 * generated that is still waiting on review. Reuses data the page already
 * fetches — no new query (#5483 non-goal).
 */
export default function AgentDetailNeedsYou({
  title,
  failureCount,
  failuresDescription,
  viewRunsLabel,
  runsHref,
  pendingReviewCount,
  pendingReviewDescription,
  reviewLabel,
  reviewHref,
  className,
}: AgentDetailNeedsYouProps) {
  const items = useMemo<AgentDetailNeedsYouItem[]>(() => {
    const results: AgentDetailNeedsYouItem[] = [];
    if (failureCount > 0) {
      results.push({
        actionLabel: viewRunsLabel,
        description: failuresDescription,
        href: runsHref,
        id: 'failures',
      });
    }
    if (pendingReviewCount > 0) {
      results.push({
        actionLabel: reviewLabel,
        description: pendingReviewDescription,
        href: reviewHref,
        id: 'pending-review',
      });
    }
    return results;
  }, [
    failureCount,
    failuresDescription,
    pendingReviewCount,
    pendingReviewDescription,
    reviewHref,
    reviewLabel,
    runsHref,
    viewRunsLabel,
  ]);

  return (
    <CollectionSection
      className={className}
      itemCount={items.length}
      title={title}
    >
      <CollectionList>
        {items.map((item) => (
          <ListRow
            key={item.id}
            title={item.description}
            trailing={
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                <Link href={item.href}>{item.actionLabel}</Link>
              </Button>
            }
          />
        ))}
      </CollectionList>
    </CollectionSection>
  );
}

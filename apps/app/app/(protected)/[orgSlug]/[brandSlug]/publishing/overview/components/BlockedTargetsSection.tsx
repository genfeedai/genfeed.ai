'use client';

import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { PublishingOverviewBlockedSectionProps } from '@props/publisher/publishing-overview.props';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function BlockedTargetsSection({
  groups,
}: PublishingOverviewBlockedSectionProps) {
  const translate = useTranslations('pages.publishing.overview');
  const { href } = useOrgUrl();

  return (
    <Card
      bodyClassName="flex flex-col gap-4 p-5"
      data-testid="publishing-overview-blocked"
      description={translate('blockedDescription')}
      label={translate('blockedTitle')}
    >
      {groups.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li
              key={group.code}
              className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">{group.code}</Badge>
                  <span className="text-sm font-medium">
                    {translate('blockedCount', { count: group.count })}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {group.accounts.join(', ')}
                </p>
              </div>
              <Button asChild className="shrink-0" withWrapper={false}>
                <Link href={href(group.href)}>
                  {translate('blockedViewAction')}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate('blockedEmpty')}
        </p>
      )}
    </Card>
  );
}

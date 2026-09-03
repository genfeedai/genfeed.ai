'use client';

import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { PublishingOverviewBlockedSectionProps } from '@props/publisher/publishing-overview.props';
import Card from '@ui/card/Card';
import { ListRow } from '@ui/lists/list-row/ListRow';
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
        <div>
          {groups.map((group) => (
            <ListRow
              key={group.code}
              density="compact"
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">{group.code}</Badge>
                  <span>
                    {translate('blockedCount', { count: group.count })}
                  </span>
                </span>
              }
              description={group.accounts.join(', ')}
              trailing={
                <Button asChild className="shrink-0" withWrapper={false}>
                  <Link href={href(group.href)}>
                    {translate('blockedViewAction')}
                  </Link>
                </Button>
              }
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate('blockedEmpty')}
        </p>
      )}
    </Card>
  );
}

'use client';

import { CardVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** The way into recording a digital twin, shown above the avatar list. */
export default function AvatarTwinEntry() {
  const translate = useTranslations('pages.library.avatarTwin.entry');
  const { href } = useOrgUrl();

  return (
    <Card
      bodyClassName="flex-row flex-wrap items-center"
      className="mb-4"
      variant={CardVariant.BORDERED}
    >
      <UserRound aria-hidden="true" className="size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-medium text-sm">{translate('title')}</p>
        <p className="text-muted-foreground text-sm">{translate('body')}</p>
      </div>
      <Button asChild withWrapper={false}>
        <Link href={href(APP_ROUTES.LIBRARY.AVATAR_TWIN)}>
          {translate('action')}
        </Link>
      </Button>
    </Card>
  );
}

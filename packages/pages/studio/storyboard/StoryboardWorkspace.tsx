'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StoryboardCreate from '@pages/studio/storyboard/components/StoryboardCreate';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** New runs start with a persisted brief or owned video, independently of paid execution. */
export default function StoryboardWorkspace() {
  const translate = useTranslations('pages.studioStoryboard');
  const { href } = useOrgUrl();
  return (
    <Container
      label={translate('workspace.newTitle')}
      description={translate('workspace.newDescription')}
      right={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant={ButtonVariant.SECONDARY}>
            <Link href={href(APP_ROUTES.DISCOVERY.OVERVIEW)}>
              {translate('workspace.browseDiscovery')}
            </Link>
          </Button>
          <Button asChild variant={ButtonVariant.SECONDARY}>
            <Link href={href(APP_ROUTES.STUDIO.STORYBOARD)}>
              {translate('runs.all')}
            </Link>
          </Button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <StoryboardCreate />
      </div>
    </Container>
  );
}

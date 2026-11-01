'use client';

import { useAgentOutputHost } from '@contexts/ui/agent-output-host-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import StoryboardCreate from '@/features/studio/storyboard/components/StoryboardCreate';

/** New runs start with a persisted brief or owned video, independently of paid execution. */
export default function StoryboardWorkspace() {
  const translate = useTranslations('pages.studioStoryboard');
  const { href } = useOrgUrl();
  const hasAgentColumn = Boolean(useAgentOutputHost());
  const actions = (
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
  );
  const label = translate('workspace.newTitle');
  // On the agent layout the form is the chat and the page chrome frames the result.
  if (hasAgentColumn) {
    return <StoryboardCreate actions={actions} label={label} />;
  }
  return (
    <Container label={label} right={actions}>
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <StoryboardCreate />
      </div>
    </Container>
  );
}

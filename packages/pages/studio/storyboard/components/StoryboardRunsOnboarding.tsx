'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StoryboardPresetGrid from '@pages/studio/storyboard/components/StoryboardPresetGrid';
import StoryboardShotStrip from '@pages/studio/storyboard/components/StoryboardShotStrip';
import { STORYBOARD_PRESETS } from '@pages/studio/storyboard/data/storyboard-presets';
import Card from '@ui/card/Card';
import CollectionSection from '@ui/collection/CollectionSection';
import { Button } from '@ui/primitives/button';
import { Clapperboard, PenLine } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/** First-run Storyboard landing: show what is possible and one-click starts. */
export default function StoryboardRunsOnboarding(): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.onboarding');
  const { href } = useOrgUrl();
  const newHref = href(APP_ROUTES.STUDIO.STORYBOARD_NEW);

  return (
    <div className="flex flex-col gap-8" data-testid="storyboard-onboarding">
      <Card className="w-full" bodyClassName="gap-4 p-5">
        <div className="flex max-w-2xl flex-col gap-1.5">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">
            {translate('title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {translate('description')}
          </p>
        </div>
        <StoryboardShotStrip format="16:9" shotCount={5} />
      </Card>
      <CollectionSection
        itemCount={STORYBOARD_PRESETS.length}
        title={translate('presetsTitle')}
      >
        <StoryboardPresetGrid presets={STORYBOARD_PRESETS} />
      </CollectionSection>
      <CollectionSection itemCount={2} title={translate('otherWaysTitle')}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card
            actions={
              <Button asChild variant={ButtonVariant.SECONDARY}>
                <Link href={newHref}>{translate('remixAction')}</Link>
              </Button>
            }
            description={translate('remixDescription')}
            icon={<Clapperboard className="size-4" />}
            label={translate('remixTitle')}
          />
          <Card
            actions={
              <Button asChild variant={ButtonVariant.SECONDARY}>
                <Link href={newHref}>{translate('scratchAction')}</Link>
              </Button>
            }
            description={translate('scratchDescription')}
            icon={<PenLine className="size-4" />}
            label={translate('scratchTitle')}
          />
        </div>
      </CollectionSection>
    </div>
  );
}

'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StudioOnboardingHero from '@pages/studio/shared/components/StudioOnboardingHero';
import CollectionSection from '@ui/collection/CollectionSection';
import { Button } from '@ui/primitives/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { CLIPS_PRESETS } from '../data/clips-presets';
import ClipsPresetGrid from './ClipsPresetGrid';
import ClipsSourceBar from './ClipsSourceBar';

/** First-run Clips landing: show what is possible and one-click starts. */
export default function ClipsOnboarding(): ReactElement {
  const translate = useTranslations('pages.studioClips');
  const { href } = useOrgUrl();

  return (
    <div className="flex flex-col gap-8" data-testid="clips-empty-state">
      <StudioOnboardingHero
        actions={
          <Button
            asChild
            label={translate('newProject')}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
          >
            <Link href={href(APP_ROUTES.STUDIO.CLIPS_NEW)}>
              <Plus className="size-3.5" />
              {translate('newProject')}
            </Link>
          </Button>
        }
        description={translate('onboarding.description')}
        illustration={<ClipsSourceBar clipCount={7} />}
        testId="clips-onboarding-hero"
        title={translate('onboarding.title')}
      />
      <CollectionSection
        description={translate('onboarding.presetsDescription')}
        itemCount={CLIPS_PRESETS.length}
        title={translate('onboarding.presetsTitle')}
      >
        <ClipsPresetGrid presets={CLIPS_PRESETS} />
      </CollectionSection>
    </div>
  );
}

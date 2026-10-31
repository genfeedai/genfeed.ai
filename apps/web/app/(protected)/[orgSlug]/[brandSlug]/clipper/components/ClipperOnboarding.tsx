'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import CollectionSection from '@ui/collection/CollectionSection';
import { Button } from '@ui/primitives/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import StudioOnboardingHero from '@/features/studio/shared/components/StudioOnboardingHero';
import { CLIPPER_PRESETS } from '../data/clipper-presets';
import ClipperPresetGrid from './ClipperPresetGrid';
import ClipperSourceBar from './ClipperSourceBar';

/** First-run Clips landing: show what is possible and one-click starts. */
export default function ClipperOnboarding(): ReactElement {
  const translate = useTranslations('pages.studioClipper');
  const { href } = useOrgUrl();

  return (
    <div className="flex flex-col gap-8" data-testid="clipper-empty-state">
      <StudioOnboardingHero
        actions={
          <Button
            asChild
            label={translate('newProject')}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
          >
            <Link href={href(APP_ROUTES.STUDIO.CLIPPER_NEW)}>
              <Plus className="size-3.5" />
              {translate('newProject')}
            </Link>
          </Button>
        }
        description={translate('onboarding.description')}
        illustration={<ClipperSourceBar clipCount={7} />}
        testId="clipper-onboarding-hero"
        title={translate('onboarding.title')}
      />
      <CollectionSection
        description={translate('onboarding.presetsDescription')}
        itemCount={CLIPPER_PRESETS.length}
        title={translate('onboarding.presetsTitle')}
      >
        <ClipperPresetGrid presets={CLIPPER_PRESETS} />
      </CollectionSection>
    </div>
  );
}

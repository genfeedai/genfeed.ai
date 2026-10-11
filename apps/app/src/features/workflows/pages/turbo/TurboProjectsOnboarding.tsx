'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StudioOnboardingHero from '@pages/studio/shared/components/StudioOnboardingHero';
import Card from '@ui/card/Card';
import CollectionSection from '@ui/collection/CollectionSection';
import { Button } from '@ui/primitives/button';
import { Workflow } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import TurboIdeaStrip from './TurboIdeaStrip';
import TurboPresetGrid from './TurboPresetGrid';
import { TURBO_PRESETS } from './turbo-presets';

/** First-run Turbo landing: show what is possible and one-click starts. */
export default function TurboProjectsOnboarding(): ReactElement {
  const translate = useTranslations('pages.turboProjects.onboarding');
  const { href } = useOrgUrl();

  return (
    <div className="flex flex-col gap-8" data-testid="turbo-onboarding">
      <StudioOnboardingHero
        description={translate('description')}
        illustration={
          <TurboIdeaStrip count={6} formats={['image', 'video', 'avatar']} />
        }
        testId="turbo-onboarding-hero"
        title={translate('title')}
      />
      <CollectionSection
        description={translate('presetsDescription')}
        itemCount={TURBO_PRESETS.length}
        title={translate('presetsTitle')}
      >
        <TurboPresetGrid presets={TURBO_PRESETS} />
      </CollectionSection>
      <CollectionSection itemCount={1} title={translate('otherWaysTitle')}>
        <Card
          actions={
            <Button asChild variant={ButtonVariant.SECONDARY}>
              <Link href={href(APP_ROUTES.STUDIO.TURBO_NEW)}>
                {translate('workflowAction')}
              </Link>
            </Button>
          }
          description={translate('workflowDescription')}
          icon={<Workflow className="size-4" />}
          label={translate('workflowTitle')}
        />
      </CollectionSection>
    </div>
  );
}

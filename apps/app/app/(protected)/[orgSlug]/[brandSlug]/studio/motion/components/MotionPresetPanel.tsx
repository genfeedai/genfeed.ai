'use client';

import type { MotionPresetPanelProps } from '@genfeedai/props/studio/motion-presets.props';
import StudioOnboardingHero from '@pages/studio/shared/components/StudioOnboardingHero';
import StudioPresetShelf from '@pages/studio/shared/components/StudioPresetShelf';
import CollectionSection from '@ui/collection/CollectionSection';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { MOTION_PRESETS } from '../data/motion-presets';
import MotionFramePreview from './MotionFramePreview';
import MotionPresetGrid from './MotionPresetGrid';

/** First-run Motion intro, or a compact preset shelf for returning users. */
export default function MotionPresetPanel({
  appliedPresetId,
  isFirstRun,
  onApply,
}: MotionPresetPanelProps): ReactElement {
  const translate = useTranslations('pages.studioMotion');

  return (
    <div className="flex flex-col gap-6" data-testid="motion-presets">
      {isFirstRun ? (
        <>
          <StudioOnboardingHero
            description={translate('onboarding.description')}
            illustration={
              <MotionFramePreview
                durationFrames={450}
                height={1080}
                width={1920}
              />
            }
            testId="motion-onboarding-hero"
            title={translate('onboarding.title')}
          />
          <CollectionSection
            description={translate('onboarding.presetsDescription')}
            itemCount={MOTION_PRESETS.length}
            title={translate('onboarding.presetsTitle')}
          >
            <MotionPresetGrid
              appliedPresetId={appliedPresetId}
              onApply={onApply}
              presets={MOTION_PRESETS}
            />
          </CollectionSection>
        </>
      ) : (
        <StudioPresetShelf
          presets={MOTION_PRESETS}
          renderPresets={(presets, layout) => (
            <MotionPresetGrid
              appliedPresetId={appliedPresetId}
              layout={layout}
              onApply={onApply}
              presets={presets}
            />
          )}
          seeAllLabel={translate('presets.seeAll')}
          showFewerLabel={translate('presets.showFewer')}
          title={translate('presets.shelfTitle')}
        />
      )}
      {appliedPresetId ? (
        <p className="text-sm text-muted-foreground" role="status">
          {translate('presets.appliedStatus')}
        </p>
      ) : null}
    </div>
  );
}

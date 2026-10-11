'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { TurboProjectKind } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  TurboPreset,
  TurboPresetGridProps,
} from '@genfeedai/props/studio/turbo-presets.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StudioPresetCard from '@pages/studio/shared/components/StudioPresetCard';
import StudioPresetList from '@pages/studio/shared/components/StudioPresetList';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactElement, useRef, useState } from 'react';
import TurboIdeaStrip from './TurboIdeaStrip';
import { createTurboProjectsApi } from './turbo-projects-api';

/**
 * Preset cards that save a Turbo idea project in one click. Creating only
 * saves a draft with the preset's formats, idea count and angle: no ideas are
 * generated and no credits are reserved until the creator generates ideas and
 * accepts a credit quote on the project page.
 */
export default function TurboPresetGrid({
  layout = 'grid',
  presets,
}: TurboPresetGridProps): ReactElement {
  const translate = useTranslations('pages.turboProjects');
  const { brandId } = useBrand();
  const { href } = useOrgUrl();
  const router = useRouter();
  const isIdeasEnabled = useFeatureFlag('turbo_ideas');
  const getService = useAuthedService(createTurboProjectsApi);
  const [launchingId, setLaunchingId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const isLaunchLocked = useRef(false);
  const canCreate = Boolean(brandId) && isIdeasEnabled;

  async function launch(preset: TurboPreset) {
    if (!brandId || !canCreate || isLaunchLocked.current) return;
    isLaunchLocked.current = true;
    setLaunchingId(preset.id);
    setError(null);
    try {
      const service = await getService();
      const project = await service.create({
        brandId,
        kind: TurboProjectKind.IDEAS,
        name: translate(`presets.items.${preset.id}.title`),
      });
      try {
        await service.update(project.id, {
          settings: {
            ideas: {
              angle: preset.angle,
              count: preset.count,
              formats: [...preset.formats],
            },
          },
        });
      } catch {
        /* The draft exists with default idea settings; the creator can adjust them on the project page. */
      }
      // Stay in the pending state until the route changes.
      router.push(href(`${APP_ROUTES.STUDIO.TURBO}/${project.id}`));
    } catch (reason) {
      setError(
        getJsonApiErrorMessage(reason, translate('presets.createFailed')),
      );
      setLaunchingId(undefined);
      isLaunchLocked.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {brandId ? null : (
        <p className="text-sm text-muted-foreground" role="status">
          {translate('presets.selectBrand')}
        </p>
      )}
      {isIdeasEnabled ? null : (
        <p className="text-sm text-muted-foreground" role="status">
          {translate('ideasDisabled')}
        </p>
      )}
      <StudioPresetList
        ariaLabel={translate('presets.listAria')}
        layout={layout}
        testId="turbo-preset-list"
      >
        {presets.map((preset) => {
          const title = translate(`presets.items.${preset.id}.title`);
          const isLaunching = launchingId === preset.id;
          return (
            <StudioPresetCard
              actionAriaLabel={translate('presets.createAria', { title })}
              actionLabel={translate(
                isLaunching ? 'presets.creating' : 'presets.create',
              )}
              chips={[
                ...preset.formats.map((format) => translate(format)),
                translate('presets.ideas', { count: preset.count }),
              ]}
              description={translate(`presets.items.${preset.id}.description`)}
              icon={preset.icon}
              illustration={
                <TurboIdeaStrip count={preset.count} formats={preset.formats} />
              }
              isDisabled={
                !canCreate || (launchingId !== undefined && !isLaunching)
              }
              isLoading={isLaunching}
              key={preset.id}
              layout={layout}
              onSelect={() => void launch(preset)}
              testId="turbo-preset"
              title={title}
            />
          );
        })}
      </StudioPresetList>
      {error && launchingId === undefined ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

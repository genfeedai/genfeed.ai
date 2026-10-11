'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  StoryboardPreset,
  StoryboardPresetGridProps,
} from '@genfeedai/props/studio/storyboard-presets.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StoryboardShotStrip from '@pages/studio/storyboard/components/StoryboardShotStrip';
import { buildStoryboardPresetInput } from '@pages/studio/storyboard/data/storyboard-presets';
import { useCreateStoryboard } from '@pages/studio/storyboard/hooks/use-create-storyboard';
import Card from '@ui/card/Card';
import {
  COLLECTION_GRID_COLUMN_CLASSES,
  COLLECTION_GRID_GAP_CLASSES,
} from '@ui/collection/collection.constants';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';

/**
 * Preset cards that create a storyboard in one click. Creating only saves an
 * editable draft: nothing is generated or charged until the creator approves
 * a credit quote on the run page.
 */
export default function StoryboardPresetGrid({
  presets,
  layout = 'grid',
}: StoryboardPresetGridProps): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.presets');
  const brandId = useBrandId();
  const { href } = useOrgUrl();
  const router = useRouter();
  const { create, error, isCreating, isCurrentResult } = useCreateStoryboard();
  const [launchingId, setLaunchingId] = useState<string>();
  const hasBrand = Boolean(brandId);
  const isBusy = isCreating || launchingId !== undefined;

  async function launch(preset: StoryboardPreset) {
    if (!hasBrand || isBusy) return;
    setLaunchingId(preset.id);
    try {
      const id = await create(buildStoryboardPresetInput(preset));
      if (!isCurrentResult(id)) {
        setLaunchingId(undefined);
        return;
      }
      // Stay in the pending state until the route changes.
      router.push(
        href(`${APP_ROUTES.STUDIO.STORYBOARD}/${encodeURIComponent(id)}`),
      );
    } catch {
      /* The hook keeps the source and exposes the retryable error. */
      setLaunchingId(undefined);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {hasBrand ? null : (
        <p className="text-sm text-muted-foreground" role="status">
          {translate('selectBrand')}
        </p>
      )}
      <div className="@container">
        <ul
          aria-label={translate('listAria')}
          className={cn(
            layout === 'grid'
              ? [
                  'grid',
                  COLLECTION_GRID_COLUMN_CLASSES[3],
                  COLLECTION_GRID_GAP_CLASSES.card,
                ]
              : 'flex snap-x gap-4 overflow-x-auto pb-2',
          )}
          data-testid="storyboard-preset-list"
        >
          {presets.map((preset) => {
            const title = translate(`items.${preset.id}.title`);
            const isLaunching = launchingId === preset.id;
            return (
              <li
                className={cn(
                  'flex',
                  layout === 'row' && 'w-72 shrink-0 snap-start',
                )}
                data-testid="storyboard-preset"
                key={preset.id}
              >
                <Card
                  actions={
                    <Button
                      ariaLabel={translate('createAria', { title })}
                      className="w-full"
                      isDisabled={!hasBrand || (isBusy && !isLaunching)}
                      isLoading={isLaunching}
                      label={translate(isLaunching ? 'creating' : 'create')}
                      onClick={() => void launch(preset)}
                      variant={ButtonVariant.DEFAULT}
                    />
                  }
                  bodyClassName="h-full"
                  className="flex w-full flex-col"
                  description={translate(`items.${preset.id}.description`)}
                  icon={<preset.icon className="size-4" />}
                  label={title}
                >
                  <StoryboardShotStrip
                    format={preset.format}
                    shotCount={preset.shotCount}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{preset.format}</Badge>
                    <Badge variant="secondary">
                      {translate('runtime', {
                        seconds: preset.runtimeBudgetSeconds,
                      })}
                    </Badge>
                    <Badge variant="secondary">
                      {translate('shots', { count: preset.shotCount })}
                    </Badge>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
      {error && !isBusy ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

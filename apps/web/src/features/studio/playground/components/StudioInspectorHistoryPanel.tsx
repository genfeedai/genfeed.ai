'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import {
  studioAssetAccessibleLabel,
  studioIngredientAccessibleLabel,
} from '@/features/studio/playground/utils/studio-playground-recipe';
import type { StudioInspectorHistoryPanelProps } from '@/features/studio/props/studio-playground-inspector.props';

/** The other generations of the same run, and the assets made from this one. */
export default function StudioInspectorHistoryPanel({
  childAssets,
  isLoading,
  onSelect,
  siblingJobs,
}: StudioInspectorHistoryPanelProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  return (
    <div className="px-4 py-3">
      {siblingJobs.length === 0 && childAssets.length === 0 && !isLoading ? (
        <p className="text-xs text-muted-foreground">
          {translate('inspector.emptyHistory')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {siblingJobs.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
                {translate('inspector.runSiblings')}
              </p>
              <ul className="flex flex-col gap-1">
                {siblingJobs.map((sibling) => (
                  <li key={sibling.id}>
                    <Button
                      label={studioAssetAccessibleLabel(sibling)}
                      onClick={() => onSelect(sibling)}
                      size={ButtonSize.SM}
                      variant={ButtonVariant.LINK}
                      withWrapper={false}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {isLoading ? (
            <p className="text-xs text-muted-foreground">
              {translate('inspector.loading')}
            </p>
          ) : childAssets.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
                {translate('inspector.childAssets')}
              </p>
              <ul className="flex flex-col gap-1">
                {childAssets.map((child) => (
                  <li
                    className="truncate text-xs text-foreground/80"
                    key={child.id}
                  >
                    {studioIngredientAccessibleLabel(child)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

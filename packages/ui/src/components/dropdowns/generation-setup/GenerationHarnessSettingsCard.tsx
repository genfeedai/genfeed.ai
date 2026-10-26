'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { GenerationHarnessSettingsCardProps } from '@genfeedai/props/ui/generation-setup/generation-harness.props';
import GenerationToggleRow from '@ui/dropdowns/generation-setup/GenerationToggleRow';
import GenerationTriStateControl from '@ui/dropdowns/generation-setup/GenerationTriStateControl';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

export default function GenerationHarnessSettingsCard({
  showTitle = true,
  className,
  brandId,
  error,
  isLoading,
  isSaving,
  onRefresh,
  onSave,
  settings,
}: GenerationHarnessSettingsCardProps) {
  const translate = useTranslations('ui.generationHarness');
  const isDisabled = isLoading || isSaving || !settings;
  return (
    <div
      className={cn('flex flex-col gap-4 p-4', className)}
      aria-busy={isLoading || isSaving}
    >
      {showTitle ? (
        <div className="space-y-1">
          <p className="text-sm font-semibold">{translate('title')}</p>
        </div>
      ) : null}
      {isLoading ? (
        <p className="text-sm" role="status">
          {translate('loading')}
        </p>
      ) : null}
      {settings ? (
        <>
          <GenerationToggleRow label={translate('organizationDefault')}>
            <GenerationTriStateControl
              ariaLabel={translate('organizationLabel')}
              isDisabled={isDisabled}
              onChange={(value) => {
                void onSave('organization', value);
              }}
              resolvedValue={settings.organizationEnabled ?? true}
              value={settings.organizationEnabled}
            />
          </GenerationToggleRow>
          {brandId ? (
            <GenerationToggleRow label={translate('brand')}>
              <GenerationTriStateControl
                ariaLabel={translate('brandLabel')}
                isDisabled={isDisabled}
                onChange={(value) => {
                  void onSave('brand', value);
                }}
                resolvedValue={settings.isEnabled}
                value={settings.brandEnabled}
              />
            </GenerationToggleRow>
          ) : null}
          {isSaving ? (
            <p className="text-xs text-muted-foreground" role="status">
              {translate('saving')}
            </p>
          ) : null}
        </>
      ) : null}
      {error ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            isDisabled={isSaving}
            onClick={onRefresh}
            withWrapper={false}
          >
            {translate('refresh')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

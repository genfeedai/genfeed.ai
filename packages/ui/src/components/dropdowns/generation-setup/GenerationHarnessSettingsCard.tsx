'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationHarnessSettingsCardProps } from '@genfeedai/props/ui/generation-setup/generation-harness.props';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';

export default function GenerationHarnessSettingsCard({
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
  const brandOptions = [
    { label: translate('inherit'), value: null },
    { label: translate('on'), value: true },
    { label: translate('off'), value: false },
  ] as const;
  return (
    <div className="flex flex-col gap-4 p-4" aria-busy={isLoading || isSaving}>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{translate('title')}</p>
        <p className="text-xs text-muted-foreground">
          {translate('description')}
        </p>
      </div>
      {isLoading ? (
        <p className="text-sm" role="status">
          {translate('loading')}
        </p>
      ) : null}
      {settings ? (
        <>
          <Switch
            aria-label={translate('organizationLabel')}
            label={translate('organizationDefault')}
            isChecked={settings.organizationEnabled ?? true}
            isDisabled={isDisabled}
            onCheckedChange={(value) => {
              void onSave('organization', value);
            }}
          />
          {settings.organizationEnabled !== null ? (
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              isDisabled={isDisabled}
              onClick={() => {
                void onSave('organization', null);
              }}
              withWrapper={false}
            >
              {translate('resetOrganization')}
            </Button>
          ) : null}
          {brandId ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{translate('brand')}</p>
              <div
                className="flex gap-1"
                role="group"
                aria-label={translate('brandLabel')}
              >
                {brandOptions.map((option) => (
                  <Button
                    key={option.label}
                    aria-pressed={settings.brandEnabled === option.value}
                    size={ButtonSize.SM}
                    variant={
                      settings.brandEnabled === option.value
                        ? ButtonVariant.SECONDARY
                        : ButtonVariant.GHOST
                    }
                    isDisabled={isDisabled}
                    onClick={() => {
                      void onSave('brand', option.value);
                    }}
                    withWrapper={false}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground" role="status">
            {isSaving
              ? 'Saving…'
              : `Enhancement ${settings.isEnabled ? 'on' : 'off'} · ${settings.source === 'default' ? 'system default' : `${settings.source} preference`}`}
          </p>
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

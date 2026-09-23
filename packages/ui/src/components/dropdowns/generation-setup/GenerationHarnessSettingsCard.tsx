'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationHarnessSettingsCardProps } from '@genfeedai/props/ui/generation-setup/generation-harness.props';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';

export default function GenerationHarnessSettingsCard({ brandId, error, isLoading, isSaving, onRefresh, onSave, settings }: GenerationHarnessSettingsCardProps) {
  const isDisabled = isLoading || isSaving || !settings;
  return (
    <div className="flex flex-col gap-4 p-4" aria-busy={isLoading || isSaving}>
      <div className="space-y-1">
        <p className="text-sm font-semibold">Prompt enhancement</p>
        <p className="text-xs text-muted-foreground">Improve image and video prompts automatically. These preferences apply in Studio and all connected agents.</p>
      </div>
      {isLoading ? <p className="text-sm" role="status">Loading settings…</p> : null}
      {settings ? <>
        <Switch aria-label="Organization prompt enhancement" label="Organization default" isChecked={settings.organizationEnabled ?? true} isDisabled={isDisabled} onCheckedChange={(value) => { void onSave('organization', value); }} />
        {settings.organizationEnabled !== null ? <Button size={ButtonSize.SM} variant={ButtonVariant.GHOST} isDisabled={isDisabled} onClick={() => { void onSave('organization', null); }} withWrapper={false}>Reset organization default</Button> : null}
        {brandId ? <div className="space-y-2">
          <p className="text-sm font-medium">This brand</p>
          <div className="flex gap-1" role="group" aria-label="Brand prompt enhancement">
            {([{ label: 'Inherit', value: null }, { label: 'On', value: true }, { label: 'Off', value: false }] as const).map((option) => <Button key={option.label} aria-pressed={settings.brandEnabled === option.value} size={ButtonSize.SM} variant={settings.brandEnabled === option.value ? ButtonVariant.SECONDARY : ButtonVariant.GHOST} isDisabled={isDisabled} onClick={() => { void onSave('brand', option.value); }} withWrapper={false}>{option.label}</Button>)}
          </div>
        </div> : null}
        <p className="text-xs text-muted-foreground" role="status">{isSaving ? 'Saving…' : `Enhancement ${settings.isEnabled ? 'on' : 'off'} · ${settings.source === 'default' ? 'system default' : `${settings.source} preference`}`}</p>
      </> : null}
      {error ? <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button size={ButtonSize.SM} variant={ButtonVariant.OUTLINE} isDisabled={isSaving} onClick={onRefresh} withWrapper={false}>Refresh settings</Button></div> : null}
    </div>
  );
}

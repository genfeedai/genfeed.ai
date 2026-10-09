'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { StudioSystemPreset } from '@genfeedai/contracts/constants/studio-system-presets.constant';
import type { GenerationSetupPresetsPopoverProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupPresetPreview from '@ui/dropdowns/generation-setup/GenerationSetupPresetPreview';
import GenerationSetupPresetsSection from '@ui/dropdowns/generation-setup/GenerationSetupPresetsSection';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Bookmark, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function GenerationSetupPresetsPopover({
  onClearPreset,
  systemPresets = [],
  onApplySystemPreset,
  ...props
}: GenerationSetupPresetsPopoverProps) {
  const translate = useTranslations('agent.generationSetup');
  const [isOpen, setIsOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState<StudioSystemPreset['key']>();
  const preview = systemPresets.find((preset) => preset.key === previewKey);
  return (
    <Popover
      open={props.isDisabled ? false : isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setPreviewKey(undefined);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ariaLabel={translate('presets')}
          aria-pressed={Boolean(props.setup.presetId)}
          className="size-8 shrink-0 p-0"
          icon={<Bookmark className="size-3.5" />}
          isDisabled={props.isDisabled}
          size={ButtonSize.ICON}
          title={translate('presets')}
          variant={
            props.setup.presetId ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
          }
          withWrapper={false}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex max-h-[min(640px,var(--radix-popover-content-available-height,75vh))] w-[min(560px,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden p-3"
        collisionPadding={16}
        side="top"
        sideOffset={8}
      >
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <span className="text-sm font-medium">{translate('presets')}</span>
          {props.setup.presetId ? (
            <Button
              ariaLabel={translate('unpinPreset')}
              icon={<X className="size-3.5" />}
              isDisabled={props.isDisabled}
              onClick={onClearPreset}
              size={ButtonSize.ICON}
              variant={ButtonVariant.GHOST}
            />
          ) : null}
        </div>
        <div className="min-h-0 overflow-y-auto">
          {preview ? (
            <div className="mb-3 space-y-2">
              <GenerationSetupPresetPreview preset={preview} isAnimated />
              <p className="text-sm font-medium">{preview.label}</p>
              <p className="text-xs text-muted-foreground">
                {preview.description}
              </p>
              <div className="flex gap-2">
                <Button
                  label={translate('applyPreset', { label: preview.label })}
                  isDisabled={props.isDisabled || !onApplySystemPreset}
                  onClick={() => {
                    onApplySystemPreset?.(preview);
                    setIsOpen(false);
                    setPreviewKey(undefined);
                  }}
                  size={ButtonSize.SM}
                />
                <Button
                  label={translate('presets')}
                  onClick={() => setPreviewKey(undefined)}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                />
              </div>
            </div>
          ) : systemPresets.length ? (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {systemPresets.map((preset) => (
                <Button
                  key={preset.key}
                  ariaLabel={preset.label}
                  className="flex h-auto min-w-0 flex-col items-stretch gap-1.5 p-1 text-xs"
                  isDisabled={props.isDisabled}
                  onClick={() => setPreviewKey(preset.key)}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                >
                  <GenerationSetupPresetPreview preset={preset} />
                  <span className="truncate px-1 pb-1">{preset.label}</span>
                </Button>
              ))}
            </div>
          ) : null}
          {!props.presets.length && !props.isPresetsLoading ? (
            <p className="py-2 text-xs text-muted-foreground">
              {translate('noPresets')}
            </p>
          ) : null}
          <GenerationSetupPresetsSection
            {...props}
            onApplyPreset={(preset) => {
              props.onApplyPreset(preset);
              setIsOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

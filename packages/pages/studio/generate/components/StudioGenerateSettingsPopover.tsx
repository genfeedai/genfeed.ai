'use client';

import { ButtonSize, ButtonVariant, RouterPriority } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StudioGenerateSettingsPopoverProps } from '@genfeedai/props/studio/studio-generate.props';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import StudioLooksPanel from '@pages/studio/generate/components/StudioLooksPanel';
import { useStudioGenerateIdentities } from '@pages/studio/generate/hooks/useStudioGenerateIdentities';
import { useStudioRemixRunScope } from '@pages/studio/generate/StudioRemixRunScope';
import {
  describeStudioGenerateSettings,
  getStudioAspectRatios,
  getStudioDurations,
  getStudioResolutions,
  STUDIO_ASPECT_RATIOS,
  STUDIO_MAX_OUTPUTS,
} from '@pages/studio/generate/utils/studio-generate-settings';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import {
  clampRemixDurationSeconds,
  REMIX_MAX_DURATION_SECONDS,
  REMIX_MIN_DURATION_SECONDS,
} from '@pages/studio/generate/utils/studio-remix-run';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import {
  EMPTY_SELECT_ITEM_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import { Palette, Settings2, Sparkles, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';

type StudioSettingsSectionId = 'look' | 'identity' | 'output' | 'brand';

interface StudioSettingsSection {
  icon: ReactNode;
  id: StudioSettingsSectionId;
  label: string;
}

const SECTION_ICON_CLASS = 'size-4';

/** Value used by every "no element picked" option — Radix rejects `''`. */
const NONE_VALUE = EMPTY_SELECT_ITEM_VALUE;

const PRIORITY_OPTIONS: ReadonlyArray<{
  label: string;
  value: RouterPriority;
}> = [
  { label: 'Balanced', value: RouterPriority.BALANCED },
  { label: 'Quality', value: RouterPriority.QUALITY },
  { label: 'Speed', value: RouterPriority.SPEED },
  { label: 'Cost', value: RouterPriority.COST },
];

function getRemixAspectRatioOptions(current: string) {
  return Array.from(new Set([current, ...STUDIO_ASPECT_RATIOS])).map(
    (ratio) => ({ label: ratio, value: ratio }),
  );
}

function describeRemixOutputSettings(
  settings: StudioGenerateSettingsPopoverProps['settings'],
  type: StudioGenerateSettingsPopoverProps['type'],
): string {
  return [
    settings.aspectRatio,
    type === 'video' || type === 'avatar'
      ? settings.duration
        ? `${settings.duration}s`
        : null
      : null,
    `${settings.outputs}x`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function SettingRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="w-44 shrink-0">{children}</div>
    </div>
  );
}

function OptionSelect({
  ariaLabel,
  onChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string;
  onChange: (value: string | undefined) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  placeholder: string;
  value: string | undefined;
}): ReactElement {
  return (
    <Select
      onValueChange={(next) => onChange(next === NONE_VALUE ? undefined : next)}
      value={value || NONE_VALUE}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('w-full', SHELL_CONTROL_HEIGHT_CLASS)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StudioRemixOutputSettingsPopover({
  isDisabled = false,
  onChange,
  onReset,
  settings,
  type,
}: StudioGenerateSettingsPopoverProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
  const hasDuration = type === 'video' || type === 'avatar';
  const summary = describeRemixOutputSettings(settings, type);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          ariaLabel="Generation settings"
          className={cn(
            'gap-1.5 border border-border bg-background px-2.5 text-xs font-medium hover:bg-accent/50',
            SHELL_CONTROL_HEIGHT_CLASS,
          )}
          icon={<Settings2 className="size-3.5" />}
          isDisabled={isDisabled}
          label={summary}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </PopoverTrigger>
      <PopoverPanelContent align="start" className="w-80 p-3" side="top">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {translate('remixOutput.title')}
            </p>
            <p className="text-xs text-muted-foreground">
              {translate('remixOutput.description')}
            </p>
          </div>
          <SettingRow label="Aspect ratio">
            <OptionSelect
              ariaLabel="Aspect ratio"
              onChange={(value) =>
                onChange({ aspectRatio: value || settings.aspectRatio })
              }
              options={getRemixAspectRatioOptions(settings.aspectRatio)}
              placeholder="Aspect ratio"
              value={settings.aspectRatio}
            />
          </SettingRow>
          {hasDuration ? (
            <SettingRow label="Duration">
              <Input
                aria-label="Duration"
                className={SHELL_CONTROL_HEIGHT_CLASS}
                max={REMIX_MAX_DURATION_SECONDS}
                min={REMIX_MIN_DURATION_SECONDS}
                onChange={(event) => {
                  onChange({
                    duration: clampRemixDurationSeconds(event.target.value),
                  });
                }}
                type="number"
                value={settings.duration ?? ''}
              />
            </SettingRow>
          ) : null}
          <SettingRow label="Outputs">
            <OptionSelect
              ariaLabel="Number of outputs"
              onChange={(value) =>
                onChange({ outputs: value ? Number(value) : 1 })
              }
              options={Array.from(
                { length: STUDIO_MAX_OUTPUTS },
                (_unused, index) => ({
                  label: `${index + 1}x`,
                  value: String(index + 1),
                }),
              )}
              placeholder="1x"
              value={String(settings.outputs)}
            />
          </SettingRow>
          <div className="flex justify-end border-t border-border pt-2">
            <Button
              className="px-2 text-xs"
              label="Reset"
              onClick={onReset}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </div>
        </div>
      </PopoverPanelContent>
    </Popover>
  );
}

/**
 * The gear chip from the composer. Every knob that is not the prompt, the
 * asset type, or the model lives here, grouped into a two-pane panel so the
 * composer row stays a single line no matter how many controls a type needs.
 */
function StandardStudioGenerateSettingsPopover({
  isDisabled = false,
  onChange,
  onReset,
  settings,
  type,
}: StudioGenerateSettingsPopoverProps): ReactElement {
  const { capabilities, elementsType } = getStudioGenerateTypeConfig(type);
  const elements = useElements({ type: elementsType });
  const { avatarOptions, isLoadingIdentities, voiceOptions } =
    useStudioGenerateIdentities();

  const sections = useMemo<readonly StudioSettingsSection[]>(() => {
    const entries: StudioSettingsSection[] = [];

    if (capabilities.hasLook) {
      entries.push({
        icon: <Palette className={SECTION_ICON_CLASS} />,
        id: 'look',
        label: 'Look',
      });
    }

    if (capabilities.hasIdentity) {
      entries.push({
        icon: <UserRound className={SECTION_ICON_CLASS} />,
        id: 'identity',
        label: 'Identity',
      });
    }

    entries.push({
      icon: <Settings2 className={SECTION_ICON_CLASS} />,
      id: 'output',
      label: 'Output',
    });
    // Music, avatar, and voice payloads carry neither brand enrichment nor a
    // router priority, so the section is dropped rather than shown inert.
    if (capabilities.hasBrandEnrichment || capabilities.hasModelSelection) {
      entries.push({
        icon: <Sparkles className={SECTION_ICON_CLASS} />,
        id: 'brand',
        label: capabilities.hasBrandEnrichment ? 'Brand' : 'Routing',
      });
    }

    return entries;
  }, [
    capabilities.hasBrandEnrichment,
    capabilities.hasIdentity,
    capabilities.hasLook,
    capabilities.hasModelSelection,
  ]);

  const [activeSection, setActiveSection] = useState<StudioSettingsSectionId>(
    () => sections[0]?.id ?? 'output',
  );

  const aspectRatios = getStudioAspectRatios(type);
  const resolutions = getStudioResolutions(type);
  const durations = getStudioDurations(type);
  const summary = describeStudioGenerateSettings(settings, type);

  // The active section can disappear when the operator switches asset type
  // (Image → Voice drops `look`), so fall back rather than render an empty pane.
  const visibleSection = sections.some(
    (section) => section.id === activeSection,
  )
    ? activeSection
    : (sections[0]?.id ?? 'output');

  const toElementOptions = (
    items: ReadonlyArray<{ key: string; label: string }>,
  ) => items.map((item) => ({ label: item.label, value: item.key }));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          ariaLabel="Generation settings"
          className={cn(
            'gap-1.5 px-2.5 text-xs font-medium',
            SHELL_CONTROL_HEIGHT_CLASS,
          )}
          icon={<Settings2 className="size-3.5" />}
          isDisabled={isDisabled}
          label={summary || 'Settings'}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </PopoverTrigger>
      <PopoverPanelContent align="start" className="w-[30rem] p-0" side="top">
        <div className="flex">
          <div className="flex w-32 shrink-0 flex-col gap-0.5 border-r border-border bg-background-secondary p-1.5">
            {sections.map((section) => (
              <Button
                className={cn(
                  'flex h-auto w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
                  section.id === visibleSection
                    ? 'bg-foreground/[0.08] font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/[0.04]',
                )}
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                {section.icon}
                {section.label}
              </Button>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
            {visibleSection === 'look' ? (
              <>
                <SettingRow label="Preset">
                  <OptionSelect
                    ariaLabel="Preset"
                    onChange={(value) => onChange({ promptTemplate: value })}
                    options={toElementOptions(elements.presets)}
                    placeholder="No preset"
                    value={settings.promptTemplate}
                  />
                </SettingRow>
                <SettingRow label="Style">
                  <OptionSelect
                    ariaLabel="Style"
                    onChange={(value) => onChange({ style: value })}
                    options={toElementOptions(elements.styles)}
                    placeholder="No style"
                    value={settings.style}
                  />
                </SettingRow>
                <SettingRow label="Mood">
                  <OptionSelect
                    ariaLabel="Mood"
                    onChange={(value) => onChange({ mood: value })}
                    options={toElementOptions(elements.moods)}
                    placeholder="No mood"
                    value={settings.mood}
                  />
                </SettingRow>
                <SettingRow label="Scene">
                  <OptionSelect
                    ariaLabel="Scene"
                    onChange={(value) => onChange({ scene: value })}
                    options={toElementOptions(elements.scenes)}
                    placeholder="No scene"
                    value={settings.scene}
                  />
                </SettingRow>
                <SettingRow label="Camera">
                  <OptionSelect
                    ariaLabel="Camera"
                    onChange={(value) => onChange({ camera: value })}
                    options={toElementOptions(elements.cameras)}
                    placeholder="No camera"
                    value={settings.camera}
                  />
                </SettingRow>
                <SettingRow label="Lens">
                  <OptionSelect
                    ariaLabel="Lens"
                    onChange={(value) => onChange({ lens: value })}
                    options={toElementOptions(elements.lenses)}
                    placeholder="No lens"
                    value={settings.lens}
                  />
                </SettingRow>
                <SettingRow label="Lighting">
                  <OptionSelect
                    ariaLabel="Lighting"
                    onChange={(value) => onChange({ lighting: value })}
                    options={toElementOptions(elements.lightings)}
                    placeholder="No lighting"
                    value={settings.lighting}
                  />
                </SettingRow>
                {type === 'video' ? (
                  <SettingRow label="Camera move">
                    <OptionSelect
                      ariaLabel="Camera movement"
                      onChange={(value) => onChange({ cameraMovement: value })}
                      options={toElementOptions(elements.cameraMovements)}
                      placeholder="No movement"
                      value={settings.cameraMovement}
                    />
                  </SettingRow>
                ) : null}
                <StudioLooksPanel
                  onApply={onChange}
                  settings={settings}
                  type={type === 'video' ? 'video' : 'image'}
                />
              </>
            ) : null}

            {visibleSection === 'identity' ? (
              <>
                {type === 'avatar' ? (
                  <SettingRow label="Avatar">
                    <OptionSelect
                      ariaLabel="Avatar"
                      onChange={(value) => onChange({ avatarPhotoUrl: value })}
                      options={avatarOptions}
                      placeholder={
                        isLoadingIdentities ? 'Loading…' : 'Pick an avatar'
                      }
                      value={settings.avatarPhotoUrl}
                    />
                  </SettingRow>
                ) : null}
                <SettingRow label="Voice">
                  <OptionSelect
                    ariaLabel="Voice"
                    onChange={(value) => onChange({ voiceId: value })}
                    options={voiceOptions}
                    placeholder={
                      isLoadingIdentities ? 'Loading…' : 'Pick a voice'
                    }
                    value={settings.voiceId}
                  />
                </SettingRow>
              </>
            ) : null}

            {visibleSection === 'output' ? (
              <>
                {aspectRatios.length > 0 ? (
                  <SettingRow label="Aspect ratio">
                    <OptionSelect
                      ariaLabel="Aspect ratio"
                      onChange={(value) =>
                        onChange({ aspectRatio: value || settings.aspectRatio })
                      }
                      options={aspectRatios.map((ratio) => ({
                        label: ratio,
                        value: ratio,
                      }))}
                      placeholder="Aspect ratio"
                      value={settings.aspectRatio}
                    />
                  </SettingRow>
                ) : null}
                {resolutions.length > 0 ? (
                  <SettingRow label="Resolution">
                    <OptionSelect
                      ariaLabel="Resolution"
                      onChange={(value) =>
                        onChange({ resolution: value || settings.resolution })
                      }
                      options={resolutions.map((resolution) => ({
                        label: resolution,
                        value: resolution,
                      }))}
                      placeholder="Resolution"
                      value={settings.resolution}
                    />
                  </SettingRow>
                ) : null}
                {durations.length > 0 ? (
                  <SettingRow label="Duration">
                    <OptionSelect
                      ariaLabel="Duration"
                      onChange={(value) =>
                        onChange({
                          duration: value ? Number(value) : settings.duration,
                        })
                      }
                      options={durations.map((duration) => ({
                        label: `${duration}s`,
                        value: String(duration),
                      }))}
                      placeholder="Duration"
                      value={
                        settings.duration
                          ? String(settings.duration)
                          : undefined
                      }
                    />
                  </SettingRow>
                ) : null}
                {capabilities.hasOutputs ? (
                  <SettingRow label="Outputs">
                    <OptionSelect
                      ariaLabel="Number of outputs"
                      onChange={(value) =>
                        onChange({ outputs: value ? Number(value) : 1 })
                      }
                      options={Array.from(
                        { length: STUDIO_MAX_OUTPUTS },
                        (_unused, index) => ({
                          label: `${index + 1}x`,
                          value: String(index + 1),
                        }),
                      )}
                      placeholder="1x"
                      value={String(settings.outputs)}
                    />
                  </SettingRow>
                ) : null}
                <SettingRow label="Folder">
                  <Input
                    aria-label="Destination folder"
                    className={SHELL_CONTROL_HEIGHT_CLASS}
                    name="studioGenerateFolder"
                    onChange={(event) =>
                      onChange({ folder: event.target.value })
                    }
                    placeholder="Library root"
                    value={settings.folder ?? ''}
                  />
                </SettingRow>
              </>
            ) : null}

            {visibleSection === 'brand' ? (
              <>
                {capabilities.hasBrandEnrichment ? (
                  <Switch
                    description="Enrich the prompt with your brand voice, palette, and guidelines before it reaches the model."
                    isChecked={settings.brandingMode === 'brand'}
                    label="Brand enrichment"
                    onCheckedChange={(isEnabled) =>
                      onChange({ brandingMode: isEnabled ? 'brand' : 'off' })
                    }
                  />
                ) : null}
                <SettingRow label="Routing">
                  <OptionSelect
                    ariaLabel="Routing priority"
                    onChange={(value) =>
                      onChange({
                        prioritize:
                          (value as RouterPriority) || settings.prioritize,
                      })
                    }
                    options={PRIORITY_OPTIONS}
                    placeholder="Balanced"
                    value={settings.prioritize}
                  />
                </SettingRow>
              </>
            ) : null}

            <div className="flex justify-end border-t border-border pt-2">
              <Button
                className="px-2 text-xs"
                label="Reset"
                onClick={onReset}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </div>
          </div>
        </div>
      </PopoverPanelContent>
    </Popover>
  );
}

export default function StudioGenerateSettingsPopover(
  props: StudioGenerateSettingsPopoverProps,
): ReactElement {
  const isRemixRun = useStudioRemixRunScope();

  return isRemixRun ? (
    <StudioRemixOutputSettingsPopover {...props} />
  ) : (
    <StandardStudioGenerateSettingsPopover {...props} />
  );
}

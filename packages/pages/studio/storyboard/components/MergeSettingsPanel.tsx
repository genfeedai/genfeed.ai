'use client';

import { VideoTransition } from '@genfeedai/contracts';
import type { StoryboardMergeSettingsPanelProps } from '@genfeedai/props/studio/storyboard.props';
import FormRange from '@ui/primitives/range-field';
import { Switch } from '@ui/primitives/switch';
import EaseCurveSelector from '@ui/storyboard/EaseCurveSelector';
import TransitionSelector from '@ui/storyboard/TransitionSelector';

const DEFAULT_TRANSITION_DURATION = 0.5;

export default function MergeSettingsPanel({
  isDisabled,
  settings,
  onChange,
}: StoryboardMergeSettingsPanelProps) {
  const hasTransition =
    Boolean(settings.transition) &&
    settings.transition !== VideoTransition.NONE;

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Merge settings
      </span>

      <div className="grid gap-3 sm:grid-cols-2">
        <TransitionSelector
          value={settings.transition}
          isDisabled={isDisabled}
          isFullWidth
          dropdownDirection="down"
          onChange={(transition) => onChange({ transition })}
        />
        <EaseCurveSelector
          value={settings.transitionEaseCurve}
          isDisabled={isDisabled || !hasTransition}
          isFullWidth
          dropdownDirection="down"
          onChange={(transitionEaseCurve) => onChange({ transitionEaseCurve })}
        />
      </div>

      <FormRange
        name="transitionDuration"
        label={`Transition duration · ${(
          settings.transitionDuration ?? DEFAULT_TRANSITION_DURATION
        ).toFixed(1)}s`}
        min={0.1}
        max={2}
        step={0.1}
        value={settings.transitionDuration ?? DEFAULT_TRANSITION_DURATION}
        isDisabled={isDisabled || !hasTransition}
        showValue={false}
        onChange={(event) =>
          onChange({ transitionDuration: Number(event.target.value) })
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Switch
          aria-label="Burn in captions"
          label="Burn in captions"
          description="Render captions onto the merged video"
          isChecked={settings.isCaptionsEnabled}
          isDisabled={isDisabled}
          onCheckedChange={(isCaptionsEnabled) =>
            onChange({ isCaptionsEnabled })
          }
        />
        <Switch
          aria-label="Mute clip audio"
          label="Mute clip audio"
          description="Drop the audio from the source clips"
          isChecked={Boolean(settings.isMuteVideoAudio)}
          isDisabled={isDisabled}
          onCheckedChange={(isMuteVideoAudio) => onChange({ isMuteVideoAudio })}
        />
      </div>
    </div>
  );
}

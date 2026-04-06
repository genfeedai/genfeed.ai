'use client';

import {
  ButtonVariant,
  type IngredientFormat,
  VideoTransition,
} from '@genfeedai/enums';
import { formatDuration } from '@genfeedai/helpers';
import { formatVideos } from '@helpers/data/data/data.helper';
import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import {
  CONTROL_CLASS,
  FORMAT_ICONS,
  ICON_BUTTON_CLASS,
} from '@pages/studio/constants/prompt-bar.constants';
import type { VideoMergePromptBarProps } from '@props/prompt-bars/prompt-bars-video-merge.props';
import Button from '@ui/buttons/base/Button';
import FormCheckbox from '@ui/forms/selectors/checkbox/form-checkbox/FormCheckbox';
import FormDropdown from '@ui/forms/selectors/dropdown/form-dropdown/FormDropdown';
import FormRange from '@ui/forms/selectors/range/form-range/FormRange';
import EaseCurveSelector from '@ui/storyboard/EaseCurveSelector';
import {
  HiArrowsRightLeft,
  HiClock,
  HiMusicalNote,
  HiSquares2X2,
  HiXMark,
} from 'react-icons/hi2';
import { MdOutlineCropSquare } from 'react-icons/md';

const TRANSITION_OPTIONS = [
  {
    description: 'Hard cut, no transition',
    key: VideoTransition.NONE,
    label: 'None',
  },
  {
    description: 'Gradual blend between clips',
    key: VideoTransition.DISSOLVE,
    label: 'Dissolve',
  },
  {
    description: 'Fade through black',
    key: VideoTransition.FADE,
    label: 'Fade',
  },
  {
    description: 'Next clip wipes in from right',
    key: VideoTransition.WIPELEFT,
    label: 'Wipe Left',
  },
  {
    description: 'Next clip wipes in from left',
    key: VideoTransition.WIPERIGHT,
    label: 'Wipe Right',
  },
  {
    description: 'Circular reveal expanding outward',
    key: VideoTransition.CIRCLEOPEN,
    label: 'Circle Open',
  },
  {
    description: 'Circular reveal shrinking inward',
    key: VideoTransition.CIRCLECLOSE,
    label: 'Circle Close',
  },
  {
    description: 'Push previous clip off to the left',
    key: VideoTransition.SLIDELEFT,
    label: 'Slide Left',
  },
  {
    description: 'Push previous clip off to the right',
    key: VideoTransition.SLIDERIGHT,
    label: 'Slide Right',
  },
];

export default function PromptBarsVideoMerge({
  storyboard,

  onFormatChange,
  onCaptionsToggle,
  onTransitionChange,
  onTransitionDurationChange,
  onTransitionEaseCurveChange,
  onOpenMusicModal,
  onMuteVideoAudioToggle,
  onMusicVolumeChange,

  onMergeVideos,
  onClearAll,

  isMerging = false,
  canMerge = false,
  selectedMusic = null,

  totalFrames,
  completedFrames,
  totalDuration,
}: VideoMergePromptBarProps) {
  const formatIcon = FORMAT_ICONS[storyboard.format] ?? <MdOutlineCropSquare />;

  return (
    <div className="w-full h-full flex flex-col min-h-0 relative shadow-2xl shadow-black/30">
      <div
        className={cn(
          BG_BLUR,
          BORDER_WHITE_30,
          'sticky bottom-0 flex-shrink-0 z-50 shadow-lg flex flex-col transition-all duration-300',
          'p-2 space-y-2 overflow-visible',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FormDropdown
              name="format"
              icon={formatIcon}
              label="Format"
              value={storyboard.format}
              isNoneEnabled={false}
              isDisabled={isMerging}
              isFullWidth={false}
              className={CONTROL_CLASS}
              dropdownDirection="up"
              onChange={(e) =>
                onFormatChange(e.target.value as IngredientFormat)
              }
              options={formatVideos.map((format) => ({
                icon: format.icon,
                key: format.id,
                label: format.label,
              }))}
            />

            <Button
              onClick={onOpenMusicModal}
              className={ICON_BUTTON_CLASS}
              isDisabled={isMerging}
              icon={<HiMusicalNote className="w-4 h-4" />}
              tooltipPosition="top"
              tooltip={
                selectedMusic
                  ? selectedMusic.metadataLabel || 'Change music'
                  : 'Add music'
              }
            />

            {selectedMusic && (
              <div className="flex items-center gap-2 w-24">
                <FormRange
                  name="musicVolume"
                  value={storyboard.musicVolume || 50}
                  min={0}
                  max={100}
                  step={1}
                  className="range-xs"
                  showValue={false}
                  isDisabled={isMerging}
                  onChange={(e) =>
                    onMusicVolumeChange(parseInt(e.target.value, 10))
                  }
                />
                <span className="text-xs text-foreground/60 w-8">
                  {storyboard.musicVolume || 50}%
                </span>
              </div>
            )}

            <FormCheckbox
              name="isMuteVideoAudio"
              label="Mute"
              isChecked={storyboard.isMuteVideoAudio || false}
              isDisabled={isMerging}
              onChange={(e) => onMuteVideoAudioToggle(e.target.checked)}
            />

            <FormCheckbox
              name="isCaptionsEnabled"
              label="Captions"
              isChecked={storyboard.isCaptionsEnabled}
              isDisabled={isMerging}
              onChange={(e) => onCaptionsToggle(e.target.checked)}
            />
          </div>

          <div className="flex items-center gap-4 text-sm text-foreground/60">
            <div className="flex items-center gap-2.5">
              <HiSquares2X2 className="w-3.5 h-3.5" />
              <span>
                {completedFrames}/{totalFrames}
              </span>
            </div>

            {totalDuration > 0 && (
              <div className="flex items-center gap-2.5">
                <HiClock className="w-3.5 h-3.5" />
                <span>{formatDuration(totalDuration)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <EaseCurveSelector
              value={storyboard.transitionEaseCurve}
              onChange={onTransitionEaseCurveChange}
              label="Ease"
              placeholder="Linear"
              isDisabled={isMerging}
              className={CONTROL_CLASS}
              dropdownDirection="up"
              isFullWidth={false}
            />

            <FormDropdown
              name="transition"
              icon={<HiArrowsRightLeft />}
              label="Transition"
              value={storyboard.transition || VideoTransition.NONE}
              isNoneEnabled={false}
              isDisabled={isMerging}
              isFullWidth={false}
              className={CONTROL_CLASS}
              dropdownDirection="up"
              options={TRANSITION_OPTIONS}
              onChange={(e) =>
                onTransitionChange(e.target.value as VideoTransition)
              }
            />

            {storyboard.transition &&
              storyboard.transition !== VideoTransition.NONE && (
                <div className="flex items-center gap-2">
                  <FormRange
                    name="transitionDuration"
                    value={storyboard.transitionDuration || 0.5}
                    min={0.1}
                    max={2}
                    step={0.1}
                    className="range-xs w-20"
                    showValue={false}
                    isDisabled={isMerging}
                    onChange={(e) =>
                      onTransitionDurationChange(parseFloat(e.target.value))
                    }
                  />
                  <span className="text-xs text-foreground/60 w-8">
                    {storyboard.transitionDuration || 0.5}s
                  </span>
                </div>
              )}
          </div>

          <div className="flex items-center gap-2">
            {totalFrames > 0 && (
              <Button
                onClick={onClearAll}
                className={ICON_BUTTON_CLASS}
                isDisabled={isMerging}
                icon={<HiXMark className="w-4 h-4" />}
                tooltip="Clear all frames"
                tooltipPosition="top"
              />
            )}

            <Button
              onClick={onMergeVideos}
              isDisabled={!canMerge || isMerging}
              isLoading={isMerging}
              icon={<HiArrowsRightLeft className="w-4 h-4" />}
              label={isMerging ? 'Merging...' : 'Apply'}
              variant={
                isMerging ? ButtonVariant.DESTRUCTIVE : ButtonVariant.DEFAULT
              }
              className="transition-all duration-300"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

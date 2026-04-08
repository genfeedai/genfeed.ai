'use client';

import { ButtonVariant, type IngredientFormat } from '@genfeedai/enums';
import { formatVideos } from '@helpers/data/data/data.helper';
import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import {
  CONTROL_CLASS,
  FORMAT_ICONS,
  ICON_BUTTON_CLASS,
} from '@pages/studio/constants/prompt-bar.constants';
import type { ImageMergePromptBarProps } from '@props/prompt-bars/prompt-bars-image-merge.props';
import { Button } from '@ui/primitives/button';
import FormDropdown from '@ui/primitives/dropdown-field';
import { Input } from '@ui/primitives/input';
import type { ReactNode } from 'react';
import { HiArrowUp, HiSquares2X2, HiXMark } from 'react-icons/hi2';
import { MdOutlineCropSquare } from 'react-icons/md';

export default function PromptBarsImageMerge({
  storyboard,
  onFormatChange,
  onMergeImages,
  onClearAll,
  isMerging = false,
  canMerge = false,
  totalFrames,
  completedFrames,
  mergePrompt,
  onMergePromptChange,
}: ImageMergePromptBarProps): ReactNode {
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
        <div className="mx-auto flex w-full items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
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

            <Input
              name="mergePrompt"
              type="text"
              placeholder="Optional: Describe the scene..."
              value={mergePrompt}
              onChange={(e) => onMergePromptChange(e.target.value)}
              className="input-sm w-64"
              isDisabled={isMerging}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 text-sm text-foreground/60">
              <div className="flex items-center gap-2.5">
                <HiSquares2X2 className="w-3.5 h-3.5" />
                <span>
                  {completedFrames}/{totalFrames}
                </span>
              </div>
            </div>

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
              variant={
                isMerging ? ButtonVariant.DESTRUCTIVE : ButtonVariant.GENERATE
              }
              icon={<HiArrowUp />}
              label={`Merge ${completedFrames}`}
              onClick={onMergeImages}
              isDisabled={!canMerge || isMerging}
              isLoading={isMerging}
              wrapperClassName="w-auto"
              className="px-6 transition-all duration-300"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type {
  GeneratedPromptCardProps,
  PromptMetadataTagProps,
} from '@props/studio/prompt-generator.props';
import { Button } from '@ui/primitives/button';
import { memo, useCallback } from 'react';
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineBolt,
  HiOutlineCamera,
  HiOutlineFilm,
  HiOutlineLightBulb,
  HiOutlinePaintBrush,
  HiOutlinePhoto,
  HiOutlineSun,
  HiXMark,
} from 'react-icons/hi2';

const MEDIA_ICON = {
  image: HiOutlinePhoto,
  video: HiOutlineFilm,
} as const;

/**
 * GeneratedPromptCard - Displays a generated prompt with Quick Generate and Customize actions.
 * Used in the Prompt Generator feature to show AI-generated prompts with metadata tags.
 */
const GeneratedPromptCard = memo(function GeneratedPromptCard({
  prompt,
  targetMedia,
  onQuickGenerate,
  onCustomize,
  onReject,
  isGenerating = false,
  generatingType = null,
}: GeneratedPromptCardProps) {
  const MediaIcon = MEDIA_ICON[targetMedia];

  const handleQuickGenerate = useCallback(() => {
    onQuickGenerate(prompt, targetMedia);
  }, [onQuickGenerate, prompt, targetMedia]);

  const handleCustomize = useCallback(() => {
    onCustomize(prompt, targetMedia);
  }, [onCustomize, prompt, targetMedia]);

  const handleReject = useCallback(() => {
    onReject(prompt.id);
  }, [onReject, prompt.id]);

  const isCurrentlyGenerating = isGenerating && generatingType !== null;

  return (
    <article
      className={cn(
        'relative group',
        'bg-white/[0.03] border border-white/[0.08]',
        'transition-all duration-300 ease-out',
        'hover:border-white/[0.15] hover:bg-white/[0.05]',
        prompt.isRejected && 'opacity-40 pointer-events-none',
      )}
    >
      {/* Reject button */}
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={handleReject}
        className={cn(
          'absolute top-3 right-3 z-10',
          'p-1 rounded-full',
          'text-white/30 hover:text-white/70',
          'bg-white/[0.04] hover:bg-white/[0.1]',
          'transition-all duration-200',
          'opacity-0 group-hover:opacity-100',
        )}
        ariaLabel="Dismiss prompt"
        icon={<HiXMark className="w-4 h-4" />}
      />

      <div className="p-5 space-y-4">
        {/* Prompt text */}
        <div className="pr-8">
          <p className="text-sm text-foreground/90 leading-relaxed">
            {prompt.text}
          </p>
        </div>

        {/* Metadata tags */}
        <div className="flex flex-wrap gap-2">
          {prompt.style && (
            <MetadataTag
              icon={<HiOutlinePaintBrush className="w-3 h-3" />}
              label={prompt.style}
            />
          )}
          {prompt.mood && (
            <MetadataTag
              icon={<HiOutlineLightBulb className="w-3 h-3" />}
              label={prompt.mood}
            />
          )}
          {prompt.camera && (
            <MetadataTag
              icon={<HiOutlineCamera className="w-3 h-3" />}
              label={prompt.camera}
            />
          )}
          {prompt.lighting && (
            <MetadataTag
              icon={<HiOutlineSun className="w-3 h-3" />}
              label={prompt.lighting}
            />
          )}
          {prompt.cameraMovement && (
            <MetadataTag
              icon={<HiOutlineFilm className="w-3 h-3" />}
              label={prompt.cameraMovement}
            />
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            icon={<HiOutlineBolt className="w-4 h-4" />}
            onClick={handleQuickGenerate}
            isLoading={isCurrentlyGenerating && generatingType === targetMedia}
            isDisabled={isCurrentlyGenerating}
            className="flex-1"
          >
            Quick Generate
          </Button>

          <Button
            variant={ButtonVariant.OUTLINE}
            size={ButtonSize.SM}
            icon={<HiOutlineAdjustmentsHorizontal className="w-4 h-4" />}
            onClick={handleCustomize}
            isDisabled={isCurrentlyGenerating}
            className="flex-1"
          >
            Customize
          </Button>
        </div>

        {/* Media type indicator */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MediaIcon className="w-3 h-3" />
          <span className="capitalize">{targetMedia}</span>
          <span className="text-white/20">|</span>
          <span className="capitalize">{prompt.format}</span>
        </div>
      </div>
    </article>
  );
});

/**
 * MetadataTag - Small inline tag displaying a prompt metadata value with an icon
 */
function MetadataTag({ icon, label }: PromptMetadataTagProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground bg-white/[0.04] border border-white/[0.06] rounded-full">
      {icon}
      {label}
    </span>
  );
}

export default GeneratedPromptCard;

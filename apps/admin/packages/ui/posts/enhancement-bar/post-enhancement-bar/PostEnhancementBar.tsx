'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  IngredientCategory,
} from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import CaptionGeneratorButton from '@ui/ai/caption-generator/CaptionGeneratorButton';
import HashtagGeneratorButton from '@ui/ai/hashtag-generator/HashtagGeneratorButton';
import Button from '@ui/buttons/base/Button';
import Spinner from '@ui/feedback/spinner/Spinner';
import type {
  PostEnhancementBarProps,
  TweetTone,
} from '@ui/posts/enhancement-bar/PostEnhancementBar.props';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  HiArrowsPointingIn,
  HiArrowUp,
  HiCheck,
  HiChevronDown,
  HiExclamationCircle,
  HiLanguage,
  HiPhoto,
  HiPlus,
  HiRocketLaunch,
  HiSparkles,
  HiTrash,
} from 'react-icons/hi2';

const _DEFAULT_TEXT_MODEL_COST = EnvironmentService.TEXT_MODEL_DEFAULT_COST;

export const QUICK_ACTIONS = [
  {
    icon: HiArrowsPointingIn,
    key: 'shorten' as const,
    label: 'Shorten',
    prompt:
      'Make this content shorter and more concise while keeping the key message',
    tooltip: 'Shorten content (1 credit)',
  },
  {
    icon: HiLanguage,
    key: 'simplify' as const,
    label: 'Simplify',
    prompt: 'Simplify the language to make it easier to understand',
    tooltip: 'Simplify language (1 credit)',
  },
  {
    icon: HiRocketLaunch,
    key: 'boost' as const,
    label: 'Boost',
    prompt:
      'Make this post more engaging and optimized for social media. Add compelling hooks, clear value proposition, and strong call-to-action. Keep it concise and shareable.',
    tooltip: 'Boost post for social media (1 credit)',
  },
] as const;

export const TONE_OPTIONS: { key: TweetTone; label: string }[] = [
  { key: 'professional', label: 'Professional' },
  { key: 'casual', label: 'Casual' },
  { key: 'viral', label: 'Viral' },
  { key: 'educational', label: 'Educational' },
  { key: 'humorous', label: 'Humorous' },
];

// Consistent button sizing
const BTN_ICON_CLASS = 'h-9 w-9 min-h-0 p-0';

/**
 * Unified enhancement bar for post enhancement.
 * Combines quick actions (Shorten, Simplify, Boost) with custom prompt input and tone selector.
 * Positioned as sticky bar below the post card for better visibility.
 */
export default function PostEnhancementBar({
  postId,
  onQuickAction,
  onPromptEnhance,
  isEnhancing,
  enhancingAction,
  hasContent = true,
  placeholder = 'Describe how to enhance this post...',
  className = '',
  onSelectMedia,
  onGenerateIllustration,
  selectedMedia = [],
  isSavingMedia = false,
  onSave,
  isDirty = false,
  isSaving = false,
  onAddPost,
  showAddPost = false,
  onDelete,
  showDelete = false,
  selectedTone = 'professional',
  onToneChange,
  postContent,
  postPlatform,
  onInsertHashtag,
  onAcceptCaption,
}: PostEnhancementBarProps) {
  const [prompt, setPrompt] = useState('');
  const [localTone, setLocalTone] = useState<TweetTone>(selectedTone);

  // Sync localTone with selectedTone prop when it changes (only when not controlled)
  useEffect(() => {
    if (!onToneChange) {
      setLocalTone(selectedTone);
    }
  }, [selectedTone, onToneChange]);

  const currentTone = onToneChange ? selectedTone : localTone;
  const handleToneChange = (tone: TweetTone) => {
    if (onToneChange) {
      onToneChange(tone);
    } else {
      setLocalTone(tone);
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || isEnhancing) {
      return;
    }

    try {
      await onPromptEnhance(postId, prompt.trim(), currentTone);
      setPrompt(''); // Clear on success
    } catch {
      // Error handled by parent
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const mediaCount = selectedMedia.length;
  const hasMedia = mediaCount > 0;
  const firstMedia = selectedMedia[0];

  return (
    <div
      className={`sticky top-4 z-10 mt-4 flex items-center gap-2 border border-white/[0.08] bg-card p-2 shadow-lg ${className}`}
    >
      {/* Quick Actions - Icon only */}
      <div className="flex items-center gap-1">
        {QUICK_ACTIONS.map((action) => {
          const isThisActionEnhancing =
            isEnhancing && enhancingAction === action.key;
          const Icon = action.icon;

          return (
            <Button
              key={action.key}
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.ICON}
              className={BTN_ICON_CLASS}
              tooltip={action.tooltip}
              tooltipPosition="top"
              isDisabled={isEnhancing || !hasContent}
              onClick={() =>
                onQuickAction(postId, action.prompt, action.key, currentTone)
              }
              icon={
                isThisActionEnhancing ? (
                  <Spinner size={ComponentSize.XS} />
                ) : (
                  <Icon size={16} />
                )
              }
            />
          );
        })}

        {/* AI Generator Buttons */}
        {onInsertHashtag && postContent && postPlatform && (
          <HashtagGeneratorButton
            content={postContent}
            platform={postPlatform}
            onInsert={onInsertHashtag}
            isDisabled={isEnhancing}
          />
        )}

        {onAcceptCaption && postContent && (
          <CaptionGeneratorButton
            content={postContent}
            platform={postPlatform}
            onAccept={onAcceptCaption}
            isDisabled={isEnhancing}
          />
        )}
      </div>

      <PromptBarDivider />

      {/* Tone Selector */}
      <div className="relative group">
        <Button
          type="button"
          variant={ButtonVariant.UNSTYLED}
          className="inline-flex items-center justify-center border border-input bg-secondary/50 text-secondary-foreground text-sm h-9 min-h-0 gap-1 px-2 hover:bg-secondary/70"
        >
          <span className="text-xs capitalize">{currentTone}</span>
          <HiChevronDown size={14} />
        </Button>

        <ul className="absolute bottom-full mb-2 left-0 hidden group-hover:block bg-background z-50 w-36 p-2 shadow-lg border border-white/[0.08]">
          {TONE_OPTIONS.map((option) => (
            <li key={option.key}>
              <Button
                type="button"
                variant={ButtonVariant.UNSTYLED}
                className={`w-full text-left text-sm px-3 py-2 hover:bg-accent ${currentTone === option.key ? 'bg-primary/10 text-primary' : ''}`}
                onClick={() => handleToneChange(option.key)}
              >
                {option.label}
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <PromptBarDivider />

      {/* Custom Prompt Input + Enhance Button */}
      <div className="flex flex-1 items-center gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isEnhancing}
          className="h-9 min-h-0 flex-1 bg-background border border-white/[0.08] px-3 text-sm focus:outline-none focus:border-primary"
        />

        <Button
          variant={ButtonVariant.GENERATE}
          icon={<HiArrowUp />}
          isLoading={isEnhancing && !enhancingAction}
          isDisabled={!prompt.trim() || isEnhancing}
          onClick={handleSubmit}
          tooltip="Enhance"
          tooltipPosition="top"
          size={ButtonSize.SM}
          className="h-9 min-h-0 px-3"
        />
      </div>

      {/* Action Buttons */}
      {(onSelectMedia || onSave || showAddPost || showDelete) && (
        <>
          <PromptBarDivider />

          <div className="flex items-center gap-1">
            {/* Delete Button - separated from other actions */}
            {showDelete && onDelete && (
              <>
                <Button
                  icon={<HiTrash className="w-4 h-4" />}
                  variant={ButtonVariant.DESTRUCTIVE}
                  size={ButtonSize.ICON}
                  className={BTN_ICON_CLASS}
                  tooltip="Delete post"
                  tooltipPosition="top"
                  onClick={onDelete}
                />
                <PromptBarDivider />
              </>
            )}

            {/* Add Post Button */}
            {showAddPost && onAddPost && (
              <Button
                label="Add"
                icon={<HiPlus className="w-3.5 h-3.5" />}
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
                className="h-9 min-h-0 px-2 gap-1"
                onClick={onAddPost}
                tooltip="Add post to thread"
                tooltipPosition="top"
              />
            )}

            {/* Media Button */}
            {onSelectMedia && (
              <Button
                tooltipPosition="top"
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.ICON}
                className={BTN_ICON_CLASS}
                onClick={onSelectMedia}
                tooltip={hasMedia ? `Media (${mediaCount})` : 'Select media'}
                isDisabled={isSavingMedia}
                icon={
                  hasMedia && firstMedia ? (
                    <div className="relative w-5 h-5 overflow-hidden">
                      <Image
                        src={
                          firstMedia.category === IngredientCategory.VIDEO
                            ? firstMedia.thumbnailUrl ||
                              `${EnvironmentService.ingredientsEndpoint}/videos/${firstMedia.id}`
                            : `${EnvironmentService.ingredientsEndpoint}/images/${firstMedia.id}`
                        }
                        alt="Media"
                        className="w-full h-full object-cover"
                        width={20}
                        height={20}
                        sizes="20px"
                        priority
                      />
                      {mediaCount > 1 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-[10px] font-bold">
                          {mediaCount}
                        </div>
                      )}
                    </div>
                  ) : (
                    <HiPhoto className="w-4 h-4" />
                  )
                }
              />
            )}

            {/* Generate Illustration Button */}
            {onGenerateIllustration && (
              <Button
                tooltipPosition="top"
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.ICON}
                className={BTN_ICON_CLASS}
                onClick={onGenerateIllustration}
                tooltip="Generate illustration"
                icon={<HiSparkles className="w-4 h-4" />}
              />
            )}

            {/* Save Button - shows check when saved, save icon when dirty */}
            {onSave && (
              <Button
                icon={
                  isDirty ? (
                    <HiExclamationCircle className="w-4 h-4" />
                  ) : (
                    <HiCheck className="w-4 h-4" />
                  )
                }
                variant={
                  isDirty ? ButtonVariant.DEFAULT : ButtonVariant.DEFAULT
                }
                size={ButtonSize.ICON}
                className={`${BTN_ICON_CLASS} ${isDirty ? 'bg-warning text-warning-foreground hover:bg-warning/90' : 'bg-success text-success-foreground hover:bg-success/90'}`}
                isLoading={isSaving}
                isDisabled={!isDirty || isSaving}
                onClick={onSave}
                tooltip={isDirty ? 'Save changes' : 'Saved'}
                tooltipPosition="top"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

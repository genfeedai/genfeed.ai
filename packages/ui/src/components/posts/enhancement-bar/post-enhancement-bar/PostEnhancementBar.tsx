'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import { stripHtmlToPlainText } from '@genfeedai/helpers/security/sanitize-html.helper';
import { usePromptBarSubmission } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-submission/use-prompt-bar-submission';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import CaptionGeneratorButton from '@ui/ai/caption-generator/CaptionGeneratorButton';
import HashtagGeneratorButton from '@ui/ai/hashtag-generator/HashtagGeneratorButton';
import type {
  PostEnhancementBarProps,
  TweetTone,
} from '@ui/posts/enhancement-bar/PostEnhancementBar.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Input } from '@ui/primitives/input';
import {
  ArrowUp,
  Check,
  ChevronDown,
  ImageIcon,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { QUICK_ACTIONS, TONE_OPTIONS } from './post-enhancement-bar.helpers';

const EMPTY_ARRAY: never[] = [];

interface RewriteProposal {
  label: string;
  text: string;
  tone: TweetTone;
}

interface RewriteRequest {
  label: string;
  run: () => Promise<string | null>;
}

/**
 * Assist and action area of the post composer.
 *
 * Renders inside the composer surface (no surface of its own): labeled AI
 * rewrite chips, a prompt row with a tone menu, and the media / thread / save
 * footer. AI output is shown as a proposal and only replaces the text when the
 * user accepts it.
 */
export default function PostEnhancementBar({
  postId,
  onQuickAction,
  onPromptEnhance,
  onApplyProposal,
  currentContent = '',
  isEnhancing,
  hasContent = true,
  placeholder = 'Ask AI to rewrite, e.g. “open with the result”',
  className = '',
  onSelectMedia,
  onGenerateIllustration,
  selectedMedia = EMPTY_ARRAY,
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
  const [localTone, setLocalTone] = useState<TweetTone>(selectedTone);
  const [proposal, setProposal] = useState<RewriteProposal | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const lastRequestRef = useRef<RewriteRequest | null>(null);

  // Sync localTone with selectedTone prop when it changes (only when not controlled)
  useEffect(() => {
    if (!onToneChange) {
      setLocalTone(selectedTone);
    }
  }, [selectedTone, onToneChange]);

  const currentTone = onToneChange ? selectedTone : localTone;
  const toneLabel =
    TONE_OPTIONS.find((option) => option.key === currentTone)?.label ??
    currentTone;

  const handleToneChange = (value: string) => {
    const tone = value as TweetTone;
    if (onToneChange) {
      onToneChange(tone);
    } else {
      setLocalTone(tone);
    }
  };

  const requestRewrite = async (request: RewriteRequest): Promise<boolean> => {
    lastRequestRef.current = request;
    setPendingLabel(request.label);

    try {
      const text = await request.run();
      if (!text) {
        return false;
      }
      setProposal({ label: request.label, text, tone: currentTone });
      return true;
    } finally {
      setPendingLabel(null);
    }
  };

  // Trim, in-flight guard, clear-on-success and Enter-to-submit are shared with
  // every other prompt bar; only the tone-aware payload is local to this surface.
  const { handleKeyDown, handleSubmit, isSubmitDisabled, prompt, setPrompt } =
    usePromptBarSubmission({
      isEnhancing: isEnhancing || pendingLabel !== null,
      onSubmit: async (trimmedPrompt: string) => {
        const isOk = await requestRewrite({
          label: 'Your instruction',
          run: () => onPromptEnhance(postId, trimmedPrompt, currentTone),
        });
        if (!isOk) {
          // Rejecting keeps the prompt so the user can retry.
          throw new Error('Rewrite failed');
        }
      },
    });

  const handleQuickAction = (action: (typeof QUICK_ACTIONS)[number]) => {
    void requestRewrite({
      label: action.label,
      run: () => onQuickAction(postId, action.prompt, action.key, currentTone),
    });
  };

  const handleAccept = () => {
    if (!proposal) {
      return;
    }
    onApplyProposal?.(proposal.text);
    setProposal(null);
  };

  const handleRetry = () => {
    if (lastRequestRef.current) {
      void requestRewrite(lastRequestRef.current);
    }
  };

  const isBusy = isEnhancing || pendingLabel !== null;
  const mediaCount = selectedMedia.length;
  const hasMedia = mediaCount > 0;
  const firstMedia = selectedMedia[0];
  const hasFooter = !!(
    onSelectMedia ||
    onGenerateIllustration ||
    onSave ||
    showAddPost ||
    showDelete
  );
  const beforeText = stripHtmlToPlainText(currentContent);
  const proposedText = proposal ? stripHtmlToPlainText(proposal.text) : '';

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {(proposal || pendingLabel) && (
        <section
          aria-live="polite"
          aria-label="AI rewrite"
          className="mx-3 mb-3 overflow-hidden rounded-lg border border-border-strong bg-tertiary"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 pl-3 pr-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-agent">
              <Sparkles className="size-3.5" />
              <span>{proposal?.label ?? pendingLabel}</span>
              <span className="font-normal text-muted-foreground">
                {pendingLabel ? '· Rewriting…' : `· ${toneLabelFor(proposal)}`}
              </span>
            </p>
            {proposal && !pendingLabel && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  label="Discard"
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                  textTransform="none"
                  onClick={() => setProposal(null)}
                />
                <Button
                  label="Try again"
                  icon={<RefreshCw className="size-3.5" />}
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  textTransform="none"
                  isDisabled={isBusy}
                  onClick={handleRetry}
                />
                <Button
                  label="Replace text"
                  icon={<Check className="size-3.5" />}
                  variant={ButtonVariant.DEFAULT}
                  size={ButtonSize.SM}
                  textTransform="none"
                  onClick={handleAccept}
                />
              </div>
            )}
          </div>

          {pendingLabel ? (
            <div className="grid gap-2 p-3" aria-hidden="true">
              <div className="h-3 w-11/12 animate-pulse rounded bg-hover" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-hover" />
            </div>
          ) : (
            <div className="grid gap-2 p-3">
              {beforeText && (
                <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground line-through decoration-border-strong">
                  {beforeText}
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {proposedText}
              </p>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-col gap-2.5 border-t border-border p-3">
        <div
          role="group"
          aria-label="AI rewrite"
          className="flex flex-wrap items-center gap-1.5"
        >
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.key}
                label={action.label}
                icon={<Icon className="size-3.5" />}
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
                textTransform="none"
                isDisabled={isBusy || !hasContent}
                onClick={() => handleQuickAction(action)}
              />
            );
          })}

          {onInsertHashtag && postContent && postPlatform && (
            <HashtagGeneratorButton
              content={postContent}
              platform={postPlatform}
              onInsert={onInsertHashtag}
              isDisabled={isBusy}
            />
          )}

          {onAcceptCaption && postContent && (
            <CaptionGeneratorButton
              content={postContent}
              platform={postPlatform}
              onAccept={onAcceptCaption}
              isDisabled={isBusy}
            />
          )}

          <span className="ml-auto text-2xs text-muted-foreground">
            1 credit per rewrite
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                label={toneLabel}
                icon={<ChevronDown className="size-3.5" />}
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
                textTransform="none"
                ariaLabel={`Tone: ${toneLabel}`}
                className="flex-row-reverse"
                isDisabled={isBusy}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuLabel>Tone for rewrites</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={currentTone}
                onValueChange={handleToneChange}
              >
                {TONE_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.key} value={option.key}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            isDisabled={isBusy}
            aria-label="Rewrite instruction"
            className="h-8 min-h-0 min-w-0 flex-1"
          />

          <Button
            ariaLabel="Enhance"
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.ICON}
            icon={<ArrowUp />}
            isLoading={isBusy && pendingLabel === 'Your instruction'}
            isDisabled={isSubmitDisabled}
            onClick={handleSubmit}
            tooltip="Rewrite"
            tooltipPosition="top"
          />
        </div>
      </div>

      {hasFooter && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
          <div className="flex flex-wrap items-center gap-1">
            {onSelectMedia && (
              <Button
                ariaLabel={
                  hasMedia ? `Change media (${mediaCount})` : 'Add media'
                }
                label={hasMedia ? `Media (${mediaCount})` : 'Add media'}
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
                textTransform="none"
                onClick={onSelectMedia}
                isDisabled={isSavingMedia}
                icon={
                  hasMedia && firstMedia ? (
                    <div className="relative size-5 shrink-0 overflow-hidden rounded-sm">
                      <Image
                        src={
                          firstMedia.category === IngredientCategory.VIDEO
                            ? firstMedia.thumbnailUrl ||
                              `${EnvironmentService.ingredientsEndpoint}/videos/${firstMedia.id}`
                            : `${EnvironmentService.ingredientsEndpoint}/images/${firstMedia.id}`
                        }
                        alt=""
                        className="size-full object-cover outline-media"
                        width={20}
                        height={20}
                        sizes="20px"
                      />
                    </div>
                  ) : (
                    <ImageIcon className="size-4" />
                  )
                }
              />
            )}

            {onGenerateIllustration && (
              <Button
                label="Generate illustration"
                icon={<Sparkles className="size-4" />}
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
                textTransform="none"
                onClick={onGenerateIllustration}
              />
            )}

            {showAddPost && onAddPost && (
              <Button
                label="Add to thread"
                icon={<Plus className="size-4" />}
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
                textTransform="none"
                onClick={onAddPost}
              />
            )}

            {showDelete && onDelete && (
              <Button
                ariaLabel="Delete post"
                icon={<Trash2 className="size-4" />}
                variant={ButtonVariant.GHOST}
                size={ButtonSize.ICON}
                tooltip="Delete post"
                tooltipPosition="top"
                onClick={onDelete}
              />
            )}
          </div>

          {onSave && (
            <div className="flex items-center gap-2">
              <p
                role="status"
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-1.5 rounded-full',
                    isSaving
                      ? 'animate-pulse bg-muted-foreground'
                      : isDirty
                        ? 'bg-warning'
                        : 'bg-success',
                  )}
                />
                {isSaving ? 'Saving…' : isDirty ? 'Unsaved changes' : 'Saved'}
              </p>
              {isDirty && (
                <Button
                  label="Save"
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  textTransform="none"
                  isLoading={isSaving}
                  onClick={onSave}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function toneLabelFor(proposal: RewriteProposal | null): string {
  const tone = proposal?.tone;
  return (
    TONE_OPTIONS.find((option) => option.key === tone)?.label ?? 'Professional'
  );
}

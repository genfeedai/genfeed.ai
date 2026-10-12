'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { PostQuickActionKey } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers';
import { stripHtmlToPlainText } from '@genfeedai/helpers/security/sanitize-html.helper';
import { usePromptBarSubmission } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-submission/use-prompt-bar-submission';
import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import type {
  PostComposerPresetKey,
  PostComposerPromptBarProps,
  TweetTone,
} from '@ui/posts/composer-prompt-bar/PostComposerPromptBar.props';
import {
  type PostComposerPreset,
  QUICK_ACTION_KEYS,
  REWRITE_PRESETS,
  THREAD_PRESETS,
  TONE_KEYS,
} from '@ui/posts/composer-prompt-bar/post-composer-prompt-bar.helpers';
import { Button } from '@ui/primitives/button';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { Check, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

interface RewriteProposal {
  label: string;
  text: string;
  tone: TweetTone;
}

interface ThreadProposal {
  posts: Array<{ id: string; text: string }>;
  tone: TweetTone;
}

type PendingRequest =
  | {
      kind: 'rewrite';
      label: string;
      prompt: string;
      actionKey: PostQuickActionKey | null;
    }
  | { kind: 'thread'; label: string };

/**
 * Page-level AI composer for a post and its thread, built from the shared
 * prompt-bar pieces used by Agent and Storyboard. Presets cover rewrites and
 * thread building; every AI result is a proposal the user accepts or discards.
 */
export default function PostComposerPromptBar({
  targetLabel,
  targetContent,
  platformLabel,
  isBusy,
  canDraftThread = false,
  canEndWithGrok = false,
  canAddFirstComment = false,
  onRewrite,
  onApplyRewrite,
  onDraftThread,
  onAddThreadPosts,
  onEndWithGrok,
  onAddFirstComment,
  className,
}: PostComposerPromptBarProps) {
  const translate = useTranslations('ui.postComposerPromptBar');
  const customLabel = translate('yourInstruction');
  const toneSelectOptions = TONE_KEYS.map((key) => ({
    label: translate(`tones.${key}`),
    value: key,
  }));
  const [tone, setTone] = useState<TweetTone>('professional');
  const [proposal, setProposal] = useState<RewriteProposal | null>(null);
  const [threadProposal, setThreadProposal] = useState<ThreadProposal | null>(
    null,
  );
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [isAddingThread, setIsAddingThread] = useState(false);
  const lastRequestRef = useRef<PendingRequest | null>(null);

  const isRunning = isBusy || pendingLabel !== null || isAddingThread;
  const hasTargetContent = Boolean(stripHtmlToPlainText(targetContent));

  const run = async (request: PendingRequest): Promise<boolean> => {
    lastRequestRef.current = request;
    setPendingLabel(request.label);
    setProposal(null);
    setThreadProposal(null);

    try {
      if (request.kind === 'thread') {
        const texts = onDraftThread ? await onDraftThread(tone) : null;
        if (!texts || texts.length === 0) {
          return false;
        }
        const draftId = Date.now();
        setThreadProposal({
          posts: texts.map((text, position) => ({
            id: `draft-${draftId}-${position}`,
            text,
          })),
          tone,
        });
        return true;
      }

      const text = await onRewrite(request.prompt, request.actionKey, tone);
      if (!text) {
        return false;
      }
      setProposal({ label: request.label, text, tone });
      return true;
    } finally {
      setPendingLabel(null);
    }
  };

  // Trim, in-flight guard, clear-on-success and Enter-to-submit are shared with
  // every other prompt bar.
  const { handleSubmit, isSubmitDisabled, prompt, setPrompt } =
    usePromptBarSubmission({
      isEnhancing: isRunning,
      onSubmit: async (trimmedPrompt: string) => {
        const isOk = await run({
          actionKey: null,
          kind: 'rewrite',
          label: customLabel,
          prompt: trimmedPrompt,
        });
        if (!isOk) {
          // Rejecting keeps the prompt so the user can retry.
          throw new Error('Rewrite failed');
        }
      },
    });

  const presets: PostComposerPreset[] = [
    ...(canDraftThread ? [THREAD_PRESETS.thread] : []),
    ...(canEndWithGrok ? [THREAD_PRESETS.grok] : []),
    ...(canAddFirstComment ? [THREAD_PRESETS.comment] : []),
    ...REWRITE_PRESETS,
  ];

  const presetItems: PromptBarSuggestionItem[] = presets.map((preset) => {
    const Icon = preset.icon;
    return {
      icon: <Icon className="size-4" />,
      id: preset.key,
      label: translate(`presets.${preset.key}`),
      prompt: preset.prompt ? preset.prompt(platformLabel) : '',
    };
  });

  const runPreset = (key: PostComposerPresetKey) => {
    if (key === 'thread') {
      void run({ kind: 'thread', label: translate('presets.thread') });
      return;
    }
    if (key === 'grok') {
      onEndWithGrok?.();
      return;
    }
    if (key === 'comment') {
      onAddFirstComment?.();
      return;
    }

    const preset = REWRITE_PRESETS.find((item) => item.key === key);
    if (!preset?.prompt) {
      return;
    }
    void run({
      actionKey: QUICK_ACTION_KEYS.has(key)
        ? (key as PostQuickActionKey)
        : null,
      kind: 'rewrite',
      label: translate(`presets.${preset.key}`),
      prompt: preset.prompt(platformLabel),
    });
  };

  const handleRetry = () => {
    if (lastRequestRef.current) {
      void run(lastRequestRef.current);
    }
  };

  const handleAcceptRewrite = () => {
    if (!proposal) {
      return;
    }
    onApplyRewrite(proposal.text);
    setProposal(null);
  };

  const handleAddThread = async () => {
    if (!threadProposal || !onAddThreadPosts) {
      return;
    }
    setIsAddingThread(true);
    try {
      await onAddThreadPosts(threadProposal.posts.map((post) => post.text));
      setThreadProposal(null);
    } finally {
      setIsAddingThread(false);
    }
  };

  const isPresetRowVisible =
    !prompt.trim() && !proposal && !threadProposal && pendingLabel === null;

  const proposalActions = (
    acceptLabel: string,
    onAccept: () => void,
    onDiscard: () => void,
  ) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        label={translate('discard')}
        variant={ButtonVariant.GHOST}
        size={ButtonSize.SM}
        textTransform="none"
        isDisabled={isAddingThread}
        onClick={onDiscard}
      />
      <Button
        label={translate('tryAgain')}
        icon={<RefreshCw className="size-3.5" />}
        variant={ButtonVariant.SECONDARY}
        size={ButtonSize.SM}
        textTransform="none"
        isDisabled={isRunning}
        onClick={handleRetry}
      />
      <Button
        label={acceptLabel}
        icon={<Check className="size-3.5" />}
        variant={ButtonVariant.DEFAULT}
        size={ButtonSize.SM}
        textTransform="none"
        isLoading={isAddingThread}
        onClick={onAccept}
      />
    </div>
  );

  const resultPanel =
    pendingLabel || proposal || threadProposal ? (
      <section
        aria-live="polite"
        aria-label={
          threadProposal
            ? translate('proposedThreadAria')
            : translate('rewriteAria')
        }
        className="overflow-hidden rounded-lg border border-border-strong bg-card shadow-composer"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 pl-3 pr-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-agent">
            <Sparkles className="size-3.5" />
            <span>
              {pendingLabel ??
                (threadProposal
                  ? translate('proposedThread', {
                      count: threadProposal.posts.length,
                    })
                  : `${proposal?.label} · ${targetLabel}`)}
            </span>
            <span className="font-normal text-muted-foreground">
              {pendingLabel
                ? `· ${translate('writing')}`
                : `· ${translate(`tones.${threadProposal?.tone ?? proposal?.tone ?? tone}`)}`}
            </span>
          </p>
          {proposal && !pendingLabel
            ? proposalActions(
                translate('replaceText'),
                handleAcceptRewrite,
                () => setProposal(null),
              )
            : null}
          {threadProposal && !pendingLabel
            ? proposalActions(
                translate('addToThread'),
                () => void handleAddThread(),
                () => setThreadProposal(null),
              )
            : null}
        </div>

        {pendingLabel ? (
          <div className="grid gap-2 p-3" aria-hidden="true">
            <div className="h-3 w-11/12 animate-pulse rounded bg-hover" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-hover" />
          </div>
        ) : null}

        {proposal && !pendingLabel ? (
          <div className="grid gap-2 p-3">
            {hasTargetContent ? (
              <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground line-through decoration-border-strong">
                {stripHtmlToPlainText(targetContent)}
              </p>
            ) : null}
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
              {stripHtmlToPlainText(proposal.text)}
            </p>
          </div>
        ) : null}

        {threadProposal && !pendingLabel ? (
          <ol className="grid divide-y divide-border">
            {threadProposal.posts.map((draft, index) => (
              <li key={draft.id} className="grid gap-1 px-3 py-2.5">
                <span className="text-2xs font-medium text-muted-foreground">
                  {translate('postNumber', { number: index + 2 })}
                </span>
                <span className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {stripHtmlToPlainText(draft.text)}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    ) : null;

  return (
    <div className={cn('sticky bottom-4 z-10', className)}>
      <PromptBarContainer
        layoutMode="inflow"
        maxWidth="full"
        topContent={
          resultPanel || isPresetRowVisible ? (
            <div className="grid gap-3 pb-3">
              {resultPanel}
              {isPresetRowVisible ? (
                <PromptBarSuggestions
                  suggestions={presetItems}
                  maxSuggestions={presetItems.length}
                  isDisabled={isRunning || !hasTargetContent}
                  onSuggestionSelect={(item) =>
                    runPreset(item.id as PostComposerPresetKey)
                  }
                />
              ) : null}
            </div>
          ) : undefined
        }
      >
        <PromptBarComposer
          data-testid="post-composer-prompt-bar"
          density="compact"
          beforeBody={
            <p className="flex items-center gap-1.5 px-3.5 pt-2.5 text-2xs font-medium text-foreground/55">
              {translate('actingOn')}
              <span className="rounded bg-tertiary px-1.5 py-0.5 text-foreground/80">
                {targetLabel}
              </span>
            </p>
          }
        >
          <PromptEditor
            ariaLabel={translate('instructionAria')}
            value={prompt}
            isDisabled={isRunning}
            placeholder={translate('placeholder')}
            onValueChange={setPrompt}
            onSubmit={() => void handleSubmit()}
            className="min-h-12"
          />
          <PromptBarToolbar
            density="compact"
            leading={
              <PromptBarCompactSelect
                ariaLabel={translate('toneAria')}
                density="compact"
                isDisabled={isRunning}
                options={toneSelectOptions}
                value={tone}
                onChange={(value) => setTone(value as TweetTone)}
              />
            }
            trailing={
              <>
                <span className="text-2xs text-muted-foreground">
                  {translate('creditPerRun')}
                </span>
                <PromptBarSendButton
                  ariaLabel={translate('rewrite')}
                  density="compact"
                  isDisabled={isSubmitDisabled || !hasTargetContent}
                  isLoading={pendingLabel === customLabel}
                  onClick={() => void handleSubmit()}
                  tooltip={translate('rewrite')}
                />
              </>
            }
          />
        </PromptBarComposer>
      </PromptBarContainer>
    </div>
  );
}

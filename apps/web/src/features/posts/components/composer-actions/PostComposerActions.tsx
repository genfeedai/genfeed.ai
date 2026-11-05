'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { POST_ENHANCEMENT_CREDITS } from '@genfeedai/contracts/constants';
import type { PostQuickActionKey } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { stripHtmlToPlainText } from '@genfeedai/helpers/security/strip-html.helper';
import { Button } from '@ui/primitives/button';
import { Skeleton } from '@ui/primitives/skeleton';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import { Check, MessageSquare, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type {
  PostComposerActionsProps,
  PostComposerPresetKey,
  TweetTone,
} from '@/features/posts/components/composer-actions/PostComposerActions.props';
import {
  type PostComposerPreset,
  QUICK_ACTION_KEYS,
  REWRITE_PRESETS,
  THREAD_PRESETS,
  TONE_KEYS,
} from '@/features/posts/components/composer-actions/post-composer-actions.helpers';

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
 * One row of one-tap AI actions under the post: rewrite presets, thread
 * actions and a tone. Every AI result is a proposal the user accepts or
 * discards. Free-form instructions belong to the agent, which "Ask agent"
 * opens on this post's own conversation.
 */
export default function PostComposerActions({
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
  onAskAgent,
  className,
}: PostComposerActionsProps) {
  const translate = useTranslations('ui.postComposerActions');
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

  const run = async (request: PendingRequest): Promise<void> => {
    lastRequestRef.current = request;
    setPendingLabel(request.label);
    setProposal(null);
    setThreadProposal(null);

    try {
      if (request.kind === 'thread') {
        const texts = onDraftThread ? await onDraftThread(tone) : null;
        if (!texts || texts.length === 0) {
          return;
        }
        const draftId = Date.now();
        setThreadProposal({
          posts: texts.map((text, position) => ({
            id: `draft-${draftId}-${position}`,
            text,
          })),
          tone,
        });
        return;
      }

      const text = await onRewrite(request.prompt, request.actionKey, tone);
      if (text) {
        setProposal({ label: request.label, text, tone });
      }
    } finally {
      setPendingLabel(null);
    }
  };

  const presets: PostComposerPreset[] = [
    ...(canDraftThread ? [THREAD_PRESETS.thread] : []),
    ...(canEndWithGrok ? [THREAD_PRESETS.grok] : []),
    ...(canAddFirstComment ? [THREAD_PRESETS.comment] : []),
    ...REWRITE_PRESETS,
  ];

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
    } catch {
      // The page reports the failure; keep the proposal so nothing is lost.
    } finally {
      setIsAddingThread(false);
    }
  };

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
        className="overflow-hidden rounded-lg border border-border-strong bg-card"
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
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-3/4" />
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
    <section
      aria-label={translate('label')}
      className={cn('grid gap-2', className)}
    >
      {resultPanel}
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((preset) => {
          const Icon = preset.icon;
          return (
            <Button
              key={preset.key}
              label={translate(`presets.${preset.key}`)}
              icon={<Icon className="size-3.5" />}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              textTransform="none"
              isDisabled={isRunning || !hasTargetContent}
              onClick={() => runPreset(preset.key)}
            />
          );
        })}
        <PromptBarCompactSelect
          ariaLabel={translate('toneAria')}
          isDisabled={isRunning}
          options={toneSelectOptions}
          value={tone}
          onChange={(value) => setTone(value as TweetTone)}
        />
        <span className="ml-auto text-2xs text-muted-foreground">
          {translate('creditPerRun', { count: POST_ENHANCEMENT_CREDITS })}
        </span>
        {onAskAgent ? (
          <Button
            label={translate('askAgent')}
            icon={<MessageSquare className="size-3.5" />}
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            textTransform="none"
            onClick={onAskAgent}
          />
        ) : null}
      </div>
    </section>
  );
}

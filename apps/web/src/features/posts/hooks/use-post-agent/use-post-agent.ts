'use client';

import { useAgentDock } from '@contexts/ui/agent-dock-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  type AgentDraftSuggestionPayload,
  type SuggestedAction,
  useAgentDraftContext,
} from '@genfeedai/agent';
import { getPostsPlatformLabel } from '@helpers/content/posts.helper';
import { stripHtmlToPlainText } from '@helpers/security/strip-html.helper';
import { ClipboardCheck, Clock, Lightbulb } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createElement, useCallback, useMemo } from 'react';
import {
  type ProductWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfaceAdapter,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';
import { applyAgentTextToPost } from '@/features/posts/hooks/use-post-agent/post-agent.helpers';
import type {
  UsePostAgentOptions,
  UsePostAgentResult,
} from '@/features/posts/props/post-agent.props';

const SUGGESTION_ICONS = {
  hooks: Lightbulb,
  review: ClipboardCheck,
  timing: Clock,
} as const;

type SuggestionKey = keyof typeof SUGGESTION_ICONS;

const SUGGESTION_KEYS: SuggestionKey[] = ['hooks', 'review', 'timing'];

/**
 * Hands the agent the post being edited: the dock holds this post's own
 * conversation (never the master), every message carries the post, and the
 * agent's empty state suggests things to do with it. Text the agent writes
 * can be applied straight to the post.
 */
export function usePostAgent({
  post,
  descriptionDraft,
  labelDraft,
  isEnabled,
  onApplyText,
}: UsePostAgentOptions): UsePostAgentResult {
  const translate = useTranslations('pages.posts.detail.agent');
  const agentDock = useAgentDock();
  const { brandId, organizationId } = useBrand();

  const postId = post?.id;
  const label =
    labelDraft.trim() || post?.label?.trim() || translate('untitled');
  const platformLabel = post?.platform
    ? getPostsPlatformLabel(post.platform)
    : '';
  const isActive = isEnabled && Boolean(postId) && Boolean(organizationId);

  const registration = useMemo<ProductWorkspaceSurfaceAdapter | null>(() => {
    if (!isActive || !postId || !organizationId) {
      return null;
    }

    return {
      contextLabel: translate('contextLabel', { label }),
      references: [
        {
          label,
          reference: {
            ...(brandId ? { brandId } : {}),
            kind: 'post',
            organizationId,
            recordId: postId,
            serializer: 'post',
          },
        },
      ],
      scope: {
        ...(brandId ? { brandId } : {}),
        organizationId,
      },
      surfaceKey: 'publishing',
      threadKey: `post:${postId}`,
    };
  }, [brandId, isActive, label, organizationId, postId, translate]);

  useRegisterWorkspaceSurfaceAdapter(registration);

  const suggestedActions = useMemo<SuggestedAction[]>(
    () =>
      SUGGESTION_KEYS.map((key) => ({
        icon: createElement(SUGGESTION_ICONS[key], {
          className: 'size-5 text-foreground/50',
        }),
        label: translate(`suggestions.${key}.label`),
        prompt: translate(`suggestions.${key}.prompt`, {
          platform: platformLabel || translate('anyPlatform'),
        }),
      })),
    [platformLabel, translate],
  );

  const handleApplySuggestion = useCallback(
    (payload: AgentDraftSuggestionPayload) => {
      onApplyText(applyAgentTextToPost(descriptionDraft, payload));
    },
    [descriptionDraft, onApplyText],
  );

  useAgentDraftContext({
    body: stripHtmlToPlainText(descriptionDraft),
    contentFormat: platformLabel || undefined,
    draftType: 'post',
    isEnabled: isActive,
    onApplySuggestion: handleApplySuggestion,
    placeholder: translate('placeholder'),
    suggestedActions,
    title: label,
  });

  const openDock = agentDock?.open;
  const canOpenDock = isActive && Boolean(agentDock?.isAvailable);

  return {
    onAskAgent: canOpenDock && openDock ? openDock : undefined,
  };
}

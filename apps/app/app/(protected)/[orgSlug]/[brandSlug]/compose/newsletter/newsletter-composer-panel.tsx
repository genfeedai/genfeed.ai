'use client';

import {
  type AgentDraftSuggestionPayload,
  useAgentDraftContext,
} from '@genfeedai/agent';
import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { NewslettersService } from '@services/content/newsletters.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useReducer } from 'react';
import {
  HiArrowPathRoundedSquare,
  HiClipboardDocument,
  HiEnvelope,
  HiSparkles,
} from 'react-icons/hi2';

function stripHtml(value?: string): string {
  if (!value) {
    return '';
  }

  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyDraftSuggestionToHtml(
  currentContent: string,
  payload: AgentDraftSuggestionPayload,
): string {
  const suggestion = payload.text.trim();
  const selectedText = payload.selectedText?.trim();

  if (selectedText && currentContent.includes(selectedText)) {
    return currentContent.replace(selectedText, escapeHtml(suggestion));
  }

  const paragraph = `<p>${escapeHtml(suggestion)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')}</p>`;

  if (!currentContent.trim()) {
    return paragraph;
  }

  return `${currentContent}${paragraph}`;
}

type ComposerState = {
  topic: string;
  angle: string;
  instructions: string;
  label: string;
  summary: string;
  content: string;
  newsletterId: string;
  isGenerating: boolean;
  isSaving: boolean;
};

type ComposerAction =
  | {
      type: 'SET_FIELD';
      field: keyof Pick<
        ComposerState,
        | 'topic'
        | 'angle'
        | 'instructions'
        | 'label'
        | 'summary'
        | 'content'
        | 'newsletterId'
      >;
      value: string;
    }
  | { type: 'SET_GENERATING'; value: boolean }
  | { type: 'SET_SAVING'; value: boolean }
  | {
      type: 'APPLY_DRAFT';
      newsletterId: string;
      label: string;
      summary: string;
      content: string;
    };

const initialComposerState: ComposerState = {
  topic: '',
  angle: '',
  instructions: '',
  label: '',
  summary: '',
  content: '',
  newsletterId: '',
  isGenerating: false,
  isSaving: false,
};

function composerReducer(
  state: ComposerState,
  action: ComposerAction,
): ComposerState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.value };
    case 'SET_SAVING':
      return { ...state, isSaving: action.value };
    case 'APPLY_DRAFT':
      return {
        ...state,
        newsletterId: action.newsletterId,
        label: action.label,
        summary: action.summary,
        content: action.content,
      };
    default:
      return state;
  }
}

export default function NewsletterComposerPanel() {
  const { push } = useRouter();
  const notificationsService = NotificationsService.getInstance();
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const [state, dispatch] = useReducer(composerReducer, initialComposerState);
  const {
    topic,
    angle,
    instructions,
    label,
    summary,
    content,
    newsletterId,
    isGenerating,
    isSaving,
  } = state;

  const getService = useAuthedService((token: string) =>
    NewslettersService.getInstance(token),
  );
  const handleApplyDraftSuggestion = useCallback(
    (payload: AgentDraftSuggestionPayload) => {
      dispatch({
        type: 'SET_FIELD',
        field: 'content',
        value: applyDraftSuggestionToHtml(content, payload),
      });
    },
    [content],
  );

  useAgentDraftContext({
    body: content,
    draftType: 'newsletter',
    instructions: [angle, instructions].filter(Boolean).join('\n\n'),
    onApplySuggestion: handleApplyDraftSuggestion,
    selectionRootId: 'newsletter-compose-workspace',
    summary,
    title: label || topic,
  });

  async function handleGenerateDraft() {
    if (!topic.trim()) {
      notificationsService.error('Newsletter topic is required');
      return;
    }

    dispatch({ type: 'SET_GENERATING', value: true });

    try {
      const service = await getService();
      const draft = await service.generateDraft({
        angle: angle.trim() || undefined,
        instructions: instructions.trim() || undefined,
        topic: topic.trim(),
      });

      dispatch({
        type: 'APPLY_DRAFT',
        newsletterId: draft.id,
        label: draft.label ?? '',
        summary: draft.summary ?? '',
        content: draft.content ?? '',
      });
      notificationsService.success('Newsletter draft ready');
    } catch (error) {
      logger.error('Failed to generate newsletter draft', error);
      notificationsService.error('Failed to generate newsletter draft');
    } finally {
      dispatch({ type: 'SET_GENERATING', value: false });
    }
  }

  async function handleSaveDraft() {
    if (!newsletterId) {
      notificationsService.error('Generate a draft before saving');
      return;
    }

    if (!topic.trim()) {
      notificationsService.error('Newsletter topic is required');
      return;
    }

    dispatch({ type: 'SET_SAVING', value: true });

    try {
      const service = await getService();
      await service.patch(newsletterId, {
        angle: angle.trim() || undefined,
        content,
        label: label.trim() || undefined,
        summary: summary.trim() || undefined,
        topic: topic.trim(),
      });

      notificationsService.success('Newsletter draft saved');
    } catch (error) {
      logger.error('Failed to save newsletter draft', error);
      notificationsService.error('Failed to save newsletter draft');
    } finally {
      dispatch({ type: 'SET_SAVING', value: false });
    }
  }

  async function handleCopy() {
    const copyPayload = [label.trim(), summary.trim(), stripHtml(content)]
      .filter(Boolean)
      .join('\n\n');

    if (!copyPayload) {
      notificationsService.error('Nothing to copy yet');
      return;
    }

    await clipboardService.copyToClipboard(copyPayload);
  }

  function handleOpenWorkspace() {
    if (!newsletterId) {
      notificationsService.error('Generate a draft before opening newsletters');
      return;
    }

    push(`/posts/newsletters?id=${newsletterId}`);
  }

  return (
    <section
      id="newsletter-compose-workspace"
      className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"
    >
      <Card className="space-y-5 p-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">
            Newsletter composer
          </h2>
          <p className="text-sm text-muted-foreground">
            Generate an issue, refine the draft, then publish in Genfeed or copy
            it into any email tool.
          </p>
        </div>

        <div className="grid gap-4">
          <label
            className="grid gap-2 text-sm text-foreground/75"
            htmlFor="newsletter-topic"
          >
            <span>Topic</span>
            <Input
              id="newsletter-topic"
              value={topic}
              onChange={(event) =>
                dispatch({
                  type: 'SET_FIELD',
                  field: 'topic',
                  value: event.target.value,
                })
              }
              placeholder="What should this issue cover?"
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-white/20"
            />
          </label>

          <label
            className="grid gap-2 text-sm text-foreground/75"
            htmlFor="newsletter-angle"
          >
            <span>Angle</span>
            <Input
              id="newsletter-angle"
              value={angle}
              onChange={(event) =>
                dispatch({
                  type: 'SET_FIELD',
                  field: 'angle',
                  value: event.target.value,
                })
              }
              placeholder="Optional framing or thesis"
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-white/20"
            />
          </label>

          <Textarea
            label="Editorial instructions"
            rows={4}
            placeholder="Tone, structure, exclusions, recurring sections, or audience notes..."
            value={instructions}
            onChange={(event) =>
              dispatch({
                type: 'SET_FIELD',
                field: 'instructions',
                value: event.target.value,
              })
            }
            className="min-h-28 rounded-xl border-white/10 bg-black/20"
          />

          <label
            className="grid gap-2 text-sm text-foreground/75"
            htmlFor="newsletter-draft-label"
          >
            <span>Draft label</span>
            <Input
              id="newsletter-draft-label"
              value={label}
              onChange={(event) =>
                dispatch({
                  type: 'SET_FIELD',
                  field: 'label',
                  value: event.target.value,
                })
              }
              placeholder="Newsletter title"
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-white/20"
            />
          </label>

          <Textarea
            label="Summary"
            rows={3}
            placeholder="Short summary or teaser"
            value={summary}
            onChange={(event) =>
              dispatch({
                type: 'SET_FIELD',
                field: 'summary',
                value: event.target.value,
              })
            }
            className="rounded-xl border-white/10 bg-black/20"
          />

          <div className="grid gap-2 text-sm text-foreground/75">
            <span>Content</span>
            <LazyRichTextEditor
              value={content}
              onChange={(value) =>
                dispatch({ type: 'SET_FIELD', field: 'content', value })
              }
              placeholder="Generate a draft or write your newsletter manually..."
              toolbarMode="minimal"
              minHeight={{ desktop: 480, mobile: 320 }}
              className="overflow-hidden rounded-xl bg-black/20"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            label="Generate draft"
            icon={<HiSparkles className="size-4" />}
            isLoading={isGenerating}
            isDisabled={!topic.trim()}
            onClick={() => void handleGenerateDraft()}
            className="rounded-xl"
          />
          <Button
            label="Save draft"
            icon={<HiEnvelope className="size-4" />}
            isLoading={isSaving}
            isDisabled={!newsletterId}
            variant={ButtonVariant.SECONDARY}
            onClick={() => void handleSaveDraft()}
            className="rounded-xl"
          />
          <Button
            label="Copy content"
            icon={<HiClipboardDocument className="size-4" />}
            variant={ButtonVariant.SECONDARY}
            onClick={() => void handleCopy()}
            className="rounded-xl"
          />
          <Button
            label="Open newsletters"
            icon={<HiArrowPathRoundedSquare className="size-4" />}
            variant={ButtonVariant.SECONDARY}
            isDisabled={!newsletterId}
            onClick={handleOpenWorkspace}
            className="rounded-xl"
          />
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-medium text-foreground">
          How this mode works
        </h2>
        <div className="space-y-4 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">1. Generate or draft</p>
            <p className="mt-1">
              Start with a topic and optional angle, then generate a first pass
              or write manually.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">2. Refine the issue</p>
            <p className="mt-1">
              Edit the title, summary, and body directly in the composer before
              saving.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">3. Publish or copy</p>
            <p className="mt-1">
              Stay in Genfeed for newsletter workflows, or copy the result into
              Substack, Beehiiv, or any external email stack.
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}

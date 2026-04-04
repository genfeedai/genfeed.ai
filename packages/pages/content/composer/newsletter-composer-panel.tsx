'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { NewslettersService } from '@services/content/newsletters.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Input } from '@ui/primitives/input';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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

export default function NewsletterComposerPanel() {
  const router = useRouter();
  const notificationsService = NotificationsService.getInstance();
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const [topic, setTopic] = useState('');
  const [angle, setAngle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [label, setLabel] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [newsletterId, setNewsletterId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const getService = useAuthedService((token: string) =>
    NewslettersService.getInstance(token),
  );

  async function handleGenerateDraft() {
    if (!topic.trim()) {
      notificationsService.error('Newsletter topic is required');
      return;
    }

    setIsGenerating(true);

    try {
      const service = await getService();
      const draft = await service.generateDraft({
        angle: angle.trim() || undefined,
        instructions: instructions.trim() || undefined,
        topic: topic.trim(),
      });

      setNewsletterId(draft.id);
      setLabel(draft.label ?? '');
      setSummary(draft.summary ?? '');
      setContent(draft.content ?? '');
      notificationsService.success('Newsletter draft ready');
    } catch (error) {
      logger.error('Failed to generate newsletter draft', error);
      notificationsService.error('Failed to generate newsletter draft');
    } finally {
      setIsGenerating(false);
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

    setIsSaving(true);

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
      setIsSaving(false);
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

    router.push(`/posts/newsletters?id=${newsletterId}`);
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
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
          <label className="grid gap-2 text-sm text-foreground/75">
            <span>Topic</span>
            <Input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="What should this issue cover?"
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-white/20"
            />
          </label>

          <label className="grid gap-2 text-sm text-foreground/75">
            <span>Angle</span>
            <Input
              value={angle}
              onChange={(event) => setAngle(event.target.value)}
              placeholder="Optional framing or thesis"
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-white/20"
            />
          </label>

          <Textarea
            label="Editorial instructions"
            rows={4}
            placeholder="Tone, structure, exclusions, recurring sections, or audience notes..."
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            className="min-h-28 rounded-xl border-white/10 bg-black/20"
          />

          <label className="grid gap-2 text-sm text-foreground/75">
            <span>Draft label</span>
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Newsletter title"
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-white/20"
            />
          </label>

          <Textarea
            label="Summary"
            rows={3}
            placeholder="Short summary or teaser"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="rounded-xl border-white/10 bg-black/20"
          />

          <div className="grid gap-2 text-sm text-foreground/75">
            <span>Content</span>
            <LazyRichTextEditor
              value={content}
              onChange={setContent}
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
            icon={<HiSparkles className="h-4 w-4" />}
            isLoading={isGenerating}
            isDisabled={!topic.trim()}
            onClick={() => void handleGenerateDraft()}
            className="rounded-xl"
          />
          <Button
            label="Save draft"
            icon={<HiEnvelope className="h-4 w-4" />}
            isLoading={isSaving}
            isDisabled={!newsletterId}
            variant={ButtonVariant.SECONDARY}
            onClick={() => void handleSaveDraft()}
            className="rounded-xl"
          />
          <Button
            label="Copy content"
            icon={<HiClipboardDocument className="h-4 w-4" />}
            variant={ButtonVariant.SECONDARY}
            onClick={() => void handleCopy()}
            className="rounded-xl"
          />
          <Button
            label="Open newsletters"
            icon={<HiArrowPathRoundedSquare className="h-4 w-4" />}
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

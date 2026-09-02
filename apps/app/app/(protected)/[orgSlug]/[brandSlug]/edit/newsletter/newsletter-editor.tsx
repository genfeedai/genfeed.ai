'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { NewsletterEditorProps } from '@props/content/artifact-editor.props';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Textarea } from '@ui/primitives/textarea';
import { Archive, CircleCheck, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

type NewsletterEditorActionsProps = Pick<
  NewsletterEditorProps,
  | 'isEditorDirty'
  | 'loadingAction'
  | 'selectedNewsletter'
  | 'onApprove'
  | 'onArchive'
  | 'onPublish'
  | 'onRegenerate'
  | 'onSave'
>;

/**
 * Action rail for the newsletter editor. Split from the fields so the artifact
 * editor shell can host it in the page header alongside the back link.
 */
export function NewsletterEditorActions({
  isEditorDirty,
  loadingAction,
  selectedNewsletter,
  onApprove,
  onArchive,
  onPublish,
  onRegenerate,
  onSave,
}: NewsletterEditorActionsProps) {
  const isPublished = selectedNewsletter.status === 'published';
  const isActionInFlight = loadingAction !== null;

  return (
    <>
      <Button
        label="Save"
        variant={ButtonVariant.SECONDARY}
        isLoading={loadingAction === 'saving'}
        isDisabled={!isEditorDirty || isActionInFlight}
        onClick={onSave}
      />
      <Button
        label="Regenerate"
        variant={ButtonVariant.SECONDARY}
        isLoading={loadingAction === 'generatingDraft'}
        isDisabled={isActionInFlight}
        onClick={onRegenerate}
      />
      <Button
        label="Approve"
        variant={ButtonVariant.SECONDARY}
        icon={<CircleCheck />}
        isLoading={loadingAction === 'approving'}
        isDisabled={isPublished || isActionInFlight}
        onClick={() => onApprove(selectedNewsletter.id)}
      />
      <Button
        label="Publish"
        variant={ButtonVariant.SECONDARY}
        icon={<Sparkles />}
        isLoading={loadingAction === 'publishing'}
        isDisabled={isPublished || isActionInFlight}
        onClick={() => onPublish(selectedNewsletter.id)}
      />
      <Button
        label="Archive"
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        icon={<Archive />}
        className="rounded-lg border border-border px-3 py-2 text-sm"
        isLoading={loadingAction === 'archiving'}
        isDisabled={isActionInFlight}
        onClick={() => onArchive(selectedNewsletter.id)}
      />
    </>
  );
}

type NewsletterEditorFieldsProps = Pick<
  NewsletterEditorProps,
  'editorState' | 'onEditorChange'
>;

export default function NewsletterEditor({
  editorState,
  onEditorChange,
}: NewsletterEditorFieldsProps) {
  const translate = useTranslations('common.newsletterEditor');

  return (
    <div className="space-y-4 rounded-lg bg-tertiary p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          placeholder="Newsletter label"
          value={editorState.label}
          onChange={(event) => onEditorChange({ label: event.target.value })}
        />
        <Input
          placeholder="Newsletter topic"
          value={editorState.topic}
          onChange={(event) => onEditorChange({ topic: event.target.value })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          placeholder="Angle"
          value={editorState.angle}
          onChange={(event) => onEditorChange({ angle: event.target.value })}
        />
        <Input
          placeholder="Summary"
          value={editorState.summary}
          onChange={(event) => onEditorChange({ summary: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="newsletter-content"
          className="text-sm font-medium text-foreground"
        >
          {translate('content')}
        </Label>
        <Textarea
          id="newsletter-content"
          rows={22}
          value={editorState.content}
          onChange={(event) => onEditorChange({ content: event.target.value })}
        />
      </div>
    </div>
  );
}

'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { NewsletterEditorProps } from '@props/content/artifact-editor.props';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Archive, CircleCheck, Sparkles } from 'lucide-react';

type NewsletterEditorActionsProps = Pick<
  NewsletterEditorProps,
  | 'editorDirty'
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
  editorDirty,
  loadingAction,
  selectedNewsletter,
  onApprove,
  onArchive,
  onPublish,
  onRegenerate,
  onSave,
}: NewsletterEditorActionsProps) {
  const isPublished = selectedNewsletter.status === 'published';

  return (
    <>
      <Button
        label="Save"
        variant={ButtonVariant.SECONDARY}
        isLoading={loadingAction === 'saving'}
        isDisabled={!editorDirty}
        onClick={onSave}
      />
      <Button
        label="Regenerate"
        variant={ButtonVariant.SECONDARY}
        isLoading={loadingAction === 'generatingDraft'}
        onClick={onRegenerate}
      />
      <Button
        label="Approve"
        variant={ButtonVariant.SECONDARY}
        icon={<CircleCheck />}
        isLoading={loadingAction === 'approving'}
        isDisabled={isPublished}
        onClick={() => onApprove(selectedNewsletter.id)}
      />
      <Button
        label="Publish"
        variant={ButtonVariant.SECONDARY}
        icon={<Sparkles />}
        isLoading={loadingAction === 'publishing'}
        isDisabled={isPublished}
        onClick={() => onPublish(selectedNewsletter.id)}
      />
      <Button
        label="Archive"
        variant={ButtonVariant.UNSTYLED}
        icon={<Archive />}
        className="rounded-lg border border-border px-3 py-2 text-sm"
        isLoading={loadingAction === 'archiving'}
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

      <Textarea
        label="Newsletter content"
        rows={22}
        value={editorState.content}
        onChange={(event) => onEditorChange({ content: event.target.value })}
      />
    </div>
  );
}

import { ButtonVariant } from '@genfeedai/enums';
import type { Newsletter } from '@models/content/newsletter.model';
import Badge from '@ui/display/badge/Badge';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { HiArchiveBox, HiCheckCircle, HiSparkles } from 'react-icons/hi2';

type NewsletterEditorState = {
  angle: string;
  content: string;
  label: string;
  summary: string;
  topic: string;
};

function statusLabel(status: Newsletter['status']): string {
  switch (status) {
    case 'ready_for_review':
      return 'Ready For Review';
    default:
      return status.replace(/_/g, ' ');
  }
}

type NewsletterEditorLoadingAction =
  | 'approving'
  | 'archiving'
  | 'generatingDraft'
  | 'publishing'
  | 'saving'
  | null;

type Props = {
  editorDirty: boolean;
  editorState: NewsletterEditorState;
  loadingAction: NewsletterEditorLoadingAction;
  selectedNewsletter: Newsletter;
  onApprove: (id: string) => void;
  onArchive: (id: string) => void;
  onEditorChange: (patch: Partial<NewsletterEditorState>) => void;
  onPublish: (id: string) => void;
  onRegenerate: () => void;
  onSave: () => void;
};

export default function NewsletterEditor({
  editorDirty,
  editorState,
  loadingAction,
  selectedNewsletter,
  onApprove,
  onArchive,
  onEditorChange,
  onPublish,
  onRegenerate,
  onSave,
}: Props) {
  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge status={selectedNewsletter.status}>
              {statusLabel(selectedNewsletter.status)}
            </Badge>
            {editorDirty ? (
              <Badge status="pending">Unsaved changes</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Draft, revise, approve, then publish when the issue is ready.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            label="Save"
            variant={ButtonVariant.SOFT}
            isLoading={loadingAction === 'saving'}
            isDisabled={!editorDirty}
            onClick={onSave}
          />
          <Button
            label="Regenerate"
            variant={ButtonVariant.SOFT}
            isLoading={loadingAction === 'generatingDraft'}
            onClick={onRegenerate}
          />
          <Button
            label="Approve"
            variant={ButtonVariant.SOFT}
            icon={<HiCheckCircle />}
            isLoading={loadingAction === 'approving'}
            isDisabled={selectedNewsletter.status === 'published'}
            onClick={() => onApprove(selectedNewsletter.id)}
          />
          <Button
            label="Publish"
            variant={ButtonVariant.SOFT}
            icon={<HiSparkles />}
            isLoading={loadingAction === 'publishing'}
            isDisabled={selectedNewsletter.status === 'published'}
            onClick={() => onPublish(selectedNewsletter.id)}
          />
          <Button
            label="Archive"
            variant={ButtonVariant.UNSTYLED}
            icon={<HiArchiveBox />}
            className="rounded-lg border border-border px-3 py-2 text-sm"
            isLoading={loadingAction === 'archiving'}
            onClick={() => onArchive(selectedNewsletter.id)}
          />
        </div>
      </div>

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

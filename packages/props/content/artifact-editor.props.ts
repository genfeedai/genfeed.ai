import type { Newsletter } from '@genfeedai/models/content/newsletter.model';
import type { NewslettersService } from '@genfeedai/services/content/newsletters.service';
import type { ReactNode } from 'react';

/**
 * Contracts for the dedicated artifact editor pages at `/edit/{type}/{id}`.
 * Refinement belongs to the artifact, so every text artifact shares one shell.
 * Workspace breadcrumbs own navigation; the editor shell only owns artifact
 * identity, actions, and content.
 */
export interface ArtifactEditorShellProps {
  actions?: ReactNode;
  artifactLabel: string;
  badges?: ReactNode;
  children: ReactNode;
  description?: string;
  isDirty?: boolean;
  title: string;
}

export interface ArtifactEditorPageProps {
  artifactId: string;
}

export type NewsletterEditorState = {
  angle: string;
  content: string;
  label: string;
  summary: string;
  topic: string;
};

export type NewsletterEditorLoadingAction =
  | 'approving'
  | 'archiving'
  | 'generatingDraft'
  | 'publishing'
  | 'saving'
  | null;

export interface NewsletterEditorProps {
  isEditorDirty: boolean;
  editorState: NewsletterEditorState;
  loadingAction: NewsletterEditorLoadingAction;
  selectedNewsletter: Newsletter;
  onApprove: (id: string) => void;
  onArchive: (id: string) => void;
  onEditorChange: (patch: Partial<NewsletterEditorState>) => void;
  onPublish: (id: string) => void;
  onRegenerate: () => void;
  onSave: () => void;
}

export type NewsletterContextPreview = Awaited<
  ReturnType<NewslettersService['getContext']>
>;

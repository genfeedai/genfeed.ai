import type { ArtifactEditorType } from '@genfeedai/constants';

export interface ArtifactEditorProps {
  artifactId: string;
  type: ArtifactEditorType;
  credentialId?: string;
}

export interface NewsletterEditorProps {
  newsletterId?: string;
}

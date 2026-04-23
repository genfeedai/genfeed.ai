import type { EditorProjectStatus } from '@genfeedai/enums';
import type {
  IEditorProjectSettings,
  IEditorTrack,
} from '@genfeedai/interfaces';
import type { EditorProject } from '@genfeedai/prisma';

export type { EditorProject } from '@genfeedai/prisma';

export interface EditorProjectDocument
  extends Omit<EditorProject, 'config' | 'tracks'> {
  _id: string;
  brand?: string | null;
  config?: Partial<IEditorProjectSettings> & Record<string, unknown>;
  organization?: string;
  renderedVideo?: string | null;
  settings?: Partial<IEditorProjectSettings>;
  status?: EditorProjectStatus | string;
  thumbnailUrl?: string;
  totalDurationFrames?: number;
  tracks: IEditorTrack[];
  user?: string;
  [key: string]: unknown;
}

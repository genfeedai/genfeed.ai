import type { EditorProjectStatus } from '@genfeedai/contracts';
import type {
  IEditorProjectSettings,
  IEditorTrack,
} from '@genfeedai/contracts/interfaces';
import type { EditorProject } from '@genfeedai/prisma';

export type { EditorProject } from '@genfeedai/prisma';

export interface EditorProjectDocument
  extends Omit<EditorProject, 'config' | 'tracks'> {
  config?: Partial<IEditorProjectSettings> & Record<string, unknown>;
  settings?: Partial<IEditorProjectSettings>;
  status?: EditorProjectStatus | string;
  thumbnailUrl?: string;
  totalDurationFrames?: number;
  tracks: IEditorTrack[];
  [key: string]: unknown;
}

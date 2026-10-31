import type { IEditorProject } from '@genfeedai/contracts/interfaces';
import type { EditorLayoutProps } from '@/props/studio/editor-layout.props';

/** What the editor shows for the selected track or clip. */
export interface EditorInspectorProps
  extends Pick<
    EditorLayoutProps,
    | 'isReadOnly'
    | 'onAddTextTrack'
    | 'onClipSelect'
    | 'onTrackUpdate'
    | 'selectedClipId'
    | 'selectedTrackId'
  > {
  project: IEditorProject;
}

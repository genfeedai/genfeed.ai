import type { IEditorProject } from '@genfeedai/contracts/interfaces';
import type { RefObject } from 'react';
import type { EditorLayoutProps } from '@/props/studio/editor-layout.props';
import type { EditorPreviewRef } from '@/props/studio/editor-preview.props';

/** The editor's output: the preview over the timeline. */
export interface EditorOutputPaneProps
  extends Pick<
    EditorLayoutProps,
    | 'currentFrame'
    | 'isReadOnly'
    | 'onClipMove'
    | 'onClipResize'
    | 'onClipSelect'
    | 'onFrameChange'
    | 'onPlayingChange'
    | 'onSeek'
    | 'onTrackUpdate'
    | 'selectedClipId'
    | 'zoom'
  > {
  previewRef: RefObject<EditorPreviewRef | null>;
  project: IEditorProject;
}

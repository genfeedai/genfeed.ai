import type {
  IEditorClip,
  IEditorTextOverlay,
} from '@genfeedai/contracts/interfaces';

export interface EditorTextPropertiesProps {
  selectedTextClip: IEditorClip;
  onUpdateTextOverlay: (updates: Partial<IEditorTextOverlay>) => void;
}

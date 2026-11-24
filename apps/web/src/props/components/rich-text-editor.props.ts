import type { Editor } from '@tiptap/react';
import type { ReactNode } from 'react';

export interface RichTextEditorAiConfig {
  orgId: string;
  token: string;
}

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  showToolbar?: boolean;
  toolbarMode?: 'full' | 'minimal' | 'hidden';
  /**
   * Minimum height of the editor in pixels
   * Can be a number (applies to all screen sizes) or an object with mobile/desktop values
   * @default { mobile: 200, desktop: 400 }
   */
  minHeight?: number | { mobile: number; desktop: number };
  aiConfig?: RichTextEditorAiConfig;
  /** Offers embedding library generations as blocks (articles only). */
  isGenerationInsertEnabled?: boolean;
}

export interface RichTextEditorFormatToggleProps {
  children: ReactNode;
  editor: Editor;
  label: string;
  /** The tiptap mark or node name whose active state the toggle shows. */
  mark: string;
  onToggle: () => void;
}

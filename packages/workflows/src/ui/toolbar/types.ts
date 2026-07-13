/**
 * Toolbar Component Types
 */

import type { ReactNode } from 'react';

export interface DropdownItem {
  id: string;
  label?: string;
  icon?: ReactNode;
  onClick?: () => void;
  external?: boolean;
  separator?: boolean;
  disabled?: boolean;
}

export interface ToolbarDropdownProps {
  label: string;
  items: DropdownItem[];
}

export interface OverflowMenuProps {
  items: DropdownItem[];
}

export interface ToolbarMenu {
  label: string;
  items: DropdownItem[];
}

export interface ToolbarProps {
  /** Optional callback for auto-layout functionality */
  onAutoLayout?: (direction: 'LR' | 'TB') => void;
  /** Optional callback for "Save As" action */
  onSaveAs?: (newName: string) => void;
  /** Additional file menu items to prepend */
  fileMenuItemsPrepend?: DropdownItem[];
  /** Additional file menu items to append */
  fileMenuItemsAppend?: DropdownItem[];
  /** Additional menu dropdowns to render after File */
  additionalMenus?: ToolbarMenu[];
  /** Optional custom branding; falls back to the default logo link */
  branding?: ReactNode;
  /** Optional content rendered between branding and the File menu */
  leftContent?: ReactNode;
  /** Optional content rendered after the save indicator and before the spacer */
  middleContent?: ReactNode;
  /** Additional elements to render in the right side of the toolbar */
  rightContent?: ReactNode;
  /** Custom save indicator override */
  saveIndicator?: ReactNode;
  /** Logo href (defaults to "/") */
  logoHref?: string;
  /** Logo image src */
  logoSrc?: string;
  /** Whether to show the settings button */
  showSettings?: boolean;
  /** Whether to show the shortcut help button */
  showShortcutHelp?: boolean;
}

export interface SaveIndicatorProps {
  isDirty?: boolean;
  isSaving?: boolean;
  variant?: 'default' | 'pill';
}

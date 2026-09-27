import type { ReactNode } from 'react';

/** What a page can put in the shell's context sidebar. */
export type ContextSidebarSelectionKind =
  | 'asset'
  | 'finding'
  | 'post'
  | 'run'
  | 'source'
  | 'task';

/**
 * `user` selections come from a tap or click; `automatic` ones are picked by
 * the page itself (a restored URL, Review's first item). Only a user selection
 * opens the mobile drawer.
 */
export type ContextSidebarSelectionOrigin = 'automatic' | 'user';

export interface ContextSidebarSelection {
  readonly id: string;
  /** `false` keeps the desktop sidebar closed until the topbar toggle opens it. */
  readonly isOpenByDefault?: boolean;
  readonly kind: ContextSidebarSelectionKind;
  readonly origin: ContextSidebarSelectionOrigin;
  readonly subtitle?: string;
  readonly title: string;
}

export interface ContextSidebarRegistration {
  readonly onClose: () => void;
  readonly selection: ContextSidebarSelection;
}

export interface ContextSidebarContextValue {
  /** Closes the sidebar and hands the close to the page (usually a deselect). */
  readonly close: () => void;
  readonly isMobileOpen: boolean;
  readonly isOpen: boolean;
  /** Where the selected page portals its panel: the rail, or the open drawer. */
  readonly portalTarget: HTMLElement | null;
  readonly registerSelection: (
    registration: ContextSidebarRegistration,
  ) => () => void;
  readonly selection: ContextSidebarSelection | null;
  readonly setDesktopTarget: (element: HTMLElement | null) => void;
  readonly setIsMobileOpen: (isMobileOpen: boolean) => void;
  readonly setMobileTarget: (element: HTMLElement | null) => void;
  readonly toggle: () => void;
}

export interface ContextSidebarProviderProps {
  readonly children: ReactNode;
}

export interface ContextSidebarPanelProps {
  readonly children: ReactNode;
  /** Called when the sidebar's close control is used; pages deselect here. */
  readonly onClose?: () => void;
  /** `null` means nothing is selected: the panel unregisters and renders nothing. */
  readonly selection: ContextSidebarSelection | null;
}

export interface ContextSidebarOutletProps {
  readonly className?: string;
  /** The rail outlet, or the drawer outlet used below `xl`. */
  readonly target?: 'desktop' | 'mobile';
  readonly testId?: string;
}

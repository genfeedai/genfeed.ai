import type { BootRecord } from '@/props/layout/boot-record.props';

export interface WorkspaceFrameSkeletonProps {
  /** Announced to assistive technology while the workspace loads. */
  label: string;
}

export interface WorkspaceFrameProps extends WorkspaceFrameSkeletonProps {
  /** The stored rail to draw, or null for placeholders. */
  bootRecord: BootRecord | null;
  /** Whether the menu column placeholder is drawn. */
  hasSidebar: boolean;
}

export interface WorkspacePagePendingProps {
  /**
   * Announced to assistive technology. Omit when the placeholder sits inside a
   * frame that already announces the load, so it is not read twice.
   */
  label?: string;
}

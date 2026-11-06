export interface WorkspaceFrameSkeletonProps {
  /** Announced to assistive technology while the workspace loads. */
  label: string;
}

export interface WorkspaceContentSkeletonProps {
  /**
   * Announced to assistive technology. Omit when the skeleton sits inside a
   * frame that already announces the load, so it is not read twice.
   */
  label?: string;
}

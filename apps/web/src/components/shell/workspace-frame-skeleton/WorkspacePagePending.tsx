import type { WorkspacePagePendingProps } from '@/props/layout/workspace-frame-skeleton.props';

/**
 * The page body while a page, its code or its organization is still arriving.
 * It draws nothing: the rail, sidebar and top bar around it are already the
 * final navigation, and the page brings its own shaped blocks. A second
 * placeholder layout here would only be replaced a moment later, which is the
 * cascade a hard load used to show.
 */
export default function WorkspacePagePending({
  label,
}: WorkspacePagePendingProps) {
  if (!label) {
    return <div className="w-full" data-testid="workspace-page-pending" />;
  }

  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="w-full"
      data-testid="workspace-page-pending"
      role="status"
    />
  );
}

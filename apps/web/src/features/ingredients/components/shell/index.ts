export {
  type AppHtmlDocumentProps,
  default as AppHtmlDocument,
} from '@ui/shell/AppHtmlDocument';
export {
  type CreateAppMetadataOptions,
  createAppMetadata,
  createPwaMetadata,
} from '@ui/shell/metadata';
export {
  default as PublicShell,
  type PublicShellProps,
} from '@ui/shell/PublicShell';
export {
  DNS_PREFETCH_ORIGINS,
  PRECONNECT_ORIGINS,
} from '@ui/shell/resource-hints';
export { default as AppShell } from '@/features/ingredients/components/shell/AppShell';
export { default as MediaCanvasShell } from '@/features/ingredients/components/shell/media-canvas/MediaCanvasShell';
export {
  default as PageSuspenseBoundary,
  type PageSuspenseBoundaryProps,
} from '@/features/ingredients/components/shell/PageSuspenseBoundary';
export { default as Sidebar } from '@/features/ingredients/components/shell/Sidebar';
export { default as Topbar } from '@/features/ingredients/components/shell/Topbar';
export type {
  BrandConfig,
  PublicTopbarDropdown,
  PublicTopbarDropdownItem,
  PublicTopbarLink,
  ShellAction,
  ShellConfig,
  ShellNavItem,
  SidebarConfig,
  TopbarConfig,
} from '@/features/ingredients/components/shell/types';

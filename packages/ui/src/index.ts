import type { SemanticColorRole } from '@ui/core/colors';
import { semanticColorRoles, semanticColorTokens } from '@ui/core/colors';
import { elevationTokens, focusTokens } from '@ui/core/elevation';
import { motionTokens } from '@ui/core/motion';
import { radiusTokens } from '@ui/core/radius';
import {
  backgroundScale,
  neutralAlphaScale,
  neutralScale,
  neutralScaleJobs,
  neutralScaleSteps,
} from '@ui/core/scales';
import { sizingTokens } from '@ui/core/sizing';
import { spacingTokens } from '@ui/core/spacing';
import { typographyTokens } from '@ui/core/typography';
import { generateNativeTokens } from '@ui/generators/native-ts';
import { generateWebTokenCss, webTokenCss } from '@ui/generators/web-css';
import {
  generateWebviewTokenCss,
  webviewTokenCss,
} from '@ui/generators/webview-css';
import { nativeThemeColors, nativeTokenMap } from '@ui/semantic/mobile';
import { tailwindSemanticColors } from '@ui/semantic/web';
import { webviewSemanticTokenMap } from '@ui/semantic/webview';

export type {
  ColorTokenName,
  SemanticColorRole,
  SemanticColorValue,
  SemanticThemeColors,
} from '@ui/core/colors';
export type {
  ElevationTokenName,
  ElevationTokens,
  FocusTokenName,
} from '@ui/core/elevation';
export type { MotionTokenName } from '@ui/core/motion';
export type { RadiusTokenName } from '@ui/core/radius';
export type {
  BackgroundScale,
  BackgroundScaleStep,
  NeutralAlphaScale,
  NeutralScale,
  NeutralScaleStep,
  ScaleValue,
} from '@ui/core/scales';
export type { SizingTokenName } from '@ui/core/sizing';
export type { SpacingTokenName } from '@ui/core/spacing';
export type { TypographyTokenName } from '@ui/core/typography';
export type { NativeThemeColors } from '@ui/semantic/mobile';

export interface DesignTokens {
  backgroundScale: typeof backgroundScale;
  colors: typeof semanticColorTokens;
  elevation: typeof elevationTokens;
  focus: typeof focusTokens;
  motion: typeof motionTokens;
  neutralAlphaScale: typeof neutralAlphaScale;
  neutralScale: typeof neutralScale;
  radius: typeof radiusTokens;
  sizing: typeof sizingTokens;
  spacing: typeof spacingTokens;
  typography: typeof typographyTokens;
}

export const designTokens: DesignTokens = {
  backgroundScale,
  colors: semanticColorTokens,
  elevation: elevationTokens,
  focus: focusTokens,
  motion: motionTokens,
  neutralAlphaScale,
  neutralScale,
  radius: radiusTokens,
  sizing: sizingTokens,
  spacing: spacingTokens,
  typography: typographyTokens,
};

export {
  staticSurfaceClassNames,
  staticSurfaceCss,
} from './static/surface';
export {
  backgroundScale,
  elevationTokens,
  focusTokens,
  generateNativeTokens,
  generateWebTokenCss,
  generateWebviewTokenCss,
  motionTokens,
  nativeThemeColors,
  nativeTokenMap,
  neutralAlphaScale,
  neutralScale,
  neutralScaleJobs,
  neutralScaleSteps,
  radiusTokens,
  semanticColorRoles,
  semanticColorTokens,
  sizingTokens,
  spacingTokens,
  tailwindSemanticColors,
  typographyTokens,
  webTokenCss,
  webviewSemanticTokenMap,
  webviewTokenCss,
};

export const semanticColorRoleList: readonly SemanticColorRole[] =
  semanticColorRoles;

// Utilities
export { cn } from '@genfeedai/helpers';
// Shared UI components (Paperclip design system)
export { ActivityRow } from './dashboard/ActivityRow';
export { Identity } from './identity/Identity';
export { IssueRow } from './issues/IssueRow';
export { PriorityIcon } from './issues/PriorityIcon';
export { StatusIcon } from './issues/StatusIcon';
export { useMounted } from './lib/hooks';
export type { ModalContentProps, ModalSize } from './modals/compound/Modal';
// Compound Modal
export { Modal } from './modals/compound/modal.compound';
// Primitives (Radix UI based)
export * from './primitives';
export type { ConversationSidebarFilter } from './sidebar/ConversationSidebar';
export {
  ConversationSidebarFilters,
  ConversationSidebarSearch,
  ConversationSidebarSection,
  conversationSidebarRowClassName,
} from './sidebar/ConversationSidebar';
export { SidebarNavItem } from './sidebar/SidebarNavItem';
export { SidebarSection } from './sidebar/SidebarSection';
export type { StatusKey } from './tokens/status-colors';
// Status & priority color tokens
export {
  issueStatusText,
  issueStatusTextDefault,
  priorityColor,
  priorityColorDefault,
  statusBadge,
  statusBadgeDefault,
  statusIcon,
  statusIconDefault,
} from './tokens/status-colors';

import type { SemanticColorRole } from '@ui/core/colors';
import { semanticColorRoles, semanticColorTokens } from '@ui/core/colors';
import { motionTokens } from '@ui/core/motion';
import { radiusTokens } from '@ui/core/radius';
import { spacingTokens } from '@ui/core/spacing';
import { typographyTokens } from '@ui/core/typography';
import { generateNativeTokens } from '@ui/generators/native-ts';
import { generateWebTokenCss, webTokenCss } from '@ui/generators/web-css';
import {
  generateWebviewTokenCss,
  webviewTokenCss,
} from '@ui/generators/webview-css';
import { nativeTokenMap } from '@ui/semantic/mobile';
import { tailwindSemanticColors } from '@ui/semantic/web';
import { webviewSemanticTokenMap } from '@ui/semantic/webview';

export type {
  ColorTokenName,
  SemanticColorRole,
  SemanticColorValue,
  SemanticThemeColors,
} from '@ui/core/colors';
export type { MotionTokenName } from '@ui/core/motion';
export type { RadiusTokenName } from '@ui/core/radius';
export type { SpacingTokenName } from '@ui/core/spacing';
export type { TypographyTokenName } from '@ui/core/typography';

export interface DesignTokens {
  colors: typeof semanticColorTokens;
  motion: typeof motionTokens;
  radius: typeof radiusTokens;
  spacing: typeof spacingTokens;
  typography: typeof typographyTokens;
}

export const designTokens: DesignTokens = {
  colors: semanticColorTokens,
  motion: motionTokens,
  radius: radiusTokens,
  spacing: spacingTokens,
  typography: typographyTokens,
};

export {
  generateNativeTokens,
  generateWebTokenCss,
  generateWebviewTokenCss,
  motionTokens,
  nativeTokenMap,
  radiusTokens,
  semanticColorRoles,
  semanticColorTokens,
  spacingTokens,
  tailwindSemanticColors,
  typographyTokens,
  webTokenCss,
  webviewSemanticTokenMap,
  webviewTokenCss,
};

export const semanticColorRoleList: readonly SemanticColorRole[] =
  semanticColorRoles;

export { ActivityRow } from './dashboard/ActivityRow';
export { MetricCard } from './dashboard/MetricCard';
export { Identity } from './identity/Identity';
export { IssueRow } from './issues/IssueRow';
export { PriorityIcon } from './issues/PriorityIcon';
export { StatusIcon } from './issues/StatusIcon';
export { useMounted } from './lib/hooks';
// Utilities
export { cn } from './lib/utils';
export type { ModalContentProps, ModalSize } from './modals/compound/Modal';
// Compound Modal
export { Modal } from './modals/compound/Modal';
// Primitives (Radix UI based)
export * from './primitives';
// Shared UI components (Paperclip design system)
export { SidebarNavItem } from './sidebar/SidebarNavItem';
export { SidebarSection } from './sidebar/SidebarSection';
// Task Composer
export {
  type ContentType,
  ContentTypePresets,
} from './task-composer/ContentTypePresets';
export { TaskComposerModal } from './task-composer/TaskComposerModal';

// Status & priority color tokens
export {
  agentStatusDot,
  agentStatusDotDefault,
  issueStatusIcon,
  issueStatusIconDefault,
  issueStatusText,
  issueStatusTextDefault,
  priorityColor,
  priorityColorDefault,
  statusBadge,
  statusBadgeDefault,
} from './tokens/status-colors';

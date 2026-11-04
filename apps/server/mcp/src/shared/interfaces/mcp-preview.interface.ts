import type {
  McpCard,
  McpCardAction,
  McpCardFact,
  McpCardKind,
  McpCardMetric,
  McpOrganizationSwitcher,
} from '@mcp/shared/interfaces/mcp-app.interface';
import type { ImgHTMLAttributes, ReactNode } from 'react';

export interface PreviewBridge {
  origins: readonly string[];
  displayModes: string[];
  request(method: string, params: Record<string, unknown>): Promise<unknown>;
  notify(message: string): void;
  resize(): void;
}
export interface PreviewProps {
  result: unknown;
  notice: string;
  bridge: PreviewBridge;
}
export interface OrganizationSwitcherProps {
  error: string;
  isSwitching: boolean;
  onSwitch(organizationId: string): void;
  switcher: McpOrganizationSwitcher;
}
export interface CardPreviewProps {
  item: McpCard;
  bridge: PreviewBridge;
  openImage(src: string, title: string, trigger: HTMLElement): void;
  /** The brand the user picked in this view, if any. */
  selectedId?: string;
  /** Decisions taken on queued approvals in this view, by approval id. */
  resolvedApprovals?: Readonly<Record<string, 'approve' | 'decline'>>;
  /** A selection is on its way to the host; card actions wait for it. */
  isActionPending?: boolean;
  onAction(action: McpCardAction): void;
}
export interface SummaryCardProps {
  item: McpCard;
  bridge: PreviewBridge;
  isActionPending: boolean;
  isSelected: boolean;
  onAction(action: McpCardAction): void;
  /** The decision taken on a queued approval from this view, once it went through. */
  resolvedDecision?: 'approve' | 'decline';
  when: string;
}
export interface ImagePreview {
  src: string;
  title: string;
  trigger: HTMLElement;
}
export interface MediaPreviewProps
  extends Pick<CardPreviewProps, 'bridge' | 'item' | 'openImage'> {
  onError(): void;
}
export interface DescriptionProps {
  content: string;
  bridge: PreviewBridge;
}
export interface PendingResponse {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
export interface CardBoundaryProps {
  children: ReactNode;
  /** What the card says in words, shown if its view cannot render. */
  fallback: string;
}
export interface CardBoundaryState {
  hasError: boolean;
}
/** The `next/image` props the shared components pass, minus Next's loader. */
export interface CardImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'src'> {
  alt: string;
  fill?: boolean;
  priority?: boolean;
  quality?: number | string;
  src: string;
  unoptimized?: boolean;
}
export interface StatusBadgeProps {
  /** Product status or role ('scheduled', 'needs_review', 'Admin'). */
  status: string;
  /** Replaces the status's default label. */
  label?: string;
}
export interface KindBadgeProps {
  kind: McpCardKind;
  /** Shown as "×N" when more than one. */
  count?: number;
}
export interface FactValueProps {
  fact: McpCardFact;
}
export interface MetricListProps {
  metrics: McpCardMetric[];
}

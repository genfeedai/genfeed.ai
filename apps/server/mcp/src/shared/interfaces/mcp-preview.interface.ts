import type {
  McpCard,
  McpCardAction,
  McpCardFact,
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
  /** Opens an article's full text in the reader. */
  openArticle(title: string, content: string, trigger: HTMLElement): void;
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
/** What the lightbox shows: an image, or an article's full text. */
export interface ImagePreview {
  src?: string;
  content?: string;
  title: string;
  trigger: HTMLElement;
}
export interface MediaPreviewProps
  extends Pick<CardPreviewProps, 'bridge' | 'item' | 'openImage'> {
  onError(): void;
  /** Fills a sized media tile instead of keeping the file's own size. */
  isFill?: boolean;
}
export interface IconActionProps {
  label: string;
  icon: ReactNode;
  /** Opens this address through the host; otherwise the action runs `onClick`. */
  url?: string;
  bridge: PreviewBridge;
  onClick?(trigger: HTMLElement): void;
}
export interface BrandListProps {
  items: McpCard[];
  bridge: PreviewBridge;
  isActionPending: boolean;
  selectedId: string;
  onAction(action: McpCardAction): void;
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
export interface FactValueProps {
  fact: McpCardFact;
}
export interface MetricListProps {
  metrics: McpCardMetric[];
}

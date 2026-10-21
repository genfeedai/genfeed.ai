import type {
  McpCard,
  McpCardAction,
  McpOrganizationSwitcher,
} from '@mcp/shared/interfaces/mcp-app.interface';

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
  onAction(action: McpCardAction, item: McpCard): void;
}
export interface SummaryCardProps {
  item: McpCard;
  bridge: PreviewBridge;
  isSelected: boolean;
  onAction(action: McpCardAction, item: McpCard): void;
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

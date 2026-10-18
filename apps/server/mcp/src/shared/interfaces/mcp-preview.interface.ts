import type {
  McpCard,
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
}
export interface ImagePreview {
  src: string;
  title: string;
  trigger: HTMLElement;
}
export interface MediaPreviewProps extends CardPreviewProps {
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

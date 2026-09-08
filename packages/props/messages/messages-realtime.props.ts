export interface UseMessagesRealtimeParams {
  readonly onRefresh: () => void | Promise<void>;
  readonly organizationId?: string;
}

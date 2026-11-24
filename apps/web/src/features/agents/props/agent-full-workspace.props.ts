export interface AgentFullWorkspaceProps {
  /** Back to the conversation beside its output, on the thread's own URL. */
  onExitFullView: () => void;
  /** The thread shown at full size, from the URL; absent on a new conversation. */
  threadId?: string;
}

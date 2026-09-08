export type MessagesSurfaceTelemetryData = {
  action: MessagesActionKind | 'attach-reference' | 'realtime-refresh';
  connectionState?: 'connected' | 'connecting' | 'offline' | 'reconnecting';
  outcome: 'blocked' | 'failed' | 'started' | 'succeeded';
  referenceKind?: 'social-conversation' | 'social-message';
};

export type MessagesActionKind =
  | 'approve'
  | 'draft'
  | 'dm'
  | 'reject'
  | 'reply'
  | 'status'
  | 'sync';

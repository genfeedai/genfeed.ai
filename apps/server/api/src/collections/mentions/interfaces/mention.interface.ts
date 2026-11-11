/** Where a mention was written. */
export interface MentionSource {
  type: 'agent_thread' | 'task_comment';
  /** The agent message or task comment id. */
  id: string;
}

/** A teammate a message or comment mentions, with the name to show. */
export interface MentionedMember {
  id: string;
  name: string;
}

/** One validated mention, handed to whoever notifies the recipient. */
export interface MentionCreatedEvent {
  actorUserId: string;
  brandId: string | null;
  /** The thread or task title, for the notification text. */
  label: string;
  mentionedUserId: string;
  organizationId: string;
  source: MentionSource;
  taskId?: string;
  threadId?: string;
}

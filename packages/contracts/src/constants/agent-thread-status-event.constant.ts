/** Redis channel the agent stream and the thread status push share. */
export const AGENT_CHAT_CHANNEL = 'agent-chat';

/** `type` of the per-thread run status change event (#5636). */
export const AGENT_THREAD_STATUS_EVENT_TYPE = 'agent:thread_status';

/**
 * `type` of the event that tells one member a thread is no longer shared with
 * them (#9938): their open stream for it ends and the thread leaves their list.
 */
export const AGENT_THREAD_ACCESS_REVOKED_EVENT_TYPE =
  'agent:thread_access_revoked';

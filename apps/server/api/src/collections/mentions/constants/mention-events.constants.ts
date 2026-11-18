/**
 * Emitted once per teammate a saved message or comment mentions (#9946). The
 * payload is `MentionCreatedEvent`. Only ids that passed validation are ever
 * emitted, so a listener (the mention alert) may notify the recipient as is.
 */
export const MENTION_CREATED_EVENT = 'mention.created';

/** A message or comment mentions at most this many teammates. */
export const MAX_MENTIONS_PER_ITEM = 20;

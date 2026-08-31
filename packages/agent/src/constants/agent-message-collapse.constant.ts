/**
 * Long user-message collapse (#2791). Matches the t3code transcript cap:
 * collapse once the prompt is taller than four lines or longer than 320 chars
 * so one paste cannot push the rest of the conversation off-screen.
 */
export const USER_MESSAGE_COLLAPSE_MAX_CHARS = 320;
export const USER_MESSAGE_COLLAPSE_MAX_LINES = 4;

/** 4 × user `leading-6` (1.5rem) — compact like Cursor without hiding intent. */
export const USER_MESSAGE_COLLAPSE_MAX_HEIGHT_CLASS = 'max-h-24';

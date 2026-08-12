/**
 * Long user-message collapse (#2791). Matches the t3code transcript cap:
 * collapse once the prompt is taller than ~8 lines or longer than 600 chars
 * so one paste cannot push the rest of the conversation off-screen.
 */
export const USER_MESSAGE_COLLAPSE_MAX_CHARS = 600;
export const USER_MESSAGE_COLLAPSE_MAX_LINES = 8;

/** 8 × `leading-5` (1.25rem) — the collapsed user-bubble viewport. */
export const USER_MESSAGE_COLLAPSE_MAX_HEIGHT_CLASS = 'max-h-40';

/**
 * One-click prompts shared by the route starter chips
 * (`use-agent-page-context`) and the `/` slash palette, so both entry points
 * send the same concrete request.
 *
 * The prompt is explicit enough for the agent to call
 * `generate_content_batch` without follow-up questions: the window is
 * resolved against the "Current Time" section the client sends as page
 * context (browser timezone), and slots are spaced one hour apart.
 */
export const SCHEDULE_TODAYS_TWEETS_LABEL = "Schedule today's tweets";

export const SCHEDULE_TODAYS_TWEETS_PROMPT =
  "Schedule today's X posts: generate one post per hour for my X account for the rest of today, from the next full hour through 23:00 in my timezone, in a single batch scheduled at those times. Mix tips, opinions and questions, each under 280 characters. Do not ask follow-up questions; if no hours are left today, tell me instead of scheduling into tomorrow.";

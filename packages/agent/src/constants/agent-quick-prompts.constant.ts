/**
 * One-click prompts shared by the route starter chips
 * (`use-agent-page-context`) and the `/` slash palette, so both entry points
 * send the same concrete request.
 *
 * Today's tweets run in three beats so the user stays in the loop without
 * being asked to review a wall of posts: topics from the brand, then drafts
 * for the topics the user kept, then the posts themselves once the drafts are
 * accepted. Volume stays small (three), never an hourly batch.
 */
export const PLAN_TODAYS_TWEETS_LABEL = "Plan today's tweets";

export const PLAN_TODAYS_TWEETS_PROMPT =
  "Plan today's X posts, three at most. First read my brand context and suggest three topics that fit my brand's voice and audience, as options I can pick from. Wait for my pick. Then write one tweet per topic I kept, each under 280 characters, and show the drafts to me. Only after I accept the drafts, create the posts for my X account.";

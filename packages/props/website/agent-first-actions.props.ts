export interface AgentFirstActionsProps {
  /** Label for the SaaS sign-up button that follows the agent action. */
  signUpLabel?: string;
  /** Sign-up URL, e.g. with a `?plan=` preset. Defaults to the app sign-up. */
  signUpHref?: string;
  /** Analytics event name shared by both buttons, e.g. `research_hero_click`. */
  trackingName: string;
}

export type OAuthDecisionResponse = {
  error?: string;
  error_description?: string;
  redirectUrl?: string;
};

export type ConsentDecision = 'approved' | 'denied';

export type ConsentState = {
  error: string | null;
  isSubmitting: boolean;
  // Set once the decision was handed back to the client. Native-app redirects
  // (`claude://`) leave this page open, so it must not stay locked in the
  // submitting state.
  result: { decision: ConsentDecision; redirectUrl: string } | null;
};

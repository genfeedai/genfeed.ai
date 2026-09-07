export type OAuthDecisionResponse = {
  error?: string;
  error_description?: string;
  redirectUrl?: string;
};

export type ConsentState = {
  error: string | null;
  isSubmitting: boolean;
};

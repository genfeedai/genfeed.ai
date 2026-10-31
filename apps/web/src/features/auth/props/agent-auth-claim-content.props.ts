export type ClaimResponse = {
  detail?: string;
  error?: string;
  error_description?: string;
  message?: string;
  status?: string;
};

export type ClaimDetails = {
  expires_at: string;
  requested_scopes: string[];
  status: 'claimed' | 'pending';
};

export type ClaimState = {
  error: string | null;
  isComplete: boolean;
  isSubmitting: boolean;
};

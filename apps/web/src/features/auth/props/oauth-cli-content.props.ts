export interface DesktopAuthorizeResponse {
  code: string;
  expiresAt: string;
  state: string;
}

export type DesktopAuthCodeStatus = 'exchanged' | 'expired' | 'pending';

export type FlowStep =
  | 'validating'
  | 'signing-in'
  | 'requesting-token'
  | 'redirecting'
  | 'awaiting-desktop'
  | 'success'
  | 'error';

export interface FlowState {
  step: FlowStep;
  error: string | null;
  apiKey?: string | null;
}

export interface DesktopIdentity {
  firstName?: string | null;
  id?: string;
  lastName?: string | null;
  primaryEmailAddress?: {
    emailAddress?: string | null;
  } | null;
}

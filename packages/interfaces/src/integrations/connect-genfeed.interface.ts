export type ConnectGenfeedClient = 'claude-code' | 'codex' | 'generic';

export type ConnectGenfeedVerificationFailure =
  | 'invalid_key'
  | 'invalid_scope'
  | 'unreachable_endpoint';

export interface ConnectGenfeedInstructions {
  client: ConnectGenfeedClient;
  configuration: string;
  environmentCommand: string;
  primaryCommand?: string;
  verifyCommand?: string;
}

export interface ConnectGenfeedPublishingReadiness {
  connectedAccountCount: number;
  isReady: boolean;
}

export interface ConnectGenfeedVerificationSuccess {
  keyId: string;
  publishing: ConnectGenfeedPublishingReadiness;
  status: 'connected';
  verifiedAt: string;
}

export interface ConnectGenfeedVerificationFailureResult {
  message: string;
  missingScopes?: string[];
  reason: ConnectGenfeedVerificationFailure;
  status: 'failed';
}

export type ConnectGenfeedVerificationResult =
  | ConnectGenfeedVerificationFailureResult
  | ConnectGenfeedVerificationSuccess;

export interface VerifyConnectGenfeedPayload {
  key: string;
}

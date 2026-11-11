export enum AgentTransferDeliveryMode {
  SEND = 'SEND',
  SEND_AND_RUN = 'SEND_AND_RUN',
}

export enum AgentTransferStatus {
  /** A hand-off to a teammate's agent that the teammate has not answered (#9940). */
  AWAITING_ACCEPTANCE = 'AWAITING_ACCEPTANCE',
  /** A hand-off the teammate declined (#9940). */
  DECLINED = 'DECLINED',
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  DEPTH_LIMIT_REACHED = 'DEPTH_LIMIT_REACHED',
}

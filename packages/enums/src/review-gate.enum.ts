export enum ReviewGateStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  TIMEOUT = 'timeout',
}

export enum NotificationChannel {
  EMAIL = 'email',
  WEBHOOK = 'webhook',
  SLACK = 'slack',
}

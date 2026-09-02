import type { QueueName } from '@genfeedai/contracts/queue';

export interface OperationalQueueHealthSnapshot {
  active: number;
  capturedAt: string;
  delayed: number;
  failed: number;
  oldestWaitingAgeSeconds: number;
  queueName: string;
  stalledEvents: number;
  stalledJobIds: string[];
  waiting: number;
}

export interface QueueHealthSnapshot extends OperationalQueueHealthSnapshot {
  queueName: QueueName;
}

export interface QueueHealthThresholds {
  maxFailed: number;
  maxOldestWaitingAgeSeconds: number;
  maxWaiting: number;
}

export type QueueHealthBreach =
  | {
      actual: number;
      kind: 'failed';
      threshold: number;
    }
  | {
      actual: number;
      kind: 'oldest-waiting-age-seconds';
      threshold: number;
    }
  | {
      actual: number;
      kind: 'waiting';
      threshold: number;
    };

export interface QueueHealthNotification {
  breaches: QueueHealthBreach[];
  incidentStartedAt: string;
  kind: 'breach' | 'recovery';
  snapshot: QueueHealthSnapshot;
}

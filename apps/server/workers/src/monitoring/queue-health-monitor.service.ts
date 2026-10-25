import {
  ALL_QUEUE_NAMES,
  hasQueueConsumer,
  type QueueName,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import type {
  OperationalQueueHealthSnapshot,
  QueueHealthBreach,
  QueueHealthSnapshot,
  QueueHealthThresholds,
} from '@workers/monitoring/queue-health.types';
import { QueueHealthAlertNotifierService } from '@workers/monitoring/queue-health-alert-notifier.service';
import type Redis from 'ioredis';
import { z } from 'zod';

const SNAPSHOT_PREFIX = 'genfeed:monitoring:queue-health:snapshot';
const INCIDENT_STATE_PREFIX = 'genfeed:monitoring:queue-health:incident';
const ALERT_DEDUPE_PREFIX = 'genfeed:monitoring:queue-health:alert';
const SNAPSHOT_TTL_SECONDS = 15 * 60;
const INCIDENT_STATE_TTL_SECONDS = 7 * 24 * 60 * 60;
const CONTRACT_QUEUE_NAME_SET = new Set<string>(ALL_QUEUE_NAMES);

// The canonical consumed queue set bounds both script work and reply size.
// HMGET reads only the existing incident fields, regardless of extra hash fields.
const READ_INCIDENT_STATES_SCRIPT = `
local states = {}
for index, key in ipairs(KEYS) do
  local state = redis.pcall('HMGET', key, 'alerted', 'breachStartedAt', 'lastAlertAt', 'status')
  if state.err then
    states[index] = {key, false}
  else
    states[index] = {key, state}
  end
end
return states
`;
const INCIDENT_TIMESTAMP_SCHEMA = z
  .string()
  .refine(
    (value) =>
      value.trim().length > 0 &&
      Number.isFinite(Number(value)) &&
      Number(value) >= 0,
  );
const INCIDENT_STATE_REPLY_SCHEMA = z.tuple([
  z.string(),
  z.tuple([
    z.enum(['0', '1']).nullable(),
    INCIDENT_TIMESTAMP_SCHEMA.nullable(),
    INCIDENT_TIMESTAMP_SCHEMA.nullable(),
    z.enum(['healthy', 'breached']).nullable(),
  ]),
]);

interface QueueIncidentState {
  alerted?: string;
  breachStartedAt?: string;
  lastAlertAt?: string;
  status?: string;
}

@Injectable()
export class QueueHealthMonitorService {
  private readonly context = { service: QueueHealthMonitorService.name };

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly alertNotifier: QueueHealthAlertNotifierService,
  ) {}

  async processSnapshots(
    snapshots: OperationalQueueHealthSnapshot[],
    redis: Redis,
  ): Promise<void> {
    const states = this.readIncidentStates(snapshots, redis);
    const results = await Promise.allSettled(
      snapshots.map((snapshot) =>
        this.processSnapshot(snapshot, redis, states),
      ),
    );

    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        continue;
      }

      this.logger.error(
        `Queue health processing failed for ${snapshots[index]?.queueName ?? 'unknown queue'}`,
        result.reason,
        this.context,
      );
    }
  }

  private async readIncidentStates(
    snapshots: OperationalQueueHealthSnapshot[],
    redis: Redis,
  ): Promise<Map<QueueName, QueueIncidentState>> {
    const queueNames = [
      ...new Set(
        snapshots
          .map((snapshot) => snapshot.queueName)
          .filter(isQueueName)
          .filter(hasQueueConsumer),
      ),
    ];
    const states = new Map<QueueName, QueueIncidentState>();
    if (queueNames.length === 0) {
      return states;
    }

    const keys = queueNames.map(
      (queueName) => `${INCIDENT_STATE_PREFIX}:${queueName}`,
    );
    try {
      const result: unknown = await redis.eval(
        READ_INCIDENT_STATES_SCRIPT,
        keys.length,
        ...keys,
      );
      if (!Array.isArray(result) || result.length !== keys.length) {
        throw new Error('Malformed queue health incident batch');
      }

      for (const [index, queueName] of queueNames.entries()) {
        const parsed = INCIDENT_STATE_REPLY_SCHEMA.safeParse(result[index]);
        if (!parsed.success || parsed.data[0] !== keys[index]) {
          continue;
        }
        const [, [alerted, breachStartedAt, lastAlertAt, status]] = parsed.data;
        states.set(queueName, {
          alerted: alerted ?? undefined,
          breachStartedAt: breachStartedAt ?? undefined,
          lastAlertAt: lastAlertAt ?? undefined,
          status: status ?? undefined,
        });
      }
    } catch (error: unknown) {
      this.logger.error(
        'Queue health incident batch read failed',
        error,
        this.context,
      );
    }
    return states;
  }

  private async processSnapshot(
    snapshot: OperationalQueueHealthSnapshot,
    redis: Redis,
    states: Promise<Map<QueueName, QueueIncidentState>>,
  ): Promise<void> {
    await redis.set(
      `${SNAPSHOT_PREFIX}:${snapshot.queueName}`,
      JSON.stringify({
        active: snapshot.active,
        capturedAt: snapshot.capturedAt,
        delayed: snapshot.delayed,
        failed: snapshot.failed,
        oldestWaitingAgeSeconds: snapshot.oldestWaitingAgeSeconds,
        queueName: snapshot.queueName,
        stalledEvents: snapshot.stalledEvents,
        stalledJobIds: snapshot.stalledJobIds,
        waiting: snapshot.waiting,
      }),
      'EX',
      SNAPSHOT_TTL_SECONDS,
    );

    if (!isQueueName(snapshot.queueName)) {
      return;
    }

    // Queues with no registered consumer breach on every sweep by construction.
    // Paging on them trains responders to ignore the alert; the backlog is
    // tracked by the per-queue CloudWatch metrics instead.
    if (!hasQueueConsumer(snapshot.queueName)) {
      return;
    }

    const healthSnapshot: QueueHealthSnapshot = {
      ...snapshot,
      queueName: snapshot.queueName,
    };
    const breaches = this.resolveBreaches(healthSnapshot);
    const stateKey = `${INCIDENT_STATE_PREFIX}:${healthSnapshot.queueName}`;
    const state = (await states).get(healthSnapshot.queueName);
    if (!state) {
      throw new Error('Queue health incident state unavailable or malformed');
    }

    if (breaches.length > 0) {
      await this.processBreach(
        healthSnapshot,
        breaches,
        state,
        stateKey,
        redis,
      );
      return;
    }

    await this.processRecovery(healthSnapshot, state, stateKey, redis);
  }

  private resolveBreaches(snapshot: QueueHealthSnapshot): QueueHealthBreach[] {
    const thresholds: QueueHealthThresholds = {
      maxFailed: this.configService.queueHealthMaxFailed,
      maxOldestWaitingAgeSeconds:
        this.configService.queueHealthMaxOldestWaitingAgeSeconds,
      maxWaiting: this.configService.queueHealthMaxWaiting,
    };
    const breaches: QueueHealthBreach[] = [];

    if (snapshot.waiting > thresholds.maxWaiting) {
      breaches.push({
        actual: snapshot.waiting,
        kind: 'waiting',
        threshold: thresholds.maxWaiting,
      });
    }
    if (
      snapshot.oldestWaitingAgeSeconds > thresholds.maxOldestWaitingAgeSeconds
    ) {
      breaches.push({
        actual: snapshot.oldestWaitingAgeSeconds,
        kind: 'oldest-waiting-age-seconds',
        threshold: thresholds.maxOldestWaitingAgeSeconds,
      });
    }
    if (snapshot.failed > thresholds.maxFailed) {
      breaches.push({
        actual: snapshot.failed,
        kind: 'failed',
        threshold: thresholds.maxFailed,
      });
    }

    return breaches;
  }

  private async processBreach(
    snapshot: QueueHealthSnapshot,
    breaches: QueueHealthBreach[],
    state: QueueIncidentState,
    stateKey: string,
    redis: Redis,
  ): Promise<void> {
    const now = Date.now();
    const isNewIncident = state.status !== 'breached';
    const incidentStartedAtMs = isNewIncident
      ? now
      : readTimestamp(state.breachStartedAt, now);

    if (isNewIncident) {
      await redis.hset(
        stateKey,
        'status',
        'breached',
        'breachStartedAt',
        String(incidentStartedAtMs),
        'alerted',
        '0',
      );
      await redis.hdel(stateKey, 'lastAlertAt');
    }
    await redis.expire(stateKey, INCIDENT_STATE_TTL_SECONDS);

    const lastAlertAtMs = readTimestamp(state.lastAlertAt, 0);
    if (
      !isNewIncident &&
      lastAlertAtMs > 0 &&
      now - lastAlertAtMs < this.configService.queueHealthAlertThrottleMs
    ) {
      return;
    }

    const dedupeKey = `${ALERT_DEDUPE_PREFIX}:breach:${snapshot.queueName}:${incidentStartedAtMs}`;
    const acquired = await redis.set(
      dedupeKey,
      '1',
      'PX',
      this.configService.queueHealthAlertThrottleMs,
      'NX',
    );
    if (acquired !== 'OK') {
      return;
    }

    try {
      await this.alertNotifier.notify({
        breaches,
        incidentStartedAt: new Date(incidentStartedAtMs).toISOString(),
        kind: 'breach',
        snapshot,
      });
    } catch (error: unknown) {
      await redis.del(dedupeKey);
      throw error;
    }

    // Keep the dedupe lock when state persistence fails after delivery. That
    // prevents a delivered alert from being repeated on the next sweep.
    await redis.hset(stateKey, 'alerted', '1', 'lastAlertAt', String(now));
  }

  private async processRecovery(
    snapshot: QueueHealthSnapshot,
    state: QueueIncidentState,
    stateKey: string,
    redis: Redis,
  ): Promise<void> {
    if (state.status !== 'breached') {
      await redis.hset(stateKey, 'status', 'healthy');
      await redis.expire(stateKey, INCIDENT_STATE_TTL_SECONDS);
      return;
    }

    const incidentStartedAtMs = readTimestamp(
      state.breachStartedAt,
      Date.now(),
    );
    if (state.alerted === '1') {
      const dedupeKey = `${ALERT_DEDUPE_PREFIX}:recovery:${snapshot.queueName}:${incidentStartedAtMs}`;
      const acquired = await redis.set(
        dedupeKey,
        '1',
        'PX',
        this.configService.queueHealthAlertThrottleMs,
        'NX',
      );
      if (acquired !== 'OK') {
        return;
      }

      try {
        await this.alertNotifier.notify({
          breaches: [],
          incidentStartedAt: new Date(incidentStartedAtMs).toISOString(),
          kind: 'recovery',
          snapshot,
        });
      } catch (error: unknown) {
        await redis.del(dedupeKey);
        throw error;
      }
    }

    await redis.hset(stateKey, 'status', 'healthy');
    await redis.hdel(stateKey, 'alerted', 'breachStartedAt', 'lastAlertAt');
    await redis.expire(stateKey, INCIDENT_STATE_TTL_SECONDS);
  }
}

function isQueueName(value: string): value is QueueName {
  return CONTRACT_QUEUE_NAME_SET.has(value);
}

function readTimestamp(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

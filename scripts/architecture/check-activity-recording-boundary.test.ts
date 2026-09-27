import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkActivityRecordingBoundary,
  findStaleAllowances,
} from './check-activity-recording-boundary';

const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function fixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'activity-recording-'));
  testDirs.push(rootDir);

  for (const [file, source] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }

  return rootDir;
}

const RECORDER =
  'apps/server/api/src/services/activity-recording/activity-recording.core.ts';
const WRITER =
  'apps/server/api/src/services/activity-recording/notification-outbox.writer.ts';
const PRODUCER = 'apps/server/api/src/collections/posts/posts.service.ts';

describe('activity recording boundary guard', () => {
  it('accepts writes owned by the recording API', () => {
    const rootDir = fixture({
      [RECORDER]: 'await transaction.activity.create({ data });',
      [WRITER]:
        'await client.notificationEvent.upsert({});\nawait client.notificationDelivery.upsert({});',
      [PRODUCER]: 'await this.activityRecorder.record({ key });',
    });

    expect(checkActivityRecordingBoundary({ allowlist: [], rootDir })).toEqual(
      [],
    );
  });

  it.each([
    ['activity-row-write', 'await this.prisma.activity.create({ data });'],
    ['activity-row-write', 'await tx.activity.createMany({ data: rows });'],
    [
      'activities-service-write',
      'await this.activitiesService.create({ key });',
    ],
    [
      'activities-service-write',
      'await this.activitiesService?.patch(id, { key });',
    ],
    ['outbox-write', 'await tx.notificationEvent.create({ data });'],
    ['outbox-write', 'await tx.notificationDelivery.createMany({ data });'],
    ['outbox-write', 'await tx.notificationInboxItem.upsert({});'],
    [
      'redis-notifications-publish',
      "await this.redis.publish('notifications', payload);",
    ],
    [
      'legacy-send-notification',
      'await this.notificationsService.sendNotification(event);',
    ],
  ])('rejects %s outside the recording API', (rule, source) => {
    const rootDir = fixture({ [PRODUCER]: `\n${source}` });

    expect(checkActivityRecordingBoundary({ allowlist: [], rootDir })).toEqual([
      expect.objectContaining({ file: PRODUCER, line: 2, rule }),
    ]);
  });

  it('rejects an activity write in the outbox writer and an outbox write in the core', () => {
    const rootDir = fixture({
      [RECORDER]: 'await transaction.notificationEvent.create({});',
      [WRITER]: 'await client.activity.create({});',
    });

    expect(
      checkActivityRecordingBoundary({ allowlist: [], rootDir }).map(
        (violation) => violation.rule,
      ),
    ).toEqual(['outbox-write']);
  });

  it('ignores specs, tests and seeds', () => {
    const rootDir = fixture({
      'apps/server/api/src/collections/posts/posts.service.spec.ts':
        'await prisma.activity.create({});',
      'apps/server/api/test/integration/inbox.integration.spec.ts':
        'await prisma.notificationEvent.create({});',
      'apps/server/api/scripts/seeds/local-debug-data.seed.ts':
        'await prisma.activity.create({});',
    });

    expect(checkActivityRecordingBoundary({ allowlist: [], rootDir })).toEqual(
      [],
    );
  });

  it('honours an allowlisted exception and reports it once stale', () => {
    const allowlist = [
      {
        file: PRODUCER,
        reason: 'test',
        rule: 'activities-service-write' as const,
      },
    ];
    const rootDir = fixture({
      [PRODUCER]: 'await this.activitiesService.patch(id, { isRead: true });',
    });

    expect(checkActivityRecordingBoundary({ allowlist, rootDir })).toEqual([]);
    expect(findStaleAllowances({ allowlist, rootDir })).toEqual([]);

    const cleanRoot = fixture({ [PRODUCER]: 'export {};' });
    expect(findStaleAllowances({ allowlist, rootDir: cleanRoot })).toEqual(
      allowlist,
    );
  });
});

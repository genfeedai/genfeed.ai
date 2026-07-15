#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type ConversationShellGateReport,
  type ConversationShellGateSnapshot,
  evaluateConversationShellGates,
} from '../../packages/config/src/conversation-shell-gates';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const snapshotPath = process.argv[2];
if (!snapshotPath) {
  fail(
    'Usage: bun run conversation-shell:gates -- <cohort-gate-snapshot.json>',
  );
}

let snapshot: unknown;
try {
  snapshot = JSON.parse(readFileSync(resolve(snapshotPath), 'utf8'));
} catch (error: unknown) {
  fail(
    `Unable to read gate snapshot: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
}

if (
  !snapshot ||
  typeof snapshot !== 'object' ||
  (snapshot as { telemetryQueryVersion?: unknown }).telemetryQueryVersion !== 1
) {
  fail('Gate snapshot must be a telemetry query v1 JSON object.');
}

let report: ConversationShellGateReport;
try {
  report = evaluateConversationShellGates(
    snapshot as ConversationShellGateSnapshot,
  );
} catch (error: unknown) {
  fail(
    `Invalid gate snapshot: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
}
console.log(JSON.stringify(report, null, 2));

if (!report.isPassed) {
  process.exit(1);
}

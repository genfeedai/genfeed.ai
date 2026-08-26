import { createHash } from 'node:crypto';

import { applyTrackerLabel } from './ci-tracker-labels.mjs';
import { triageCiFailureOnProject } from './genfeed-project-board.mjs';

export const SCHEDULED_FAILURE_MARKER = 'genfeed-scheduled-failure:v1';
export const PUBLIC_EXCERPT_LIMIT = 1_200;
export const SIGNATURE_LIMIT = 240;
export const TRANSIENT_RECURRENCE_THRESHOLD = 2;
export const RECOVERY_GREEN_THRESHOLD = 3;

const FAILURE_CLASSES = [
  {
    name: 'timeout',
    transient: false,
    pattern: /\b(?:timed? out|timeout|exceeded the time limit|hung)\b/iu,
  },
  {
    name: 'cancellation',
    transient: true,
    pattern:
      /\b(?:cancelled|canceled|runner shutdown|workflow was cancelled)\b/iu,
  },
  {
    name: 'coverage-threshold',
    transient: false,
    pattern:
      /(?:coverage[\s\S]{0,80}(?:threshold|below|does not meet|failed)|(?:threshold|minimum)[\s\S]{0,80}coverage)/iu,
  },
  {
    name: 'missing-report',
    transient: false,
    pattern:
      /(?:missing|no|expected)[\s\S]{0,80}(?:coverage|test|playwright|vitest)?\s*(?:report|artifact)|ENOENT[\s\S]{0,80}(?:report|artifact)/iu,
  },
  {
    name: 'test-assertion',
    transient: false,
    pattern:
      /\b(?:AssertionError|assertion failed|expect(?:ed|\()|received|test (?:suite )?failed|tests? failed|playwright test)\b/iu,
  },
  {
    name: 'workflow-contract',
    transient: false,
    pattern:
      /(?:invalid workflow|workflow (?:contract|syntax)|yaml (?:error|parse)|unknown key|unexpected value)/iu,
  },
  {
    name: 'runner-infrastructure',
    transient: true,
    pattern:
      /(?:runner (?:lost|offline|unavailable)|hosted runner|ECONNRESET|ENOSPC|network (?:error|unavailable)|service unavailable|rate limit|artifact (?:upload|download) failed)/iu,
  },
];

const ANSI_ESCAPE_PATTERN = new RegExp(
  `${String.fromCodePoint(27)}\\[[0-?]*[ -/]*[@-~]`,
  'gu',
);

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(ANSI_ESCAPE_PATTERN, '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[\t ]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .trim();
}

export function redactPublicEvidence(value, limit = PUBLIC_EXCERPT_LIMIT) {
  const redacted = normalizeWhitespace(value)
    .replace(
      /-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/giu,
      '[REDACTED PRIVATE KEY]',
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu,
      '[REDACTED TOKEN]',
    )
    .replace(/\bAKIA[0-9A-Z]{16}\b/gu, '[REDACTED AWS KEY]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/giu, 'Bearer [REDACTED]')
    .replace(
      /\b(token|password|passwd|secret|api[_-]?key|authorization|credential)\b(\s*[:=]\s*|\s+)([^\s,;]+)/giu,
      (_match, key, separator) => `${key}${separator}[REDACTED]`,
    )
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, '$1[REDACTED]@')
    .replace(/```/gu, "'''");

  if (redacted.length <= limit) {
    return redacted;
  }

  const suffix = '\n…[excerpt truncated]';
  return `${redacted.slice(0, Math.max(0, limit - suffix.length)).trimEnd()}${suffix}`;
}

export function normalizeFailureSignature(value) {
  const signature = redactPublicEvidence(value, SIGNATURE_LIMIT * 3)
    .toLowerCase()
    .replace(/https?:\/\/\S+/gu, '<url>')
    .replace(/\b[0-9a-f]{40}\b/giu, '<sha>')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu,
      '<uuid>',
    )
    .replace(
      /\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z\b/giu,
      '<timestamp>',
    )
    .replace(/:\d+(?::\d+)?\b/gu, ':<line>')
    .replace(
      /\b\d+(?:\.\d+)?\s*(?:ms|s|sec|seconds?|minutes?)\b/giu,
      '<duration>',
    )
    .replace(/\b\d+\b/gu, '<n>')
    .replace(/\s+/gu, ' ')
    .trim();

  return signature.slice(0, SIGNATURE_LIMIT);
}

export function classifyScheduledFailure(excerpt) {
  const publicExcerpt = redactPublicEvidence(excerpt);
  const match = FAILURE_CLASSES.find(({ pattern }) =>
    pattern.test(publicExcerpt),
  );
  const failureClass = match?.name ?? 'unknown';
  const transient = match?.transient ?? false;

  return {
    failureClass,
    publicExcerpt,
    signature: normalizeFailureSignature(publicExcerpt || failureClass),
    transient,
    suppressionReason: transient
      ? `Transient ${failureClass} noise requires ${TRANSIENT_RECURRENCE_THRESHOLD} consecutive occurrences before implementation routing.`
      : null,
  };
}

export function computeFailureFingerprint({
  workflowIdentity,
  failedJob,
  failureClass,
  signature,
}) {
  return createHash('sha256')
    .update(
      [workflowIdentity, failedJob, failureClass, signature]
        .map((part) =>
          String(part ?? '')
            .trim()
            .toLowerCase(),
        )
        .join('\n'),
    )
    .digest('hex');
}

function markerForState(state) {
  const encoded = Buffer.from(JSON.stringify(state), 'utf8').toString(
    'base64url',
  );
  return `<!-- ${SCHEDULED_FAILURE_MARKER}:${encoded} -->`;
}

export function parseTrackerState(body) {
  const marker = String(body ?? '').match(
    new RegExp(`<!-- ${SCHEDULED_FAILURE_MARKER}:([A-Za-z0-9_-]+) -->`, 'u'),
  );
  if (!marker) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(marker[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function shortSha(sha) {
  return String(sha ?? 'unknown').slice(0, 12);
}

export function buildScheduledFailureBody({ state, excerpt, reproduction }) {
  const recovery =
    state.status === 'suppressed'
      ? `Suppressed with reason: ${state.suppressionReason}`
      : state.status === 'resolved'
        ? `Resolved after ${state.greenStreak} consecutive scheduled green run(s).`
        : state.greenStreak > 0
          ? `Recovering: ${state.greenStreak}/${RECOVERY_GREEN_THRESHOLD} consecutive scheduled greens.`
          : 'Active: awaiting a consecutive-green recovery window.';

  return [
    markerForState(state),
    `## Problem`,
    `The scheduled **${state.workflowIdentity}** contract failed in **${state.failedJob}**.`,
    ``,
    `## Bounded evidence`,
    `- Failure class: \`${state.failureClass}\``,
    `- Fingerprint: \`${state.fingerprint}\``,
    `- Occurrences: **${state.occurrences}**`,
    `- First seen: ${state.firstSeenAt} at \`${shortSha(state.firstSha)}\` — ${state.firstRunUrl}`,
    `- Last seen: ${state.lastSeenAt} at \`${shortSha(state.lastSha)}\` — ${state.lastRunUrl}`,
    `- Recovery: ${recovery}`,
    ``,
    '```text',
    excerpt || '(No public diagnostic excerpt was available.)',
    '```',
    ``,
    `## Reproduction`,
    reproduction,
    ``,
    `## Acceptance criteria`,
    `- The failing scheduled job completes successfully for the same workflow contract.`,
    `- The root cause is covered by a focused regression or executable workflow contract.`,
    `- Public diagnostics remain bounded and credential-free.`,
    ``,
    `## Verification plan`,
    `Re-run the scheduled workflow path, inspect the linked job evidence, and retain this tracker until ${RECOVERY_GREEN_THRESHOLD} consecutive scheduled runs are green.`,
  ].join('\n');
}

async function listTrackerIssues(github, { owner, repo, label, state }) {
  return github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state,
    labels: label,
    sort: 'created',
    direction: 'asc',
    per_page: 100,
  });
}

async function ensureTrackerLabel(github, { owner, repo, label, description }) {
  try {
    await github.rest.issues.getLabel({ owner, repo, name: label });
  } catch (error) {
    if (error?.status !== 404) {
      throw error;
    }
    await github.rest.issues.createLabel({
      owner,
      repo,
      name: label,
      color: 'b60205',
      description,
    });
  }
}

function matchingTrackers(issues, fingerprint) {
  return (issues ?? [])
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({ issue, state: parseTrackerState(issue.body) }))
    .filter(({ state }) => state?.fingerprint === fingerprint)
    .sort(
      (left, right) => Number(left.issue.number) - Number(right.issue.number),
    );
}

function mergeTrackerStates(trackers, fallback) {
  if (trackers.length === 0) {
    return fallback;
  }
  const states = trackers.map(({ state }) => state);
  const earliest = [...states].sort((a, b) =>
    String(a.firstSeenAt).localeCompare(String(b.firstSeenAt)),
  )[0];
  const latest = [...states].sort((a, b) =>
    String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)),
  )[0];

  return {
    ...fallback,
    occurrences: states.reduce(
      (total, state) => total + Math.max(1, Number(state.occurrences) || 1),
      0,
    ),
    firstSeenAt: earliest.firstSeenAt,
    firstSha: earliest.firstSha,
    firstRunUrl: earliest.firstRunUrl,
    lastSeenAt: latest.lastSeenAt,
    lastSha: latest.lastSha,
    lastRunUrl: latest.lastRunUrl,
  };
}

async function updateTracker(
  github,
  {
    owner,
    repo,
    issueNumber,
    state,
    excerpt,
    reproduction,
    issueState,
    stateReason,
  },
) {
  await github.rest.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    body: buildScheduledFailureBody({ state, excerpt, reproduction }),
    ...(issueState ? { state: issueState } : {}),
    ...(stateReason ? { state_reason: stateReason } : {}),
  });
}

async function promoteTracker(
  github,
  { owner, repo, issueNumber, trackerLabel, core },
) {
  await applyTrackerLabel(github, {
    owner,
    repo,
    issueNumber,
    label: 'codex:automation',
  });
  await triageCiFailureOnProject(github, {
    owner,
    repo,
    issueNumber,
    trackerName: trackerLabel,
    core,
  });
}

export async function reportScheduledFailure({
  github,
  owner,
  repo,
  trackerLabel,
  trackerDescription,
  workflowIdentity,
  failedJob,
  excerpt,
  sha,
  runId,
  runAttempt = 1,
  runUrl,
  occurredAt = new Date().toISOString(),
  reproduction = `Dispatch ${workflowIdentity} again after applying a focused fix.`,
  core = console,
}) {
  const classification = classifyScheduledFailure(excerpt);
  const fingerprint = computeFailureFingerprint({
    workflowIdentity,
    failedJob,
    failureClass: classification.failureClass,
    signature: classification.signature,
  });
  const initialState = {
    fingerprint,
    workflowIdentity,
    failedJob,
    failureClass: classification.failureClass,
    signature: classification.signature,
    publicExcerpt: classification.publicExcerpt,
    occurrences: 1,
    transientStreak: classification.transient ? 1 : 0,
    firstSeenAt: occurredAt,
    lastSeenAt: occurredAt,
    firstSha: sha,
    lastSha: sha,
    firstRunId: runId,
    lastRunId: runId,
    firstRunAttempt: runAttempt,
    lastRunAttempt: runAttempt,
    firstRunUrl: runUrl,
    lastRunUrl: runUrl,
    greenStreak: 0,
    status: classification.transient ? 'suppressed' : 'active',
    suppressionReason: classification.suppressionReason,
  };

  await ensureTrackerLabel(github, {
    owner,
    repo,
    label: trackerLabel,
    description: trackerDescription,
  });

  const allIssues = await listTrackerIssues(github, {
    owner,
    repo,
    label: trackerLabel,
    state: 'all',
  });
  let trackers = matchingTrackers(allIssues, fingerprint);
  let canonical = trackers[0];
  let state = initialState;
  let created = false;

  if (canonical) {
    const previous = canonical.state;
    const resumesAfterGreen =
      previous.status === 'resolved' || previous.greenStreak > 0;
    const occurrences = (Number(previous.occurrences) || 1) + 1;
    const transientStreak = classification.transient
      ? resumesAfterGreen
        ? 1
        : (Number(previous.transientStreak) || 1) + 1
      : 0;
    const actionable =
      !classification.transient ||
      previous.status === 'active' ||
      transientStreak >= TRANSIENT_RECURRENCE_THRESHOLD;
    state = {
      ...previous,
      occurrences,
      transientStreak,
      lastSeenAt: occurredAt,
      lastSha: sha,
      lastRunId: runId,
      lastRunAttempt: runAttempt,
      lastRunUrl: runUrl,
      greenStreak: 0,
      status: actionable ? 'active' : 'suppressed',
      suppressionReason: actionable ? null : classification.suppressionReason,
      publicExcerpt: classification.publicExcerpt,
    };
    await updateTracker(github, {
      owner,
      repo,
      issueNumber: canonical.issue.number,
      state,
      excerpt: classification.publicExcerpt,
      reproduction,
      issueState: actionable ? 'open' : undefined,
    });
    if (actionable) {
      await promoteTracker(github, {
        owner,
        repo,
        issueNumber: canonical.issue.number,
        trackerLabel,
        core,
      });
    }
    return {
      action: actionable
        ? previous.status === 'suppressed'
          ? 'promoted'
          : 'updated'
        : 'suppressed',
      issueNumber: canonical.issue.number,
      fingerprint,
      reason: actionable ? null : classification.suppressionReason,
    };
  }

  const title = `[Scheduled failure] ${workflowIdentity} / ${failedJob} / ${classification.failureClass} [${fingerprint.slice(0, 12)}]`;
  const createdIssue = await github.rest.issues.create({
    owner,
    repo,
    title,
    body: buildScheduledFailureBody({
      state,
      excerpt: classification.publicExcerpt,
      reproduction,
    }),
  });
  created = true;
  await applyTrackerLabel(github, {
    owner,
    repo,
    issueNumber: createdIssue.data.number,
    label: trackerLabel,
  });

  const afterCreate = await listTrackerIssues(github, {
    owner,
    repo,
    label: trackerLabel,
    state: 'all',
  });
  trackers = matchingTrackers(afterCreate, fingerprint);
  canonical = trackers[0] ?? { issue: createdIssue.data, state };
  state = mergeTrackerStates(trackers, state);

  await updateTracker(github, {
    owner,
    repo,
    issueNumber: canonical.issue.number,
    state,
    excerpt: classification.publicExcerpt,
    reproduction,
  });

  for (const duplicate of trackers.slice(1)) {
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: duplicate.issue.number,
      state: 'closed',
      state_reason: 'not_planned',
    });
  }

  if (classification.transient) {
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: canonical.issue.number,
      state: 'closed',
      state_reason: 'not_planned',
    });
    core.info?.(
      `Suppressed ${fingerprint}: ${classification.suppressionReason}`,
    );
    return {
      action: 'suppressed',
      issueNumber: canonical.issue.number,
      fingerprint,
      reason: classification.suppressionReason,
    };
  }

  await promoteTracker(github, {
    owner,
    repo,
    issueNumber: canonical.issue.number,
    trackerLabel,
    core,
  });
  return {
    action:
      created && canonical.issue.number === createdIssue.data.number
        ? 'created'
        : 'updated',
    issueNumber: canonical.issue.number,
    fingerprint,
    reason: null,
  };
}

export async function recordScheduledWorkflowGreen({
  github,
  owner,
  repo,
  trackerLabel,
  workflowIdentity,
  sha,
  runId,
  runUrl,
  occurredAt = new Date().toISOString(),
  core = console,
}) {
  const allIssues = await listTrackerIssues(github, {
    owner,
    repo,
    label: trackerLabel,
    state: 'all',
  });
  const trackers = (allIssues ?? [])
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({ issue, state: parseTrackerState(issue.body) }))
    .filter(
      ({ issue, state }) =>
        state?.workflowIdentity === workflowIdentity &&
        (state.status === 'suppressed' ||
          (state.status === 'active' && issue.state === 'open')),
    );

  if (trackers.length === 0) {
    core.info?.(
      `No active ${workflowIdentity} scheduled-failure trackers need recovery.`,
    );
    return {
      action: 'noop',
      recovered: [],
      closed: [],
      resetSuppressed: [],
    };
  }

  const recovered = [];
  const closed = [];
  const resetSuppressed = [];
  for (const tracker of trackers) {
    if (tracker.state.status === 'suppressed') {
      const state = {
        ...tracker.state,
        greenStreak: 1,
        transientStreak: 0,
        status: 'resolved',
        lastGreenAt: occurredAt,
        lastGreenSha: sha,
        lastGreenRunId: runId,
        lastGreenRunUrl: runUrl,
      };
      await updateTracker(github, {
        owner,
        repo,
        issueNumber: tracker.issue.number,
        state,
        excerpt: tracker.state.publicExcerpt,
        reproduction: `Dispatch ${workflowIdentity} again after applying a focused fix.`,
      });
      resetSuppressed.push(tracker.issue.number);
      continue;
    }

    const greenStreak = (Number(tracker.state.greenStreak) || 0) + 1;
    const resolved = greenStreak >= RECOVERY_GREEN_THRESHOLD;
    const state = {
      ...tracker.state,
      greenStreak,
      status: resolved ? 'resolved' : 'active',
      lastGreenAt: occurredAt,
      lastGreenSha: sha,
      lastGreenRunId: runId,
      lastGreenRunUrl: runUrl,
    };
    await updateTracker(github, {
      owner,
      repo,
      issueNumber: tracker.issue.number,
      state,
      excerpt: tracker.state.publicExcerpt ?? '(See the linked failure run.)',
      reproduction: `Dispatch ${workflowIdentity} again after applying a focused fix.`,
      issueState: resolved ? 'closed' : undefined,
      stateReason: resolved ? 'completed' : undefined,
    });
    if (resolved) {
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: tracker.issue.number,
        body: `Resolved after ${RECOVERY_GREEN_THRESHOLD} consecutive scheduled greens. Last green: ${runUrl} at \`${shortSha(sha)}\`.`,
      });
      closed.push(tracker.issue.number);
    } else {
      recovered.push(tracker.issue.number);
    }
  }

  return {
    action:
      closed.length > 0
        ? 'closed'
        : recovered.length > 0
          ? 'recovering'
          : 'reset-suppression',
    recovered,
    closed,
    resetSuppressed,
  };
}

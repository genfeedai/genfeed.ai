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

function normalizeFailureSignatureVolatility(value) {
  return redactPublicEvidence(value, SIGNATURE_LIMIT * 3)
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
    .replace(
      /\b\d+(?:\.\d+)?\s*(?:ms|s|sec|seconds?|minutes?)\b/giu,
      '<duration>',
    )
    .replace(/\s+/gu, ' ')
    .trim();
}

export function normalizeFailureSignature(value) {
  const signature = normalizeFailureSignatureVolatility(value)
    .replace(/:\d+(?::\d+)?\b/gu, ':<line>')
    .replace(/\b\d+\b/gu, '<n>');
  return signature.slice(0, SIGNATURE_LIMIT);
}

function normalizeActionableScenarioSignature(value) {
  const signature = normalizeFailureSignatureVolatility(value).replace(
    /(\.(?:spec|test)\.[cm]?[jt]sx?):\d+(?::\d+)?\b/giu,
    '$1:<line>',
  );

  return signature.slice(0, SIGNATURE_LIMIT);
}

function stripWorkflowLogPrefix(line) {
  return String(line ?? '')
    .replace(/^\ufeff/gu, '')
    .replace(/^(?:[^\t\n]*\t){2}/gu, '')
    .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s*/gu, '')
    .replace(/^##\[(?:error|notice|warning)\]\s*/giu, '')
    .trim();
}

const ACTIONABLE_SCENARIO_PATTERNS = [
  /^(\[[^\]]+\]\s+›\s+.+?\.(?:spec|test)\.[cm]?[jt]sx?:\d+:\d+\s+›\s+.+)$/u,
  /^(?:FAIL|FAILED)\s+(.+?\.(?:spec|test)\.[cm]?[jt]sx?(?:\s+>\s+.+)?)$/iu,
  /^[×✖✗]\s+(.+)$/u,
  /^\(fail\)\s+(.+)$/iu,
];

export function extractActionableFailureScenarios(log) {
  const scenarios = [];
  const signatures = new Set();

  for (const rawLine of String(log ?? '').split('\n')) {
    const line = stripWorkflowLogPrefix(rawLine);
    const match = ACTIONABLE_SCENARIO_PATTERNS.map((pattern) =>
      line.match(pattern),
    ).find(Boolean);
    const scenario = match?.[1]?.trim();
    if (!scenario) {
      continue;
    }

    const signature = normalizeActionableScenarioSignature(scenario);
    if (!signature || signatures.has(signature)) {
      continue;
    }
    signatures.add(signature);
    scenarios.push(redactPublicEvidence(scenario));
  }

  return scenarios;
}

function decodeWorkflowLog(data) {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
      'utf8',
    );
  }
  return String(data ?? '');
}

function fallbackFailureExcerpt(job) {
  const failedStep = job.steps?.find((step) =>
    ['failure', 'cancelled', 'timed_out'].includes(step.conclusion),
  );
  const step = failedStep?.name ? ` in ${failedStep.name}` : '';
  return `Scheduled job ${job.name} ${job.conclusion ?? 'failed'}${step}.`;
}

export async function collectScheduledRunFailures({
  github,
  owner,
  repo,
  jobs,
  core = console,
}) {
  const failures = [];
  const failedJobs = [...(jobs ?? [])]
    .filter((job) =>
      ['failure', 'cancelled', 'timed_out'].includes(job.conclusion),
    )
    .sort(
      (left, right) =>
        String(left.name).localeCompare(String(right.name)) ||
        Number(left.databaseId ?? left.id) -
          Number(right.databaseId ?? right.id),
    );

  for (const job of failedJobs) {
    const jobId = job.databaseId ?? job.id;
    let log = '';
    if (jobId) {
      try {
        const response = await github.request(
          'GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs',
          {
            owner,
            repo,
            job_id: jobId,
          },
        );
        log = decodeWorkflowLog(response.data);
      } catch (error) {
        core.warning?.(
          `Could not download logs for scheduled job ${job.name} (${jobId}): ${error.message}`,
        );
      }
    }

    const scenarios = extractActionableFailureScenarios(log);
    if (scenarios.length === 0) {
      failures.push({
        failedJob: job.trackerJob ?? job.name,
        excerpt: job.fallbackExcerpt ?? fallbackFailureExcerpt(job),
      });
      continue;
    }

    for (const scenario of scenarios) {
      const excerpt = `Test failed: ${scenario}`;
      failures.push({
        failedJob: job.trackerJob ?? job.name,
        excerpt,
        identitySignature: normalizeActionableScenarioSignature(excerpt),
      });
    }
  }

  return failures;
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
    `- Actionable signature: \`${state.signature}\``,
    `- Fingerprint: \`${state.fingerprint}\``,
    `- Recurrence policy: reopen the oldest canonical tracker for this actionable signature.`,
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

async function listTrackerIssues(github, { owner, repo }) {
  return github.paginate(github.rest.search.issuesAndPullRequests, {
    q: `repo:${owner}/${repo} is:issue in:body "${SCHEDULED_FAILURE_MARKER}"`,
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

async function tryEnsureTrackerLabel(
  github,
  { owner, repo, label, description, core },
) {
  try {
    await ensureTrackerLabel(github, { owner, repo, label, description });
    return true;
  } catch (error) {
    core.warning?.(
      `Could not ensure scheduled tracker label ${label}; marker-based lifecycle remains active: ${error.message}`,
    );
    return false;
  }
}

async function tryApplyTrackerLabel(
  github,
  { owner, repo, issueNumber, label, core },
) {
  try {
    await applyTrackerLabel(github, {
      owner,
      repo,
      issueNumber,
      label,
    });
    return true;
  } catch (error) {
    core.warning?.(
      `Could not apply ${label} to #${issueNumber}; marker-based lifecycle remains active: ${error.message}`,
    );
    return false;
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
  // A concurrent reconciler may already have folded these same duplicate
  // issues into its stored count. Summing would count that cohort twice.
  const occurrences = Math.max(
    states.length,
    ...states.map((state) => Math.max(1, Number(state.occurrences) || 1)),
  );

  return {
    ...fallback,
    occurrences,
    firstSeenAt: earliest.firstSeenAt,
    firstSha: earliest.firstSha,
    firstRunId: earliest.firstRunId,
    firstRunAttempt: earliest.firstRunAttempt,
    firstRunUrl: earliest.firstRunUrl,
    lastSeenAt: latest.lastSeenAt,
    lastSha: latest.lastSha,
    lastRunId: latest.lastRunId,
    lastRunAttempt: latest.lastRunAttempt,
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
  await tryApplyTrackerLabel(github, {
    owner,
    repo,
    issueNumber,
    label: 'codex:automation',
    core,
  });
  await triageCiFailureOnProject(github, {
    owner,
    repo,
    issueNumber,
    trackerName: trackerLabel,
    core,
  });
}

async function closeDuplicateTrackers(
  github,
  { owner, repo, trackers, canonicalIssueNumber },
) {
  for (const duplicate of trackers.filter(
    ({ issue }) => issue.number !== canonicalIssueNumber,
  )) {
    if (duplicate.issue.state === 'closed') {
      continue;
    }
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: duplicate.issue.number,
      state: 'closed',
      state_reason: 'not_planned',
    });
  }
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
  identitySignature,
  sha,
  runId,
  runAttempt = 1,
  runUrl,
  occurredAt = new Date().toISOString(),
  reproduction = `Dispatch ${workflowIdentity} again after applying a focused fix.`,
  core = console,
}) {
  const classification = classifyScheduledFailure(excerpt);
  const signature = identitySignature ?? classification.signature;
  const fingerprint = computeFailureFingerprint({
    workflowIdentity,
    failedJob,
    failureClass: classification.failureClass,
    signature,
  });
  const initialState = {
    fingerprint,
    workflowIdentity,
    failedJob,
    failureClass: classification.failureClass,
    signature,
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

  await tryEnsureTrackerLabel(github, {
    owner,
    repo,
    label: trackerLabel,
    description: trackerDescription,
    core,
  });

  const allIssues = await listTrackerIssues(github, {
    owner,
    repo,
  });
  let trackers = matchingTrackers(allIssues, fingerprint);
  let canonical = trackers[0];
  let state = initialState;
  let created = false;

  if (canonical) {
    const previous = mergeTrackerStates(trackers, canonical.state);
    const canonicalWasClosed = canonical.issue.state === 'closed';
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
    await tryApplyTrackerLabel(github, {
      owner,
      repo,
      issueNumber: canonical.issue.number,
      label: trackerLabel,
      core,
    });
    await closeDuplicateTrackers(github, {
      owner,
      repo,
      trackers,
      canonicalIssueNumber: canonical.issue.number,
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
          : canonicalWasClosed || previous.status === 'resolved'
            ? 'reopened'
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
  await tryApplyTrackerLabel(github, {
    owner,
    repo,
    issueNumber: createdIssue.data.number,
    label: trackerLabel,
    core,
  });

  const afterCreate = await listTrackerIssues(github, {
    owner,
    repo,
  });
  trackers = matchingTrackers(
    [
      ...afterCreate,
      ...(afterCreate.some(({ number }) => number === createdIssue.data.number)
        ? []
        : [createdIssue.data]),
    ],
    fingerprint,
  );
  canonical = trackers[0] ?? { issue: createdIssue.data, state };
  const canonicalWasClosed = canonical.issue.state === 'closed';
  state = mergeTrackerStates(trackers, state);

  await updateTracker(github, {
    owner,
    repo,
    issueNumber: canonical.issue.number,
    state,
    excerpt: classification.publicExcerpt,
    reproduction,
    issueState: classification.transient ? undefined : 'open',
  });

  await closeDuplicateTrackers(github, {
    owner,
    repo,
    trackers,
    canonicalIssueNumber: canonical.issue.number,
  });

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
        : canonicalWasClosed
          ? 'reopened'
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

import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const LINK_HEADER_ENTRY_PATTERN =
  /^<([^>]+)>;\s*rel="(next|prev|first|last)"$/u;

const SHA = /^[0-9a-f]{40}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const WORKFLOWS = new Map([
  [
    '.github/workflows/ci.yml',
    { id: 256227164, job: 'Core Validation / Validation Verdict' },
  ],
  [
    '.github/workflows/pr-heavy-ci.yml',
    {
      id: 372933762,
      job: 'Run Heavy CI / Core Validation / Validation Verdict',
    },
  ],
]);
const DELAYS = [2_000, 5_000];
const MAX_PAGES = 500;
// GitHub builds a jobs page within its 10 second gateway limit only for small
// pages: 100 jobs per page on a run with about 80 jobs returns HTTP 502 every
// time, so retrying cannot help.
const PAGE_SIZE = 20;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function expectedIdentity(env) {
  const repository = env.GITHUB_REPOSITORY;
  requireValue(REPOSITORY.test(repository ?? ''), 'Invalid repository');
  const refPrefix = `${repository}/`;
  const ref = env.EXPECTED_WORKFLOW_REF ?? '';
  requireValue(ref.startsWith(refPrefix), 'Invalid workflow reference');
  const separator = ref.indexOf('@', refPrefix.length);
  requireValue(
    separator > 0 && separator < ref.length - 1,
    'Invalid workflow reference',
  );
  const workflowPath = ref.slice(refPrefix.length, separator);
  const profile = WORKFLOWS.get(workflowPath);
  requireValue(profile, 'Unknown workflow identity');
  const runId = Number(env.GITHUB_RUN_ID);
  const attempt = Number(env.GITHUB_RUN_ATTEMPT);
  const event = env.EXPECTED_EVENT;
  requireValue(Number.isSafeInteger(runId) && runId > 0, 'Invalid run ID');
  requireValue(
    Number.isSafeInteger(attempt) && attempt > 0,
    'Invalid run attempt',
  );
  requireValue(
    ['pull_request', 'merge_group', 'push'].includes(event),
    'Invalid originating event',
  );
  requireValue(
    SHA.test(env.EXPECTED_SOURCE_SHA ?? ''),
    'Invalid tested source SHA',
  );
  const prNumber =
    event === 'pull_request' ? Number(env.EXPECTED_PR_NUMBER) : null;
  const prHead = event === 'pull_request' ? env.EXPECTED_PR_HEAD : null;
  if (event === 'pull_request') {
    requireValue(
      Number.isSafeInteger(prNumber) && prNumber > 0 && SHA.test(prHead ?? ''),
      'Invalid pull request identity',
    );
  }
  return {
    repository,
    runId,
    attempt,
    event,
    sourceSha: env.EXPECTED_SOURCE_SHA,
    prNumber,
    prHead,
    workflowPath,
    workflowId: profile.id,
    jobName: profile.job,
  };
}

function shortSha(sha) {
  return typeof sha === 'string' && SHA.test(sha)
    ? sha.slice(0, 12)
    : 'invalid';
}

function describePull(number, sha) {
  return `#${Number.isSafeInteger(number) ? number : 'invalid'}@${shortSha(sha)}`;
}

export function pullRoute(expected) {
  return `/repos/${expected.repository}/pulls/${expected.prNumber}`;
}

// GitHub drops a pull request from a run's `pull_requests` list once it merges
// or closes, so an empty list is not evidence of a foreign run. Only then is the
// pull request itself read, and only for the exact number the trusted event named.
export function needsPullEvidence(run, expected) {
  return (
    expected.event === 'pull_request' &&
    Array.isArray(run?.pull_requests) &&
    run.pull_requests.length === 0
  );
}

// Returns how membership was established: `listed` (run evidence), `open` or
// `merged` (pull request evidence). Anything else throws with the mismatched
// number and head, never with a token or a response body.
export function classifyMembership(run, expected, pull) {
  requireValue(
    Array.isArray(run.pull_requests),
    'Pull request membership or head does not match: run lists no membership evidence',
  );
  const wanted = describePull(expected.prNumber, expected.prHead);
  if (run.pull_requests.length > 0) {
    const matching = run.pull_requests.filter(
      (pr) =>
        pr?.number === expected.prNumber &&
        pr.head?.sha === expected.prHead &&
        pr.base?.repo?.url ===
          `https://api.github.com/repos/${expected.repository}`,
    );
    requireValue(
      matching.length === 1,
      `Pull request membership or head does not match: expected ${wanted}, run lists ${run.pull_requests
        .map((pr) => describePull(pr?.number, pr?.head?.sha))
        .join(', ')}`,
    );
    return 'listed';
  }
  requireValue(
    pull && typeof pull === 'object',
    `Pull request membership or head does not match: run lists no pull request and ${wanted} was not read`,
  );
  requireValue(
    pull.number === expected.prNumber &&
      pull.base?.repo?.full_name === expected.repository &&
      pull.head?.sha === expected.prHead,
    `Pull request membership or head does not match: expected ${wanted}, pull request reports ${describePull(pull.number, pull.head?.sha)}`,
  );
  if (pull.state === 'closed' && pull.merged === true) return 'merged';
  requireValue(
    pull.state === 'open' && pull.merged !== true,
    `Pull request ${wanted} was closed without merging`,
  );
  return 'open';
}

export function validateRun(run, expected, pull) {
  requireValue(
    run?.id === expected.runId &&
      run.run_attempt === expected.attempt &&
      run.event === expected.event &&
      run.path === expected.workflowPath &&
      run.workflow_id === expected.workflowId &&
      run.repository?.full_name === expected.repository &&
      SHA.test(run.head_sha ?? ''),
    'Run identity does not match trusted context',
  );
  if (expected.event === 'pull_request') {
    requireValue(
      run.head_sha === expected.prHead || run.head_sha === expected.sourceSha,
      `Pull request membership or head does not match: run head ${shortSha(run.head_sha)}, expected PR head ${shortSha(expected.prHead)}`,
    );
    classifyMembership(run, expected, pull);
  } else {
    requireValue(
      run.head_sha === expected.sourceSha,
      'Run source does not match',
    );
  }
  const helperPrefix = `${expected.repository}/.github/workflows/_ci-validation.yml@`;
  const references = run.referenced_workflows;
  requireValue(
    Array.isArray(references),
    'Missing referenced workflow evidence',
  );
  const helpers = references.filter(
    (item) =>
      typeof item?.path === 'string' && item.path.startsWith(helperPrefix),
  );
  requireValue(
    helpers.length === 1 &&
      helpers[0].path.length > helperPrefix.length &&
      helpers[0].sha === expected.sourceSha,
    'Referenced validation source does not match',
  );
  return run;
}

class PropagationError extends Error {}
class TransientError extends Error {}

export function validateVerdict(run, jobs, expected, pull) {
  validateRun(run, expected, pull);
  requireValue(Array.isArray(jobs), 'Invalid jobs');
  const ids = new Set();
  for (const job of jobs) {
    requireValue(
      Number.isSafeInteger(job?.id) && job.id > 0 && !ids.has(job.id),
      'Invalid or duplicate job ID',
    );
    ids.add(job.id);
    requireValue(
      job.run_id === expected.runId &&
        job.run_attempt === expected.attempt &&
        job.head_sha === run.head_sha,
      'Job belongs to another run, attempt or head',
    );
  }
  const matching = jobs.filter((job) => job.name === expected.jobName);
  if (matching.length === 0)
    throw new PropagationError('Actual validation verdict has not propagated');
  requireValue(matching.length === 1, 'Duplicate actual validation verdicts');
  if (
    ['queued', 'in_progress'].includes(matching[0].status) &&
    matching[0].conclusion === null
  )
    throw new PropagationError('Actual validation verdict is not completed');
  requireValue(
    matching[0].status === 'completed' && matching[0].conclusion === 'success',
    'Actual validation verdict is not completed success',
  );
  return matching[0];
}

function nextLink(headers) {
  const link = headers?.get?.('link') ?? '';
  if (link === '') return null;
  const parts = link
    .split(',')
    .map((part) => part.trim().match(LINK_HEADER_ENTRY_PATTERN));
  requireValue(parts.every(Boolean), 'Invalid pagination link shape');
  const next = parts.filter((part) => part[2] === 'next');
  requireValue(next.length <= 1, 'Invalid pagination next link');
  return next[0]?.[1] ?? null;
}

// GitHub writes pagination links with either the owner/name path or the
// numeric repository id, so accept both forms of the same jobs route.
function isExpectedNextJobsLink(link, { attempt, nextPage, prefix, runId }) {
  let url;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  const jobsPath = '/attempts/' + attempt + '/jobs';
  const isRepositoryPath =
    url.pathname === prefix + jobsPath ||
    new RegExp(
      '^/repositories/\\d+/actions/runs/' + runId + jobsPath + '$',
      'u',
    ).test(url.pathname);
  return (
    url.origin === 'https://api.github.com' &&
    isRepositoryPath &&
    url.hash === '' &&
    url.search === '?per_page=' + PAGE_SIZE + '&page=' + nextPage
  );
}

export async function qualifyVerdict(
  expected,
  {
    get,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => performance.now(),
    deadline = now() + 240_000,
  } = {},
) {
  requireValue(
    typeof get === 'function',
    'A read-only metadata reader is required',
  );
  const prefix = `/repos/${expected.repository}/actions/runs/${expected.runId}`;
  const checkTime = () =>
    requireValue(now() < deadline, 'Verdict deadline exceeded');
  const read = async (route) => {
    checkTime();
    const response = await get(route, Math.min(10_000, deadline - now()));
    checkTime();
    const status = response.status;
    if ([404, 408, 429].includes(status) || (status >= 500 && status <= 599)) {
      throw new TransientError(`Transient metadata response ${status}`);
    }
    requireValue(status === 200, `Permanent metadata response ${status}`);
    requireValue(
      response.body && typeof response.body === 'object',
      'Invalid metadata response',
    );
    return response;
  };
  const readRun = async () => {
    const body = (await read(prefix)).body;
    const pull = needsPullEvidence(body, expected)
      ? (await read(pullRoute(expected))).body
      : undefined;
    return { run: validateRun(body, expected, pull), pull };
  };
  for (let snapshot = 0; snapshot < 3; snapshot++) {
    try {
      const { run, pull } = await readRun();
      const jobs = [];
      let total;
      let pages = 1;
      for (let page = 1; page <= pages; page++) {
        const route =
          prefix +
          '/attempts/' +
          expected.attempt +
          '/jobs?per_page=' +
          PAGE_SIZE +
          '&page=' +
          page;
        const response = await read(route);
        const body = response.body;
        requireValue(
          Number.isSafeInteger(body.total_count) &&
            body.total_count >= 0 &&
            body.total_count <= PAGE_SIZE * MAX_PAGES &&
            Array.isArray(body.jobs),
          'Invalid jobs pagination',
        );
        if (page === 1) {
          total = body.total_count;
          pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        }
        requireValue(body.total_count === total, 'Inconsistent total_count');
        requireValue(
          body.jobs.length ===
            Math.min(PAGE_SIZE, total - (page - 1) * PAGE_SIZE),
          'Incomplete jobs page',
        );
        const next = nextLink(response.headers);
        if (next !== null) {
          requireValue(
            page < pages &&
              isExpectedNextJobsLink(next, {
                attempt: expected.attempt,
                nextPage: page + 1,
                prefix,
                runId: expected.runId,
              }),
            'Unexpected next-page route',
          );
        }
        jobs.push(...body.jobs);
      }
      requireValue(jobs.length === total, 'Incomplete job count');
      const verdict = validateVerdict(run, jobs, expected, pull);
      const { run: latest } = await readRun();
      requireValue(
        latest.head_sha === run.head_sha,
        'Run head changed during qualification',
      );
      return verdict;
    } catch (error) {
      if (
        !(
          error instanceof TransientError || error instanceof PropagationError
        ) ||
        snapshot === 2
      )
        throw error;
      checkTime();
      requireValue(
        now() + DELAYS[snapshot] < deadline,
        'Verdict deadline exceeded',
      );
      await sleep(DELAYS[snapshot]);
    }
  }
  throw new Error('Verdict unavailable');
}

export async function main(env = process.env) {
  const expected = expectedIdentity(env);
  requireValue(
    typeof env.GH_TOKEN === 'string' && env.GH_TOKEN.length > 0,
    'Missing Actions read token',
  );
  const deadline = performance.now() + 240_000;
  const get = async (route, timeout) => {
    // Only these locally constructed GET routes reach the token: the current run
    // and, for a pull request event, that one pull request.
    requireValue(
      route.startsWith(
        `/repos/${expected.repository}/actions/runs/${expected.runId}`,
      ) ||
        (expected.event === 'pull_request' && route === pullRoute(expected)),
      'Invalid metadata route',
    );
    let response;
    try {
      response = await fetch(`https://api.github.com${route}`, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${env.GH_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(Math.max(1, Math.ceil(timeout))),
      });
    } catch {
      // Transport failures are not authority and never become an inferred success.
      throw new Error('Metadata transport failed');
    }
    const body = response.status === 200 ? await response.json() : {};
    return { status: response.status, body, headers: response.headers };
  };
  const verdict = await qualifyVerdict(expected, { get, deadline });
  process.stdout.write(
    `Qualified actual current-attempt validation job ${verdict.id}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(`::error::${error.message}\n`);
    process.exitCode = 1;
  });
}

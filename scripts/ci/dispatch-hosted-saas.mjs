import { pathToFileURL } from 'node:url';

/**
 * Public → private hosted-SaaS release handoff.
 *
 * The Release workflow must fail in preflight when CONSOLE_DEPLOY_TOKEN cannot
 * dispatch `deploy-hosted-saas.yml`, with a capability diagnosis that never
 * prints token material. Correlation id and expected title stay SHA-bound.
 */

export const CONSOLE_REPOSITORY = 'genfeedai/console.genfeed.ai';
export const CONSOLE_WORKFLOW = 'deploy-hosted-saas.yml';
export const MARKETPLACE_REPOSITORY = 'genfeedai/marketplace.genfeed.ai';
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function buildCorrelationId({ runId, runAttempt, releaseSha }) {
  return `release-${runId}-${runAttempt}-${releaseSha}`;
}

export function buildExpectedTitle({ releaseSha, correlationId }) {
  return `Deploy hosted SaaS | ${releaseSha} | ${correlationId}`;
}

function stripSecretLike(value) {
  return String(value ?? '').replace(
    /\b(?:github_pat|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+|\bBearer\s+\S+/gi,
    '[REDACTED_SECRET]',
  );
}

export function mapDispatchCapabilityError({ status, reason, message = '' }) {
  const sanitized = stripSecretLike(message);
  const isLifetimePolicy = /lifetime is greater than 366/i.test(sanitized);

  if (reason === 'missing-token' || status === 0) {
    return 'CONSOLE_DEPLOY_TOKEN is not configured. See RELEASING.md.';
  }

  if (status === 401) {
    return [
      'CONSOLE_DEPLOY_TOKEN was rejected (expired or revoked).',
      'Rotate the public repository secret with a dedicated fine-grained token',
      'limited to genfeedai/console.genfeed.ai, Actions: read and write,',
      'expiration at most 366 days. See RELEASING.md. Do not print the token.',
    ].join(' ');
  }

  if (status === 403 && isLifetimePolicy) {
    return [
      'CONSOLE_DEPLOY_TOKEN cannot dispatch because the genfeedai org forbids',
      'fine-grained PATs whose lifetime is greater than 366 days.',
      'Recreate the token with expiration ≤ 366 days, repository access limited',
      'to genfeedai/console.genfeed.ai, and Actions: read and write.',
      'See RELEASING.md. Do not print the token.',
    ].join(' ');
  }

  if (status === 403) {
    return [
      'CONSOLE_DEPLOY_TOKEN is missing the capability to dispatch the private',
      'hosted-SaaS workflow. Grant Actions: read and write on',
      'genfeedai/console.genfeed.ai only (no contents/secrets/admin).',
      'Authorize org SSO on the token if prompted. See RELEASING.md.',
    ].join(' ');
  }

  if (status === 404) {
    return [
      'Private hosted-SaaS workflow deploy-hosted-saas.yml was not visible on',
      'genfeedai/console.genfeed.ai. Confirm the workflow exists on private',
      'master and that CONSOLE_DEPLOY_TOKEN can read Actions on that repository.',
      'See RELEASING.md.',
    ].join(' ');
  }

  return [
    `Private hosted-SaaS dispatch preflight failed with HTTP ${status || 'unknown'}.`,
    'CONSOLE_DEPLOY_TOKEN must be able to dispatch deploy-hosted-saas.yml.',
    'See RELEASING.md. Do not print the token.',
  ].join(' ');
}

function assertExactSha(label, sha) {
  if (!SHA_PATTERN.test(sha ?? '')) {
    throw new Error(
      `${label} SHA is not an exact lowercase 40-character commit: ${sha}`,
    );
  }
}

export async function assertMarketplaceSourceReachable({
  ghApi,
  marketplaceRepository = MARKETPLACE_REPOSITORY,
  marketplaceSourceSha,
}) {
  assertExactSha('marketplace source', marketplaceSourceSha);

  const compare = await ghApi(
    'GET',
    `repos/${marketplaceRepository}/compare/${marketplaceSourceSha}...master`,
  );
  if (compare.status < 200 || compare.status >= 300) {
    throw new Error(
      `Could not verify ${marketplaceRepository} source ${marketplaceSourceSha} against master (HTTP ${compare.status || 'unknown'}).`,
    );
  }

  const status = compare.json?.status ?? '';
  if (status !== 'identical' && status !== 'ahead') {
    throw new Error(
      `marketplace_source_sha ${marketplaceSourceSha} is not reachable from ${marketplaceRepository} master (compare status: ${status || 'unknown'}).`,
    );
  }

  return marketplaceSourceSha;
}

function requireOk({ status, json }) {
  if (status >= 200 && status < 300) {
    return json;
  }
  throw new Error(
    mapDispatchCapabilityError({
      status,
      message: json?.message ?? '',
    }),
  );
}

export async function preflightAndDispatch({
  ghApi,
  consoleRepository = CONSOLE_REPOSITORY,
  consoleWorkflow = CONSOLE_WORKFLOW,
  marketplaceRepository = MARKETPLACE_REPOSITORY,
  marketplaceSourceSha,
  releaseSha,
  runId,
  runAttempt,
  token,
}) {
  if (!token) {
    throw new Error(
      mapDispatchCapabilityError({ status: 0, reason: 'missing-token' }),
    );
  }

  assertExactSha('Release', releaseSha);

  const correlationId = buildCorrelationId({ runId, runAttempt, releaseSha });
  const expectedTitle = buildExpectedTitle({ releaseSha, correlationId });

  const repo = await ghApi('GET', `repos/${consoleRepository}`);
  requireOk(repo);

  const workflow = await ghApi(
    'GET',
    `repos/${consoleRepository}/actions/workflows/${consoleWorkflow}`,
  );
  requireOk(workflow);

  let resolvedMarketplaceSourceSha = marketplaceSourceSha ?? '';
  if (!resolvedMarketplaceSourceSha) {
    const marketplaceCommit = await ghApi(
      'GET',
      `repos/${marketplaceRepository}/commits/master`,
    );
    if (marketplaceCommit.status < 200 || marketplaceCommit.status >= 300) {
      throw new Error(
        `Could not resolve ${marketplaceRepository} master for the hosted-SaaS handoff (HTTP ${marketplaceCommit.status || 'unknown'}).`,
      );
    }
    resolvedMarketplaceSourceSha = marketplaceCommit.json?.sha ?? '';
  }
  await assertMarketplaceSourceReachable({
    ghApi,
    marketplaceRepository,
    marketplaceSourceSha: resolvedMarketplaceSourceSha,
  });

  const dispatch = await ghApi(
    'POST',
    `repos/${consoleRepository}/actions/workflows/${consoleWorkflow}/dispatches`,
    {
      ref: 'master',
      inputs: {
        release_sha: releaseSha,
        source_sha: releaseSha,
        marketplace_source_sha: resolvedMarketplaceSourceSha,
        correlation_id: correlationId,
      },
    },
  );
  requireOk(dispatch);

  return {
    correlationId,
    expectedTitle,
    marketplaceSourceSha: resolvedMarketplaceSourceSha,
  };
}

function githubApiErrorMessage(stderr, stdout) {
  const stdoutText = String(stdout ?? '').trim();
  if (stdoutText) {
    try {
      const json = JSON.parse(stdoutText);
      if (typeof json.message === 'string' && json.message.length > 0) {
        return json.message;
      }
    } catch {
      // Body is not JSON; fall through to combined text.
    }
  }
  return `${stdoutText}\n${String(stderr ?? '')}`.trim();
}

export function ghCliApi(method, path, body, { spawnSync, token }) {
  const args = ['api', '--method', method, path];
  if (body) {
    args.push('--input', '-');
  }

  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    input: body ? JSON.stringify(body) : undefined,
    env: { ...process.env, GH_TOKEN: token },
  });

  let json = {};
  if (result.stdout?.trim()) {
    try {
      json = JSON.parse(result.stdout);
    } catch {
      json = {};
    }
  }

  if (result.status !== 0) {
    const httpMatch = /HTTP\s+(\d{3})/i.exec(
      `${result.stderr}\n${result.stdout}`,
    );
    return {
      status: httpMatch ? Number(httpMatch[1]) : 400,
      json: {
        message: githubApiErrorMessage(result.stderr, result.stdout),
      },
    };
  }

  return { status: method === 'POST' ? 204 : 200, json };
}

export async function runCli({
  env = process.env,
  spawnSync,
  appendFileSync,
  error = console.error,
} = {}) {
  const token = env.GH_TOKEN ?? env.CONSOLE_DEPLOY_TOKEN ?? '';
  const ghApi = (method, path, body) =>
    ghCliApi(method, path, body, { spawnSync, token });

  try {
    const result = await preflightAndDispatch({
      ghApi,
      consoleRepository: env.CONSOLE_REPOSITORY ?? CONSOLE_REPOSITORY,
      consoleWorkflow: env.CONSOLE_WORKFLOW ?? CONSOLE_WORKFLOW,
      marketplaceRepository:
        env.MARKETPLACE_REPOSITORY ?? MARKETPLACE_REPOSITORY,
      marketplaceSourceSha: env.MARKETPLACE_SOURCE_SHA ?? '',
      releaseSha: env.RELEASE_SHA ?? '',
      runId: env.GITHUB_RUN_ID ?? '0',
      runAttempt: env.GITHUB_RUN_ATTEMPT ?? '1',
      token,
    });

    if (env.GITHUB_OUTPUT) {
      appendFileSync(
        env.GITHUB_OUTPUT,
        `correlation_id=${result.correlationId}\nexpected_title=${result.expectedTitle}\nmarketplace_source_sha=${result.marketplaceSourceSha}\n`,
      );
    }
    return result;
  } catch (caught) {
    const message = stripSecretLike(
      caught instanceof Error ? caught.message : String(caught),
    );
    error(`::error::${message}`);
    process.exitCode = 1;
    return null;
  }
}

async function main() {
  const { spawnSync } = await import('node:child_process');
  const { appendFileSync } = await import('node:fs');
  await runCli({ spawnSync, appendFileSync });
  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

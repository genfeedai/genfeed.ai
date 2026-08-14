import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCorrelationId,
  buildExpectedTitle,
  mapDispatchCapabilityError,
  preflightAndDispatch,
} from './dispatch-hosted-saas.mjs';

const RELEASE_SHA = 'd4a8d36e8eaf35747a0957a500e50daf737a85db';

test('builds a unique correlation id and expected title from the pinned SHA', () => {
  const correlationId = buildCorrelationId({
    runId: '31678573754',
    runAttempt: '1',
    releaseSha: RELEASE_SHA,
  });

  assert.equal(correlationId, `release-31678573754-1-${RELEASE_SHA}`);
  assert.equal(
    buildExpectedTitle({ releaseSha: RELEASE_SHA, correlationId }),
    `Deploy hosted SaaS | ${RELEASE_SHA} | ${correlationId}`,
  );
});

test('maps missing token without echoing secret material', () => {
  const error = mapDispatchCapabilityError({
    status: 0,
    reason: 'missing-token',
  });

  assert.match(error, /CONSOLE_DEPLOY_TOKEN is not configured/);
  assert.match(error, /RELEASING\.md/);
  assert.doesNotMatch(error, /github_pat_|ghp_|ghs_|token=|Bearer /i);
});

test('maps 401 to a rotation instruction without leaking the token', () => {
  const error = mapDispatchCapabilityError({
    status: 401,
    message: 'Bad credentials',
  });

  assert.match(error, /rejected|expired|revoked/i);
  assert.match(error, /CONSOLE_DEPLOY_TOKEN/);
  assert.doesNotMatch(error, /Bad credentials/);
  assert.doesNotMatch(error, /github_pat_|ghp_|ghs_/i);
});

test('maps org PAT-lifetime 403 to a 366-day recreation instruction', () => {
  const error = mapDispatchCapabilityError({
    status: 403,
    message:
      "The 'genfeedai' organization forbids access via a fine-grained personal access tokens if the token's lifetime is greater than 366 days.",
  });

  assert.match(error, /366/);
  assert.match(error, /fine-grained/);
  assert.match(error, /Actions: read and write/);
  assert.doesNotMatch(error, /github_pat_|ghp_|ghs_/i);
});

test('maps generic 403 to missing Actions permission on the private repo', () => {
  const error = mapDispatchCapabilityError({
    status: 403,
    message: 'Resource not accessible by personal access token',
  });

  assert.match(error, /Actions: read and write/);
  assert.match(error, /genfeedai\/console\.genfeed\.ai/);
  assert.doesNotMatch(error, /Resource not accessible/);
});

test('maps 404 to a private workflow or visibility failure', () => {
  const error = mapDispatchCapabilityError({
    status: 404,
    message: 'Not Found',
  });

  assert.match(error, /deploy-hosted-saas\.yml/);
  assert.match(error, /console\.genfeed\.ai/);
});

test('preflights capability before dispatching and preserves the SHA contract', async () => {
  const calls = [];
  const ghApi = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'GET' && path.endsWith('/console.genfeed.ai')) {
      return {
        status: 200,
        json: { full_name: 'genfeedai/console.genfeed.ai' },
      };
    }
    if (method === 'GET' && path.includes('/actions/workflows/')) {
      return {
        status: 200,
        json: { state: 'active', name: 'deploy-hosted-saas.yml' },
      };
    }
    if (method === 'POST' && path.endsWith('/dispatches')) {
      return { status: 204, json: {} };
    }
    throw new Error(`unexpected ${method} ${path}`);
  };

  const result = await preflightAndDispatch({
    ghApi,
    consoleRepository: 'genfeedai/console.genfeed.ai',
    consoleWorkflow: 'deploy-hosted-saas.yml',
    releaseSha: RELEASE_SHA,
    runId: '31678573754',
    runAttempt: '1',
    token: 'present-but-must-not-be-logged',
  });

  assert.equal(calls[0]?.method, 'GET');
  assert.equal(calls[1]?.method, 'GET');
  assert.equal(calls[2]?.method, 'POST');
  assert.equal(calls[2]?.body.ref, 'master');
  assert.equal(calls[2]?.body.inputs.release_sha, RELEASE_SHA);
  assert.equal(calls[2]?.body.inputs.source_sha, RELEASE_SHA);
  assert.equal(result.correlationId, `release-31678573754-1-${RELEASE_SHA}`);
  assert.equal(
    result.expectedTitle,
    `Deploy hosted SaaS | ${RELEASE_SHA} | ${result.correlationId}`,
  );
});

test('fails closed in preflight on 403 and never POSTs the dispatch', async () => {
  const calls = [];
  const ghApi = async (method, path) => {
    calls.push({ method, path });
    return {
      status: 403,
      json: {
        message:
          "The 'genfeedai' organization forbids access via a fine-grained personal access tokens if the token's lifetime is greater than 366 days.",
      },
    };
  };

  await assert.rejects(
    () =>
      preflightAndDispatch({
        ghApi,
        consoleRepository: 'genfeedai/console.genfeed.ai',
        consoleWorkflow: 'deploy-hosted-saas.yml',
        releaseSha: RELEASE_SHA,
        runId: '1',
        runAttempt: '1',
        token: 'present',
      }),
    (error) => {
      assert.match(String(error.message), /366/);
      assert.doesNotMatch(String(error.message), /present/);
      return true;
    },
  );

  assert.equal(
    calls.some((call) => call.method === 'POST'),
    false,
  );
});

test('rejects a non-sha release pin before any GitHub call', async () => {
  const calls = [];
  await assert.rejects(
    () =>
      preflightAndDispatch({
        ghApi: async (method, path) => {
          calls.push({ method, path });
          return { status: 200, json: {} };
        },
        consoleRepository: 'genfeedai/console.genfeed.ai',
        consoleWorkflow: 'deploy-hosted-saas.yml',
        releaseSha: 'HEAD',
        runId: '1',
        runAttempt: '1',
        token: 'present',
      }),
    /40-character commit/,
  );
  assert.equal(calls.length, 0);
});

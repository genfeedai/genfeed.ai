#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONVERSATION_SHELL_DEPLOYMENT_ORDER,
  type ConversationShellClientSurface,
  type ConversationShellDeployment,
  type ConversationShellDeploymentMode,
  evaluateConversationShellRollout,
  parseConversationShellRolloutConfig,
} from '../../packages/config/src/conversation-shell-rollout';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function attributesForMode(mode: ConversationShellDeploymentMode): {
  client: ConversationShellClientSurface;
  deployment: ConversationShellDeployment;
} {
  switch (mode) {
    case 'community':
      return { client: 'web', deployment: 'self-hosted' };
    case 'desktop_self_hosted':
      return { client: 'desktop', deployment: 'self-hosted' };
    case 'desktop_cloud':
      return { client: 'desktop', deployment: 'cloud' };
    case 'saas':
      return { client: 'web', deployment: 'cloud' };
  }
}

const configPath = process.argv[2];
if (!configPath) {
  fail(
    'Usage: bun run conversation-shell:rehearse-rollback -- <feature-flag-defaults.json>',
  );
}

let document: unknown;
try {
  document = JSON.parse(readFileSync(resolve(configPath), 'utf8'));
} catch (error: unknown) {
  fail(
    `Unable to read rollout config: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
}

const rawConfig =
  document && typeof document === 'object' && 'conversation_shell' in document
    ? (document as { conversation_shell: unknown }).conversation_shell
    : document;
const parsed = parseConversationShellRolloutConfig(rawConfig);
if (!parsed.config) {
  fail(`Rollout config is ${parsed.error.replaceAll('_', ' ')}.`);
}
const config = parsed.config;
if (!config.isEnabled) {
  fail('Rollback rehearsal requires a currently enabled rollout config.');
}

const activeOrganizations = config.enabledCohorts.flatMap(
  (cohort) => config.organizations[cohort],
);
if (
  activeOrganizations.length === 0 ||
  config.enabledDeploymentModes.length === 0
) {
  fail('Rollback rehearsal requires at least one actively exposed target.');
}

const rollbackConfig = {
  ...config,
  isEnabled: false,
  rollbackRevision: config.rollbackRevision + 1,
};
const rollbackParsed = parseConversationShellRolloutConfig(rollbackConfig);
if (!rollbackParsed.config) {
  fail('Generated rollback config did not satisfy the rollout schema.');
}

const organizations = Object.values(config.organizations).flat();
const evaluations = CONVERSATION_SHELL_DEPLOYMENT_ORDER.flatMap((mode) =>
  organizations.map((organizationId) =>
    evaluateConversationShellRollout(rollbackParsed, {
      ...attributesForMode(mode),
      organizationId,
    }),
  ),
);
const passed = evaluations.every(
  (evaluation) => !evaluation.isEnabled && evaluation.reason === 'disabled',
);

console.log(
  JSON.stringify(
    {
      configVersion: config.configVersion,
      evaluatedOrganizations: organizations.length,
      evaluatedDeploymentModes: CONVERSATION_SHELL_DEPLOYMENT_ORDER,
      fromRollbackRevision: config.rollbackRevision,
      passed,
      schemaReversalRequired: false,
      toRollbackRevision: rollbackConfig.rollbackRevision,
    },
    null,
    2,
  ),
);

if (!passed) {
  process.exit(1);
}

import type { ScheduledReleaseControlAction } from '@mcp/services/client/scheduler.client';
import type { ClientService } from '@mcp/services/client.service';

export const SCHEDULER_TOOL_NAMES = new Set([
  'control_scheduled_release',
  'create_scheduled_release',
  'get_scheduled_release',
  'update_scheduled_release',
]);

const RELEASE_UPDATE_FIELDS = new Set([
  'attachments',
  'baseContent',
  'media',
  'recurrence',
  'scheduledDate',
  'timezone',
  'title',
]);

const TARGET_UPDATE_FIELDS = new Set([
  'order',
  'scheduledDate',
  'settings',
  'timezone',
]);

/**
 * Scheduler MCP handlers. These only validate the routing boundary and proxy
 * canonical request bodies to `/post-groups`; the API owns all scheduler
 * domain validation and state transitions.
 */
export function handleSchedulerTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  const handlers: Record<
    string,
    (
      args: Record<string, unknown>,
    ) => Promise<{ content: Array<{ text: string; type: 'text' }> }>
  > = {
    control_scheduled_release: async (a) => {
      const result = await client.controlScheduledRelease(
        requiredString(a, 'releaseId'),
        controlAction(a),
      );
      return textJsonResult('Scheduled release updated', result);
    },
    create_scheduled_release: async (a) => {
      const release = createReleasePayload(a);
      const result = await client.createScheduledRelease(
        release,
        optionalString(a, 'idempotencyKey'),
      );
      return textJsonResult('Scheduled release created', result);
    },
    get_scheduled_release: async (a) => {
      const result = await client.getScheduledRelease(
        requiredString(a, 'releaseId'),
      );
      return textJsonResult('Scheduled release', result);
    },
    update_scheduled_release: async (a) => {
      const scope = updateScope(a);
      const targetId = optionalString(a, 'targetId');
      if (scope === 'target' && !targetId) {
        throw new Error('targetId is required when scope is "target"');
      }
      if (scope === 'release' && targetId) {
        throw new Error('targetId is only allowed when scope is "target"');
      }

      const result = await client.updateScheduledRelease(
        requiredString(a, 'releaseId'),
        updateChanges(a, scope),
        targetId,
      );
      return textJsonResult('Scheduled release updated', result);
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown scheduler tool: ${name}`);
  return handler(args);
}

function createReleasePayload(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const release = requiredNonEmptyRecord(args, 'release');
  requiredString(release, 'title');
  requiredString(release, 'baseContent');
  requiredString(release, 'timezone');

  const targets = release.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('release.targets must be a non-empty array');
  }
  targets.forEach((target, index) => {
    if (!isRecord(target)) {
      throw new Error(`release.targets[${index}] must be an object`);
    }
    requiredString(target, 'credentialId');
    requiredString(target, 'platform');
  });

  return release;
}

function controlAction(
  args: Record<string, unknown>,
): ScheduledReleaseControlAction {
  const action = args.action;
  if (
    action !== 'cancel' &&
    action !== 'pause' &&
    action !== 'resume' &&
    action !== 'publish-now'
  ) {
    throw new Error(
      'action must be "cancel", "pause", "resume", or "publish-now"',
    );
  }
  return action;
}

function updateScope(args: Record<string, unknown>): 'release' | 'target' {
  const scope = args.scope;
  if (scope !== 'release' && scope !== 'target') {
    throw new Error('scope must be "release" or "target"');
  }
  return scope;
}

function updateChanges(
  args: Record<string, unknown>,
  scope: 'release' | 'target',
): Record<string, unknown> {
  const changes = requiredNonEmptyRecord(args, 'changes');
  const allowedFields =
    scope === 'release' ? RELEASE_UPDATE_FIELDS : TARGET_UPDATE_FIELDS;
  const unsupportedFields = Object.keys(changes).filter(
    (field) => !allowedFields.has(field),
  );

  if (unsupportedFields.length > 0) {
    throw new Error(
      `changes contains fields that are not editable for ${scope} scope: ${unsupportedFields.join(', ')}`,
    );
  }

  return changes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredNonEmptyRecord(
  args: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = args[key];
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new Error(`${key} must be a non-empty object`);
  }
  return value;
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function textJsonResult(label: string, data: unknown) {
  return {
    content: [
      {
        text: `${label}:\n\n${JSON.stringify(data, null, 2)}`,
        type: 'text' as const,
      },
    ],
  };
}

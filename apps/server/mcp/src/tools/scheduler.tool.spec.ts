import type { ClientService } from '@mcp/services/client.service';
import {
  handleSchedulerTool,
  SCHEDULER_TOOL_NAMES,
} from '@mcp/tools/scheduler.tool';

function buildClient() {
  return {
    controlScheduledRelease: vi
      .fn()
      .mockResolvedValue({ id: 'release-1', status: 'paused' }),
    createScheduledRelease: vi
      .fn()
      .mockResolvedValue({ id: 'release-1', status: 'scheduled' }),
    getScheduledRelease: vi
      .fn()
      .mockResolvedValue({ id: 'release-1', targets: [] }),
    updateScheduledRelease: vi
      .fn()
      .mockResolvedValue({ id: 'release-1', title: 'Updated' }),
  };
}

function call(
  client: ReturnType<typeof buildClient>,
  name: string,
  args: Record<string, unknown>,
) {
  return handleSchedulerTool(client as unknown as ClientService, name, args);
}

describe('SCHEDULER_TOOL_NAMES', () => {
  it('lists exactly the scheduler release tools', () => {
    expect([...SCHEDULER_TOOL_NAMES].sort()).toEqual([
      'control_scheduled_release',
      'create_scheduled_release',
      'get_scheduled_release',
      'update_scheduled_release',
    ]);
  });
});

describe('handleSchedulerTool', () => {
  it('creates a release and forwards the idempotency key separately', async () => {
    const client = buildClient();
    const release = {
      baseContent: 'Hello',
      targets: [{ credentialId: 'credential-1', platform: 'linkedin' }],
      timezone: 'Europe/Malta',
      title: 'Launch',
    };

    const result = await call(client, 'create_scheduled_release', {
      idempotencyKey: 'release-request-1',
      release,
    });

    expect(client.createScheduledRelease).toHaveBeenCalledWith(
      release,
      'release-request-1',
    );
    expect(result.content[0].text).toContain('release-1');
  });

  it('rejects a create payload without targets', async () => {
    const client = buildClient();

    await expect(
      call(client, 'create_scheduled_release', {
        release: {
          baseContent: 'Hello',
          timezone: 'Europe/Malta',
          title: 'Launch',
        },
      }),
    ).rejects.toThrow(/release.targets must be a non-empty array/);
    expect(client.createScheduledRelease).not.toHaveBeenCalled();
  });

  it('gets a release by ID', async () => {
    const client = buildClient();

    await call(client, 'get_scheduled_release', { releaseId: 'release-1' });

    expect(client.getScheduledRelease).toHaveBeenCalledWith('release-1');
  });

  it('updates release fields without a target ID', async () => {
    const client = buildClient();

    await call(client, 'update_scheduled_release', {
      changes: { title: 'Updated' },
      releaseId: 'release-1',
      scope: 'release',
    });

    expect(client.updateScheduledRelease).toHaveBeenCalledWith(
      'release-1',
      { title: 'Updated' },
      undefined,
    );
  });

  it('updates a target only when targetId is provided', async () => {
    const client = buildClient();

    await call(client, 'update_scheduled_release', {
      changes: { scheduledDate: '2026-07-20T10:00:00+02:00' },
      releaseId: 'release-1',
      scope: 'target',
      targetId: 'target-1',
    });

    expect(client.updateScheduledRelease).toHaveBeenCalledWith(
      'release-1',
      { scheduledDate: '2026-07-20T10:00:00+02:00' },
      'target-1',
    );
  });

  it('rejects ambiguous update scope arguments', async () => {
    const client = buildClient();

    await expect(
      call(client, 'update_scheduled_release', {
        changes: { title: 'Updated' },
        releaseId: 'release-1',
        scope: 'target',
      }),
    ).rejects.toThrow(/targetId is required/);
    expect(client.updateScheduledRelease).not.toHaveBeenCalled();
  });

  it('rejects lifecycle fields from release updates', async () => {
    const client = buildClient();

    await expect(
      call(client, 'update_scheduled_release', {
        changes: { status: 'published' },
        releaseId: 'release-1',
        scope: 'release',
      }),
    ).rejects.toThrow(/not editable for release scope: status/);
    expect(client.updateScheduledRelease).not.toHaveBeenCalled();
  });

  it('rejects ownership fields from release updates', async () => {
    const client = buildClient();

    await expect(
      call(client, 'update_scheduled_release', {
        changes: { brandId: 'other-brand' },
        releaseId: 'release-1',
        scope: 'release',
      }),
    ).rejects.toThrow(/not editable for release scope: brandId/);
    expect(client.updateScheduledRelease).not.toHaveBeenCalled();
  });

  it('rejects release fields from target updates', async () => {
    const client = buildClient();

    await expect(
      call(client, 'update_scheduled_release', {
        changes: { title: 'Wrong scope' },
        releaseId: 'release-1',
        scope: 'target',
        targetId: 'target-1',
      }),
    ).rejects.toThrow(/not editable for target scope: title/);
    expect(client.updateScheduledRelease).not.toHaveBeenCalled();
  });

  it('maps lifecycle controls to the canonical action', async () => {
    const client = buildClient();

    await call(client, 'control_scheduled_release', {
      action: 'publish-now',
      releaseId: 'release-1',
    });

    expect(client.controlScheduledRelease).toHaveBeenCalledWith(
      'release-1',
      'publish-now',
    );
  });

  it('rejects an unknown tool name', () => {
    const client = buildClient();
    expect(() => call(client, 'not_a_scheduler_tool', {})).toThrow(
      /Unknown scheduler tool/,
    );
  });
});

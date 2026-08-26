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
    getSchedulerCapability: vi.fn().mockResolvedValue({
      label: 'YouTube',
      platform: 'youtube',
      status: 'supported',
    }),
    listBrandPublishingReadiness: vi.fn().mockResolvedValue([
      {
        canSchedule: true,
        credentialId: 'credential-1',
        diagnostics: [],
        providerKey: 'youtube',
        state: 'publish_capable',
      },
    ]),
    listSchedulerCapabilities: vi.fn().mockResolvedValue([
      { label: 'YouTube', platform: 'youtube', status: 'supported' },
      { label: 'TikTok', platform: 'tiktok', status: 'supported' },
    ]),
    updateScheduledRelease: vi
      .fn()
      .mockResolvedValue({ id: 'release-1', title: 'Updated' }),
    validateSchedulerTarget: vi.fn().mockResolvedValue({
      errors: [],
      platform: 'youtube',
      valid: true,
      validationState: 'valid',
      warnings: [],
    }),
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
  it('lists the scheduler release and capability tools', () => {
    expect([...SCHEDULER_TOOL_NAMES].sort()).toEqual([
      'control_scheduled_release',
      'create_scheduled_release',
      'get_scheduled_release',
      'get_scheduler_capability',
      'list_brand_publishing_readiness',
      'list_scheduler_capabilities',
      'update_scheduled_release',
      'validate_scheduler_target',
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

  it('lists scheduler capabilities and forwards discovery flags', async () => {
    const client = buildClient();

    const result = await call(client, 'list_scheduler_capabilities', {
      includeHidden: true,
      includePlanned: false,
    });

    expect(client.listSchedulerCapabilities).toHaveBeenCalledWith({
      includeHidden: true,
      includePlanned: false,
    });
    expect(client.createScheduledRelease).not.toHaveBeenCalled();
    expect(client.updateScheduledRelease).not.toHaveBeenCalled();
    expect(client.controlScheduledRelease).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('youtube');
  });

  it("lists a brand's publishing channels with credential readiness", async () => {
    const client = buildClient();

    const result = await call(client, 'list_brand_publishing_readiness', {
      brandId: 'brand-1',
    });

    expect(client.listBrandPublishingReadiness).toHaveBeenCalledWith('brand-1');
    expect(client.createScheduledRelease).not.toHaveBeenCalled();
    expect(client.updateScheduledRelease).not.toHaveBeenCalled();
    expect(client.controlScheduledRelease).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('credential-1');
    expect(result.content[0].text).toContain('publish_capable');
  });

  it('rejects brand publishing readiness discovery without a brand ID', async () => {
    const client = buildClient();

    await expect(
      call(client, 'list_brand_publishing_readiness', {}),
    ).rejects.toThrow(/brandId is required/);
    expect(client.listBrandPublishingReadiness).not.toHaveBeenCalled();
  });

  it('describes an empty capability list without calling mutating methods', async () => {
    const client = buildClient();
    client.listSchedulerCapabilities.mockResolvedValue([]);

    const result = await call(client, 'list_scheduler_capabilities', {});

    expect(client.listSchedulerCapabilities).toHaveBeenCalledWith({
      includeHidden: undefined,
      includePlanned: undefined,
    });
    expect(result.content[0].text).toBe('No scheduler capabilities found.');
  });

  it('gets one scheduler capability by platform', async () => {
    const client = buildClient();

    await call(client, 'get_scheduler_capability', { platform: 'youtube' });

    expect(client.getSchedulerCapability).toHaveBeenCalledWith('youtube');
    expect(client.createScheduledRelease).not.toHaveBeenCalled();
    expect(client.updateScheduledRelease).not.toHaveBeenCalled();
    expect(client.controlScheduledRelease).not.toHaveBeenCalled();
  });

  it('rejects get_scheduler_capability without a platform', async () => {
    const client = buildClient();

    await expect(call(client, 'get_scheduler_capability', {})).rejects.toThrow(
      /platform is required/,
    );
    expect(client.getSchedulerCapability).not.toHaveBeenCalled();
  });

  it('validates a proposed target without mutating scheduler state', async () => {
    const client = buildClient();
    const media = [{ id: 'asset-1', kind: 'video' }];
    const settings = { privacyStatus: 'public' };

    const result = await call(client, 'validate_scheduler_target', {
      caption: 'Hello',
      media,
      platform: 'youtube',
      publishMode: 'scheduled',
      settings,
      visibility: 'public',
    });

    expect(client.validateSchedulerTarget).toHaveBeenCalledWith({
      caption: 'Hello',
      media,
      platform: 'youtube',
      publishMode: 'scheduled',
      settings,
      visibility: 'public',
    });
    expect(client.createScheduledRelease).not.toHaveBeenCalled();
    expect(client.updateScheduledRelease).not.toHaveBeenCalled();
    expect(client.controlScheduledRelease).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('valid');
  });

  it('rejects validate payloads without a platform', async () => {
    const client = buildClient();

    await expect(
      call(client, 'validate_scheduler_target', { settings: {} }),
    ).rejects.toThrow(/platform is required/);
    expect(client.validateSchedulerTarget).not.toHaveBeenCalled();
  });

  it('rejects non-object settings on validate', async () => {
    const client = buildClient();

    await expect(
      call(client, 'validate_scheduler_target', {
        platform: 'youtube',
        settings: ['not-an-object'],
      }),
    ).rejects.toThrow(/settings must be an object/);
    expect(client.validateSchedulerTarget).not.toHaveBeenCalled();
  });
});

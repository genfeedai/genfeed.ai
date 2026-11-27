import { McpToolInputError } from '@genfeedai/actions';
import type { IPublishingProviderReadiness } from '@genfeedai/contracts/interfaces';
import type { ClientService } from '@mcp/services/client.service';
import { isMcpToolRefusal } from '@mcp/tools/mcp-tool-error';
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
      'get_brand_publishing_readiness',
      'get_scheduled_release',
      'get_scheduler_capabilities',
      'search_instagram_music',
      'update_scheduled_release',
      'validate_scheduler_target',
    ]);
  });
});

describe('search_instagram_music', () => {
  it('searches through the connected account and returns the tracks as data', async () => {
    const tracks = [{ audioId: '1', title: 'Birthday Wish' }];
    const searchInstagramMusic = vi.fn().mockResolvedValue(tracks);

    const result = await handleSchedulerTool(
      { searchInstagramMusic } as unknown as ClientService,
      'search_instagram_music',
      { audioType: 'music', credentialId: 'cred-1', query: 'birthday' },
    );

    expect(searchInstagramMusic).toHaveBeenCalledWith(
      'cred-1',
      'birthday',
      'music',
    );
    expect(result.content[0].text).toContain('Birthday Wish');
  });

  it('says so when Instagram returns no music', async () => {
    const result = await handleSchedulerTool(
      {
        searchInstagramMusic: vi.fn().mockResolvedValue([]),
      } as unknown as ClientService,
      'search_instagram_music',
      { credentialId: 'cred-1' },
    );

    expect(result.content[0].text).toBe('No music tracks found.');
  });
});

describe('handleSchedulerTool', () => {
  it('reuses the approval key after a single release was persisted but its response failed', async () => {
    const client = buildClient();
    const releases = new Map<string, { id: string; status: string }>();
    client.createScheduledRelease.mockImplementation(async (_release, key) => {
      const storageKey = key ?? `unkeyed:${releases.size}`;
      const existing = releases.get(storageKey);
      if (existing) return existing;
      releases.set(storageKey, { id: 'release-1', status: 'paused' });
      throw new Error('Policy check unavailable after persistence');
    });
    const args = {
      release: {
        baseContent: 'Hello',
        targets: [{ credentialId: 'credential-1', platform: 'linkedin' }],
        timezone: 'UTC',
        title: 'Launch',
      },
    };
    const execute = () =>
      handleSchedulerTool(
        client as unknown as ClientService,
        'create_scheduled_release',
        args,
        'approval-1',
      );

    await expect(execute()).rejects.toThrow('Policy check unavailable');
    await expect(execute()).resolves.toMatchObject({
      structuredContent: { data: { id: 'release-1', status: 'paused' } },
    });
    expect([...releases.entries()]).toEqual([
      ['mcp-release:approval-1', { id: 'release-1', status: 'paused' }],
    ]);
  });

  describe('keyless release idempotency', () => {
    const release = {
      baseContent: 'Hello',
      brandId: 'brand-1',
      scheduledDate: '2026-12-01T09:00:00.000Z',
      targets: [{ credentialId: 'credential-1', platform: 'linkedin' }],
      timezone: 'Europe/Malta',
      title: 'Launch',
    };

    async function keyFor(args: Record<string, unknown>) {
      const client = buildClient();
      await call(client, 'create_scheduled_release', args);
      return client.createScheduledRelease.mock.calls[0][1] as string;
    }

    it('sends a deterministic content key when no key or approval exists', async () => {
      const first = await keyFor({ release });
      expect(first).toMatch(/^mcp-release:content:[0-9a-f]{64}$/);
      expect(await keyFor({ release: { ...release } })).toBe(first);
    });

    it('ignores property order', async () => {
      const reordered = {
        title: release.title,
        timezone: release.timezone,
        targets: [{ platform: 'linkedin', credentialId: 'credential-1' }],
        scheduledDate: release.scheduledDate,
        brandId: release.brandId,
        baseContent: release.baseContent,
      };
      expect(await keyFor({ release: reordered })).toBe(
        await keyFor({ release }),
      );
    });

    it('changes the key for another time or target', async () => {
      const base = await keyFor({ release });
      expect(
        await keyFor({
          release: { ...release, scheduledDate: '2026-12-02T09:00:00.000Z' },
        }),
      ).not.toBe(base);
      expect(
        await keyFor({
          release: {
            ...release,
            targets: [{ credentialId: 'credential-2', platform: 'linkedin' }],
          },
        }),
      ).not.toBe(base);
    });

    it('derives the batch key independent of property order', async () => {
      const batchKey = async (releases: Record<string, unknown>[]) => {
        const createScheduledReleaseBatch = vi
          .fn()
          .mockResolvedValue({ created: [], errors: [] });
        const client = {
          scheduler: { createScheduledReleaseBatch },
        } as unknown as ClientService;
        await handleSchedulerTool(client, 'create_scheduled_release', {
          releases,
        });
        return createScheduledReleaseBatch.mock.calls[0][1] as string;
      };
      const reordered = {
        title: release.title,
        timezone: release.timezone,
        targets: [{ platform: 'linkedin', credentialId: 'credential-1' }],
        scheduledDate: release.scheduledDate,
        brandId: release.brandId,
        baseContent: release.baseContent,
      };
      expect(await batchKey([reordered])).toBe(await batchKey([release]));
    });
  });

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
    expect(result).toMatchObject({
      structuredContent: { data: { id: 'release-1' } },
    });
    expect(result.content[0].text).not.toContain('release-1');
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

  it('forwards target visibility and still rejects unknown target fields', async () => {
    const client = buildClient();

    await call(client, 'update_scheduled_release', {
      changes: { visibility: 'private' },
      releaseId: 'release-1',
      scope: 'target',
      targetId: 'target-1',
    });

    expect(client.updateScheduledRelease).toHaveBeenCalledWith(
      'release-1',
      { visibility: 'private' },
      'target-1',
    );

    await expect(
      call(client, 'update_scheduled_release', {
        changes: { headline: 'not a target field' },
        releaseId: 'release-1',
        scope: 'target',
        targetId: 'target-1',
      }),
    ).rejects.toThrow(/not editable for target scope: headline/);
  });

  // A model that sends a wrong action is refused as a caller input error: a
  // plain Error is reported to Sentry as a server fault on every such call.
  it('refuses an unknown control action as a caller input error', async () => {
    const client = buildClient();

    const failure = await call(client, 'control_scheduled_release', {
      action: 'delete',
      releaseId: 'release-1',
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(McpToolInputError);
    expect(failure).toMatchObject({ field: 'action' });
    expect(isMcpToolRefusal(failure)).toBe(true);
    expect(client.controlScheduledRelease).not.toHaveBeenCalled();
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

  it('reopens a cancelled release in place, at a new time when one is given', async () => {
    const client = buildClient();

    await call(client, 'control_scheduled_release', {
      action: 'reopen',
      releaseId: 'release-1',
      scheduledDate: '2026-11-27T15:00:00.000Z',
    });

    expect(client.controlScheduledRelease).toHaveBeenCalledWith(
      'release-1',
      'reopen',
      '2026-11-27T15:00:00.000Z',
    );
  });

  it('refuses a scheduledDate on any action but reopen', async () => {
    const client = buildClient();

    const failure = await call(client, 'control_scheduled_release', {
      action: 'resume',
      releaseId: 'release-1',
      scheduledDate: '2026-11-27T15:00:00.000Z',
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ field: 'scheduledDate' });
    expect(client.controlScheduledRelease).not.toHaveBeenCalled();
  });

  it('rejects an unknown tool name', () => {
    const client = buildClient();
    expect(() => call(client, 'not_a_scheduler_tool', {})).toThrow(
      /Unknown scheduler tool/,
    );
  });

  it('lists scheduler capabilities and forwards discovery flags', async () => {
    const client = buildClient();

    const result = await call(client, 'get_scheduler_capabilities', {
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

    const result = await call(client, 'get_brand_publishing_readiness', {
      brandId: 'brand-1',
    });

    expect(client.listBrandPublishingReadiness).toHaveBeenCalledWith('brand-1');
    expect(client.createScheduledRelease).not.toHaveBeenCalled();
    expect(client.updateScheduledRelease).not.toHaveBeenCalled();
    expect(client.controlScheduledRelease).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      structuredContent: { data: [{ credentialId: 'credential-1' }] },
    });
    expect(result.content[0].text).not.toContain('credential-1');
    expect(result.content[0].text).toContain('Publish capable');
  });

  it.each([
    { providerKey: 'pinterest', status: 'hidden' },
    { providerKey: 'twitter', status: 'supported' },
  ] as const)(
    'passes through $status readiness and diagnostics without writes',
    async ({ providerKey, status }) => {
      const client = buildClient();
      const supported = status === 'supported';
      const requiredAction = supported
        ? null
        : 'Choose a supported scheduling channel. Reconnecting this account does not enable scheduling.';
      const readiness: IPublishingProviderReadiness = {
        appReviewStatus: 'unknown',
        callbackUrlStatus: 'pass',
        canSchedule: supported,
        credentialId: 'credential-1',
        diagnostics: supported
          ? []
          : [
              {
                checkedAt: '2026-09-24T12:00:00.000Z',
                classification: 'unknown',
                code: 'scheduler_channel_unavailable',
                correctiveAction: requiredAction ?? undefined,
                details: {
                  capabilityStatus: status,
                  credentialCanSchedule: true,
                },
                isRetryable: false,
                message:
                  'Pinterest scheduling is unavailable until live publishing is verified.',
                scope: 'provider',
                severity: 'error',
              },
            ],
        isRetryable: false,
        permissionScopeStatus: 'pass',
        providerKey,
        quotaStatus: 'unknown',
        requiredAction,
        state: supported ? 'publish_capable' : 'blocked',
        tokenFreshness: 'pass',
      };
      client.listBrandPublishingReadiness.mockResolvedValue([readiness]);

      const result = await call(client, 'get_brand_publishing_readiness', {
        brandId: 'brand-1',
      });

      expect(result).toMatchObject({
        structuredContent: { data: [readiness] },
      });
      expect(result.content[0].text).toContain('Provider Key:');
      expect(result.content[0].text).not.toContain('credential-1');
      for (const diagnostic of readiness.diagnostics)
        expect(result.content[0].text).toContain(diagnostic.message);
      expect(client.listBrandPublishingReadiness).toHaveBeenCalledTimes(1);
      expect(client.listBrandPublishingReadiness).toHaveBeenCalledWith(
        'brand-1',
      );
      expect(client.createScheduledRelease).not.toHaveBeenCalled();
      expect(client.updateScheduledRelease).not.toHaveBeenCalled();
      expect(client.controlScheduledRelease).not.toHaveBeenCalled();
    },
  );

  it('rejects brand publishing readiness discovery without a brand ID', async () => {
    const client = buildClient();

    await expect(
      call(client, 'get_brand_publishing_readiness', {}),
    ).rejects.toThrow(/brandId is required/);
    expect(client.listBrandPublishingReadiness).not.toHaveBeenCalled();
  });

  it('describes an empty capability list without calling mutating methods', async () => {
    const client = buildClient();
    client.listSchedulerCapabilities.mockResolvedValue([]);

    const result = await call(client, 'get_scheduler_capabilities', {});

    expect(client.listSchedulerCapabilities).toHaveBeenCalledWith({
      includeHidden: undefined,
      includePlanned: undefined,
    });
    expect(result.content[0].text).toBe('No scheduler capabilities found.');
  });

  it('gets one scheduler capability by platform', async () => {
    const client = buildClient();

    await call(client, 'get_scheduler_capabilities', { platform: 'youtube' });

    expect(client.getSchedulerCapability).toHaveBeenCalledWith('youtube');
    expect(client.listSchedulerCapabilities).not.toHaveBeenCalled();
    expect(client.createScheduledRelease).not.toHaveBeenCalled();
    expect(client.updateScheduledRelease).not.toHaveBeenCalled();
    expect(client.controlScheduledRelease).not.toHaveBeenCalled();
  });

  it('rejects list-only flags when a platform is given', async () => {
    const client = buildClient();

    for (const flag of ['includeHidden', 'includePlanned']) {
      await expect(
        call(client, 'get_scheduler_capabilities', {
          [flag]: false,
          platform: 'youtube',
        }),
      ).rejects.toThrow(/apply only when listing/);
    }
    expect(client.getSchedulerCapability).not.toHaveBeenCalled();
    expect(client.listSchedulerCapabilities).not.toHaveBeenCalled();
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

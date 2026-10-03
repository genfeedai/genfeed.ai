import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentWorkspaceToolHandler } from '@api/services/agent-orchestrator/tools/agent-workspace-tool-handler.service';
import { IngredientCategory } from '@genfeedai/contracts';
import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';

function createHandler(): AgentWorkspaceToolHandler {
  return new AgentWorkspaceToolHandler(
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[0],
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[1],
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[2],
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[3],
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[4],
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[5],
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[6],
    {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[7],
  );
}

describe('AgentWorkspaceToolHandler.openStudioHandoff', () => {
  it('refuses to invent a generate URL when no ingredient is present', async () => {
    const result = await createHandler().openStudioHandoff({ type: 'image' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('prepare_generation');
    expect(JSON.stringify(result)).not.toContain('/studio?type=');
    expect(JSON.stringify(result)).not.toContain('/g/');
  });

  it('opens an existing image in Library, not the retired gallery path', async () => {
    const result = await createHandler().openStudioHandoff({
      ingredientId: 'img-1',
      type: 'image',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        href: createLibraryAssetRoute(IngredientCategory.IMAGE, 'img-1'),
        ingredientId: 'img-1',
      }),
    );
    expect(result.nextActions?.[0]?.studioUrl).toBe(
      createLibraryAssetRoute(IngredientCategory.IMAGE, 'img-1'),
    );
    expect(JSON.stringify(result)).not.toContain('/g/');
    expect(JSON.stringify(result)).not.toContain('/studio?type=');
  });
});

describe('AgentWorkspaceToolHandler.requestMediaUpload', () => {
  function fixture() {
    const uploads = {
      getPresignedUploadUrl: vi.fn().mockResolvedValue({
        id: 'asset-1',
        uploadMethod: 'PUT',
        uploadUrl: 'https://upload.example.test',
        publicUrl: 'https://cdn.example.test/asset-1',
        s3Key: 'ingredients/images/asset-1',
        expiresIn: 3600,
      }),
    };
    const brands = { findOne: vi.fn().mockResolvedValue({ id: 'brand-1' }) };
    // #5219: resolveGenerationBrand's per-member fallback. Defaults to the
    // brand the pre-#5219 isSelected fixtures used, so tests that don't care
    // about member resolution keep working unchanged.
    const members = {
      findOne: vi.fn().mockResolvedValue({ currentBrandId: 'brand-1' }),
    };
    const handler = new AgentWorkspaceToolHandler(
      {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[0],
      brands as unknown as ConstructorParameters<
        typeof AgentWorkspaceToolHandler
      >[1],
      members as unknown as ConstructorParameters<
        typeof AgentWorkspaceToolHandler
      >[2],
      {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[3],
      {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[4],
      uploads as unknown as ConstructorParameters<
        typeof AgentWorkspaceToolHandler
      >[5],
      {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[6],
      {} as ConstructorParameters<typeof AgentWorkspaceToolHandler>[7],
    );
    return { brands, handler, members, uploads };
  }
  const params = {
    filename: 'photo.png',
    contentType: 'image/png',
    category: 'image',
  };
  const ctx: ToolExecutionContext = {
    organizationId: 'org-1',
    userId: 'user-1',
    threadId: 'thread-1',
    validatedScope: {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
      threadId: 'thread-1',
      contextVersion: 1,
      isLegacyFallback: false,
      isVersionExplicit: true,
      source: 'explicit',
    },
  };

  it('preserves the validated thread brand when the direct brand is absent', async () => {
    const { handler, uploads } = fixture();
    expect((await handler.requestMediaUpload(params, ctx)).success).toBe(true);
    expect(uploads.getPresignedUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1' }),
      expect.anything(),
    );
  });

  it('rejects brandless uploads before reserving an asset', async () => {
    const { brands, handler, uploads } = fixture();
    brands.findOne.mockResolvedValue(null);
    const result = await handler.requestMediaUpload(params, {
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('brand');
    expect(uploads.getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('resolves the selected brand for headless MCP calls', async () => {
    const { brands, handler, members, uploads } = fixture();
    const result = await handler.requestMediaUpload(params, {
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(result.success).toBe(true);
    // #5219: no isSelected filter — resolved via the acting member's
    // currentBrandId.
    expect(members.findOne).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(brands.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      organizationId: 'org-1',
    });
    expect(uploads.getPresignedUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', organizationId: 'org-1' }),
      expect.anything(),
    );
  });

  it('rejects an explicit brand outside the organization without falling back', async () => {
    const { brands, handler, members, uploads } = fixture();
    brands.findOne.mockResolvedValue(null);
    // No member fallback available either, so resolution has nowhere left to
    // fall through to once the request-scoped brand comes back empty.
    members.findOne.mockResolvedValueOnce({});
    const result = await handler.requestMediaUpload(params, {
      ...ctx,
      brandId: 'foreign-brand',
    });
    expect(result.success).toBe(false);
    expect(brands.findOne).toHaveBeenCalledExactlyOnceWith({
      id: 'foreign-brand',
      organizationId: 'org-1',
    });
    expect(uploads.getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('returns the files service self-hosted POST_JSON instructions', async () => {
    const { handler, uploads } = fixture();
    uploads.getPresignedUploadUrl.mockResolvedValue({
      id: 'asset-1',
      uploadMethod: 'POST_JSON',
      uploadUrl: 'http://files.local/v1/files/upload',
      publicUrl: 'http://files.local/asset-1',
      s3Key: 'ingredients/images/asset-1',
      expiresIn: 3600,
    });
    const result = await handler.requestMediaUpload(params, {
      ...ctx,
      brandId: 'brand-1',
    });
    expect(result.data).toMatchObject({
      method: 'POST_JSON',
      localUpload: {
        key: 'asset-1',
        source: { type: 'base64', contentType: 'image/png' },
        type: 'images',
      },
    });
    expect(result.data).not.toHaveProperty('headers');
  });
});

type HandlerArgs = ConstructorParameters<typeof AgentWorkspaceToolHandler>;

function buildHandler(overrides: {
  brands?: unknown;
  credits?: unknown;
  ingredients?: unknown;
  members?: unknown;
  personas?: unknown;
  transactions?: unknown;
}): AgentWorkspaceToolHandler {
  return new AgentWorkspaceToolHandler(
    (overrides.credits ?? {}) as HandlerArgs[0],
    (overrides.brands ?? {}) as HandlerArgs[1],
    (overrides.members ?? {}) as HandlerArgs[2],
    {} as HandlerArgs[3],
    (overrides.personas ?? {}) as HandlerArgs[4],
    {} as HandlerArgs[5],
    (overrides.transactions ?? {}) as HandlerArgs[6],
    (overrides.ingredients ?? {}) as HandlerArgs[7],
  );
}

const baseCtx = {
  brandId: 'brand-b',
  organizationId: 'org-1',
  userId: 'user-1',
} as ToolExecutionContext;

describe('AgentWorkspaceToolHandler.listAssets characters (#6009)', () => {
  it('lists characters for the active brand through the shared availability rule', async () => {
    const personas = {
      listCharacterMentions: vi.fn().mockResolvedValue([
        {
          handle: 'anna',
          hasReferenceImage: true,
          id: 'persona-1',
          label: 'Anna (shared from another brand)',
        },
      ]),
    };
    const handler = buildHandler({ personas });

    const result = await handler.listAssets(
      { q: 'an', type: 'character' },
      baseCtx,
    );

    expect(personas.listCharacterMentions).toHaveBeenCalledWith({
      brandId: 'brand-b',
      organizationId: 'org-1',
      q: 'an',
    });
    expect(result.data).toEqual({
      characters: [
        expect.objectContaining({
          handle: 'anna',
          hasReferenceImage: true,
        }),
      ],
    });
  });

  it('rejects pagination and origin for characters', async () => {
    const result = await buildHandler({}).listAssets(
      { origin: 'UPLOADED', type: 'character' },
      baseCtx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('origin');
  });
});

describe('AgentWorkspaceToolHandler.listAssets library assets', () => {
  const row = {
    category: 'IMAGE',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    generationPrompt: 'a red fox',
    id: 'img-1',
    origin: 'GENERATED',
    status: 'GENERATED',
    cdnUrl: 'https://cdn.example.test/img-1.png',
  };

  it('scopes the listing to the caller organization with defaults', async () => {
    const ingredients = {
      listLibraryAssets: vi.fn().mockResolvedValue([row]),
    };
    const result = await buildHandler({ ingredients }).listAssets(
      { type: 'image' },
      baseCtx,
    );

    expect(ingredients.listLibraryAssets).toHaveBeenCalledWith({
      category: IngredientCategory.IMAGE,
      limit: 10,
      offset: 0,
      organizationId: 'org-1',
      origin: undefined,
    });
    expect(result.data).toEqual({
      assets: [
        {
          category: 'IMAGE',
          createdAt: row.createdAt,
          id: 'img-1',
          origin: 'GENERATED',
          prompt: 'a red fox',
          status: 'GENERATED',
          url: 'https://cdn.example.test/img-1.png',
        },
      ],
      count: 1,
      type: 'image',
    });
  });

  it('clamps limit, passes offset and origin, and maps each type to its category', async () => {
    const ingredients = { listLibraryAssets: vi.fn().mockResolvedValue([]) };
    const handler = buildHandler({ ingredients });

    await handler.listAssets(
      { limit: 500, offset: 20, origin: 'UPLOADED', type: 'video' },
      baseCtx,
    );
    expect(ingredients.listLibraryAssets).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category: IngredientCategory.VIDEO,
        limit: 50,
        offset: 20,
        origin: 'UPLOADED',
      }),
    );

    await handler.listAssets({ type: 'music' }, baseCtx);
    expect(ingredients.listLibraryAssets).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: IngredientCategory.MUSIC }),
    );
    await handler.listAssets({ type: 'avatar' }, baseCtx);
    expect(ingredients.listLibraryAssets).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: IngredientCategory.AVATAR }),
    );
  });

  it('rejects an unknown type, a bad origin, and q on non-character types', async () => {
    const ingredients = { listLibraryAssets: vi.fn() };
    const handler = buildHandler({ ingredients });

    expect((await handler.listAssets({ type: 'gif' }, baseCtx)).success).toBe(
      false,
    );
    expect(
      (await handler.listAssets({ origin: 'nope', type: 'image' }, baseCtx))
        .error,
    ).toContain('origin must be');
    expect(
      (await handler.listAssets({ q: 'x', type: 'image' }, baseCtx)).error,
    ).toContain('character');
    expect(ingredients.listLibraryAssets).not.toHaveBeenCalled();
  });
});

describe('AgentWorkspaceToolHandler.getAccount', () => {
  const metrics = {
    breakdown: [{ amount: 12, count: 3, source: 'image' }],
    currentBalance: 88,
    dailySeries: [{ amount: 1, date: '2026-09-01' }],
    monthlySeries: [],
    trendPercentage: 5,
    usage30Days: 40,
    usage7Days: 12,
    weeklySeries: [],
  };

  function accountHandler() {
    const credits = {
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(88),
    };
    const transactions = {
      getUsageMetrics: vi.fn().mockResolvedValue(metrics),
    };
    const members = {
      findOne: vi.fn().mockResolvedValue({ role: { key: 'admin' } }),
    };
    return {
      credits,
      handler: buildHandler({ credits, members, transactions }),
      members,
      transactions,
    };
  }

  it('returns profile, credits and usage by default without the series', async () => {
    const { handler } = accountHandler();
    const result = await handler.getAccount({}, baseCtx);

    expect(result.data).toEqual({
      credits: { balance: 88 },
      profile: {
        brandId: 'brand-b',
        organizationId: 'org-1',
        role: 'admin',
        userId: 'user-1',
      },
      usage: {
        breakdown: [{ amount: 12, count: 3, source: 'image' }],
        currentBalance: 88,
        trendPercentage: 5,
        usage30Days: 40,
        usage7Days: 12,
      },
    });
  });

  it('passes non-zero usage through instead of zeroing it', async () => {
    const { handler } = accountHandler();
    const result = await handler.getAccount({ include: ['usage'] }, baseCtx);
    const usage = (result.data as { usage: Record<string, number> }).usage;

    expect(usage.usage7Days).toBe(12);
    expect(usage.usage30Days).toBe(40);
  });

  it('reads only the requested sections', async () => {
    const { credits, handler, members, transactions } = accountHandler();
    const result = await handler.getAccount({ include: ['credits'] }, baseCtx);

    expect(result.data).toEqual({ credits: { balance: 88 } });
    expect(credits.getOrganizationCreditsBalance).toHaveBeenCalledWith('org-1');
    expect(transactions.getUsageMetrics).not.toHaveBeenCalled();
    expect(members.findOne).not.toHaveBeenCalled();
  });

  it('fails closed to an empty role and rejects unknown sections', async () => {
    const members = { findOne: vi.fn().mockRejectedValue(new Error('down')) };
    const handler = buildHandler({ members });
    const result = await handler.getAccount({ include: ['profile'] }, {
      organizationId: 'org-1',
      userId: 'user-1',
    } as ToolExecutionContext);

    expect(result.data).toEqual({
      profile: { organizationId: 'org-1', role: '', userId: 'user-1' },
    });
    expect(
      (await handler.getAccount({ include: ['secrets'] }, baseCtx)).success,
    ).toBe(false);
  });
});

describe('AgentWorkspaceToolHandler.getBrands', () => {
  const docs = [
    { id: 'b1', label: 'Acme', name: 'Acme', slug: 'acme' },
    { id: 'b2', label: 'Beta Co', name: 'Beta', slug: 'beta' },
  ];
  const brands = { findAll: vi.fn().mockResolvedValue({ docs }) };
  const handler = buildHandler({ brands });

  it('lists the organization brands without brandId', async () => {
    const result = await handler.getBrands({}, baseCtx);

    expect(brands.findAll).toHaveBeenCalledWith(
      { where: { isDeleted: false, organizationId: 'org-1' } },
      {},
    );
    expect(
      (result.data as { brands: unknown[] }).brands.map(
        (brand) => (brand as { id: string }).id,
      ),
    ).toEqual(['b1', 'b2']);
  });

  it.each(['b2', 'BETA', 'beta co'])(
    'returns the one brand matched by %s',
    async (brandId) => {
      const result = await handler.getBrands({ brandId }, baseCtx);
      expect(result.success).toBe(true);
      expect((result.data as { brand: { id: string } }).brand.id).toBe('b2');
    },
  );

  it('fails when the brand is not in the organization', async () => {
    const result = await handler.getBrands({ brandId: 'ghost' }, baseCtx);
    expect(result).toMatchObject({
      error: 'Brand was not found in this organization.',
      success: false,
    });
  });
});

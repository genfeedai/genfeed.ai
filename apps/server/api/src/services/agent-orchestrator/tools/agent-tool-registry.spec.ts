import { BRAND_PROFILE_GENERATION_CREDIT_COST } from '@api/collections/brands/constants/brand-profile.constant';
import {
  AGENT_CREDIT_COSTS,
  agentToolCreditFloor,
} from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import {
  assertUniqueAgentToolNames,
  getToolDefinitionByName,
  getToolDefinitions,
} from '@api/services/agent-orchestrator/tools/agent-tool-registry';
import {
  getToolByName,
  getToolsForSurface,
  isMcpBrandRequiredTool,
  MCP_BRAND_REQUIRED_NOTE,
  toMcpTools,
} from '@genfeedai/actions';

/** Tools whose MCP description is deliberately worded for the MCP surface. */
const MCP_REWORDED_TOOLS: ReadonlySet<string> = new Set(['create_post']);

// Compare validation independently of client-facing description annotations.
// Schema maps contain user property names; literals/defaults/examples are data.
function schemaValidation(schema: unknown): unknown {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema))
    return schema;
  const entries: [string, unknown][] = Object.entries(schema);
  return Object.fromEntries(
    entries
      .filter(
        ([key, value]) => !(key === 'description' && typeof value === 'string'),
      )
      .map(([key, value]) => {
        if (
          [
            'properties',
            'patternProperties',
            '$defs',
            'definitions',
            'dependentSchemas',
          ].includes(key) &&
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          const children: [string, unknown][] = Object.entries(value);
          return [
            key,
            Object.fromEntries(
              children.map(([name, child]) => [name, schemaValidation(child)]),
            ),
          ];
        }
        if (
          ['allOf', 'anyOf', 'oneOf', 'prefixItems', 'items'].includes(key) &&
          Array.isArray(value)
        )
          return [key, value.map(schemaValidation)];
        if (
          [
            'items',
            'additionalItems',
            'additionalProperties',
            'unevaluatedItems',
            'unevaluatedProperties',
            'contains',
            'propertyNames',
            'not',
            'if',
            'then',
            'else',
          ].includes(key)
        )
          return [key, schemaValidation(value)];
        return [key, value];
      }),
  );
}

describe('agent-tool-registry', () => {
  it('should include onboarding tool definitions', () => {
    const definitions = getToolDefinitions();
    const names = definitions.map((tool) => tool.name);

    expect(names).toContain('create_brand');
    expect(names).toContain('rename_brand');
    expect(names).toContain('check_onboarding_status');
    expect(names).toContain('scan_brand_url');
    expect(names).toContain('save_onboarding_answers');
    expect(names).toContain('complete_onboarding');
    expect(names).toContain('create_brand_from_url');
    expect(names).toContain('get_brand_scan_status');
    expect(names).toContain('resolve_handle');
    expect(names).toContain('get_current_brand');
    expect(names).toContain('generate');
    expect(names).not.toContain('generate_image');
    expect(names).toContain('create_livestream_bot');
    expect(names).toContain('manage_livestream_bot');
    expect(names).toContain('get_ads_research');
    expect(names).toContain('get_ad_research_detail');
    expect(names).toContain('create_ad_remix_workflow');
    expect(names).toContain('fetch_instagram_inspiration');
    expect(names).toContain('fetch_instagram_inspiration_detail');
    expect(names).toContain('create_instagram_remix_workflow');
    expect(names).toContain('generate_ad_pack');
    expect(names).toContain('prepare_ad_launch_review');
    expect(names).toContain('rate_content');
    expect(names).toContain('rate_ingredient');
    expect(names).toContain('get_top_ingredients');
    expect(names).toContain('replicate_top_ingredient');
    expect(names).toContain('capture_memory');
    expect(names).toContain('get_genfeed_tools');
  });

  it('should define each agent tool exactly once', () => {
    const names = getToolDefinitions().map((tool) => String(tool.name));

    expect(new Set(names).size).toBe(names.length);
    expect(() =>
      assertUniqueAgentToolNames(getToolDefinitions()),
    ).not.toThrow();
  });

  it('should throw when a tool name is defined twice', () => {
    const [first] = getToolDefinitions();

    expect(() => assertUniqueAgentToolNames([first, first])).toThrow(
      `[${String(first.name)}] are defined more than once`,
    );
  });

  it('should expose exactly the actions the curated catalog surfaces to the agent', () => {
    const shipped = getToolDefinitions()
      .map((tool) => String(tool.name))
      .sort((a, b) => a.localeCompare(b));
    const curated = getToolsForSurface('agent')
      .map((tool) => tool.name)
      .sort((a, b) => a.localeCompare(b));

    expect(shipped).toEqual(curated);
  });

  it('should preserve representative core and ads schemas', () => {
    expect(getToolDefinitionByName('create_post')).toMatchObject({
      parameters: {
        properties: {
          confirmed: { type: 'boolean' },
          platforms: { items: { type: 'string' }, type: 'array' },
        },
        type: 'object',
      },
    });
    expect(getToolDefinitionByName('get_ads_research')).toMatchObject({
      creditCost: 0,
      parameters: {
        properties: {
          source: {
            enum: ['public', 'my_accounts', 'all'],
            type: 'string',
          },
        },
        type: 'object',
      },
    });
    expect(
      getToolDefinitionByName('prepare_ad_launch_review')?.description,
    ).toContain('X');
  });

  it('should ship the previously uncataloged cloud tools from the catalog', () => {
    const names = getToolDefinitions().map((tool) => String(tool.name));

    for (const name of [
      'draft_brand_voice_profile',
      'generate_ad_pack',
      'get_workflow_inputs',
      'prepare_ad_launch_review',
      'save_brand_voice_profile',
    ]) {
      expect(names, name).toContain(name);
      expect(getToolByName(name)?.surfaces.agent, name).toBe(true);
    }
  });

  it('should price every agent tool, including the folded cloud tools', () => {
    // create_post is the one deliberate override: see EXTRA_AGENT_CREDIT_COSTS.
    for (const tool of getToolDefinitions()) {
      if (tool.name === 'create_post') continue;
      expect(AGENT_CREDIT_COSTS[String(tool.name)], String(tool.name)).toBe(
        tool.creditCost,
      );
    }

    expect(AGENT_CREDIT_COSTS.create_brand_from_url).toBe(1);
    expect(AGENT_CREDIT_COSTS.get_brand_scan_status).toBe(0);
    expect(AGENT_CREDIT_COSTS.get_workflow_inputs).toBe(0);
    expect(AGENT_CREDIT_COSTS.save_brand_voice_profile).toBe(0);
  });

  it('should keep the catalog brand profile draft cost pinned to the API constant', () => {
    expect(getToolByName('draft_brand_voice_profile')?.creditCost).toBe(
      BRAND_PROFILE_GENERATION_CREDIT_COST,
    );
  });

  it('should keep the in-app create_post draft free while the catalog prices the MCP publish', () => {
    expect(AGENT_CREDIT_COSTS.create_post).toBe(0);
    expect(getToolByName('create_post')?.creditCost).toBe(1);
  });

  it('should register refine_text as one agent action billed like a social draft', () => {
    const tool = getToolByName('refine_text');

    expect(tool).toMatchObject({
      creditCost: 2,
      mutationPolicy: 'direct',
      parameters: {
        properties: {
          mode: { enum: ['proofread', 'rewrite'] },
          requestKey: { format: 'uuid' },
        },
        required: ['mode', 'platform', 'requestKey', 'text'],
      },
      surfaces: { agent: true, mcp: false },
    });
    expect(Object.keys(tool?.parameters.properties ?? {}).sort()).toEqual([
      'brandId',
      'mode',
      'platform',
      'requestKey',
      'text',
    ]);
    expect(AGENT_CREDIT_COSTS.refine_text).toBe(2);
    expect(getToolDefinitionByName('refine_text')).toBeDefined();
  });

  it('should register generate_reply_variants as one agent action billed like a social draft', () => {
    const tool = getToolByName('generate_reply_variants');

    expect(tool).toMatchObject({
      creditCost: 2,
      mutationPolicy: 'direct',
      parameters: {
        properties: {
          tone: {
            enum: ['agree', 'challenge', 'add-value', 'funny', 'professional'],
          },
          variants: { maximum: 5, minimum: 1 },
        },
        required: ['platform', 'postContent', 'requestKey', 'tone'],
      },
      surfaces: { agent: true, mcp: false },
    });
    expect(Object.keys(tool?.parameters.properties ?? {}).sort()).toEqual([
      'brandId',
      'platform',
      'postAuthor',
      'postContent',
      'requestKey',
      'tone',
      'variants',
    ]);
    expect(AGENT_CREDIT_COSTS.generate_reply_variants).toBe(2);
    expect(getToolDefinitionByName('generate_reply_variants')).toBeDefined();
  });

  it('should set non-zero credit costs for generation tools', () => {
    expect(AGENT_CREDIT_COSTS.draft_brand_voice_profile).toBe(1);
    expect(agentToolCreditFloor('generate', { type: 'image' })).toBe(50);
    expect(agentToolCreditFloor('generate', { type: 'video' })).toBe(300);
    expect(agentToolCreditFloor('generate', { type: 'music' })).toBe(10);
    expect(agentToolCreditFloor('generate', { type: 'voice' })).toBe(17);
    expect(AGENT_CREDIT_COSTS.generate_as_identity).toBe(100);
  });

  it('should floor an unknown or missing generate type at the highest price', () => {
    expect(agentToolCreditFloor('generate', { type: 'hologram' })).toBe(300);
    expect(agentToolCreditFloor('generate', {})).toBe(300);
  });

  it('should price every other tool by its catalog cost', () => {
    expect(agentToolCreditFloor('generate_as_identity', {})).toBe(100);
    expect(agentToolCreditFloor('unknown_tool', {})).toBe(0);
  });

  it('should no longer register the per-kind generation tools', () => {
    for (const name of [
      'generate_image',
      'generate_video',
      'generate_voice',
      'generate_music',
    ]) {
      expect(AGENT_CREDIT_COSTS).not.toHaveProperty(name);
    }
  });

  it('should set onboarding tool costs to zero', () => {
    expect(AGENT_CREDIT_COSTS.create_brand).toBe(0);
    expect(AGENT_CREDIT_COSTS.rename_brand).toBe(0);
    expect(AGENT_CREDIT_COSTS.check_onboarding_status).toBe(0);
    expect(AGENT_CREDIT_COSTS.scan_brand_url).toBe(0);
    expect(AGENT_CREDIT_COSTS.save_onboarding_answers).toBe(0);
    expect(AGENT_CREDIT_COSTS.complete_onboarding).toBe(0);
    expect(AGENT_CREDIT_COSTS.get_current_brand).toBe(0);
    expect(AGENT_CREDIT_COSTS.create_livestream_bot).toBe(0);
    expect(AGENT_CREDIT_COSTS.manage_livestream_bot).toBe(0);
    expect(AGENT_CREDIT_COSTS.get_ads_research).toBe(0);
    expect(AGENT_CREDIT_COSTS.get_ad_research_detail).toBe(0);
    expect(AGENT_CREDIT_COSTS.create_ad_remix_workflow).toBe(0);
    expect(AGENT_CREDIT_COSTS.fetch_instagram_inspiration).toBe(0);
    expect(AGENT_CREDIT_COSTS.fetch_instagram_inspiration_detail).toBe(0);
    expect(AGENT_CREDIT_COSTS.create_instagram_remix_workflow).toBe(0);
    expect(AGENT_CREDIT_COSTS.generate_ad_pack).toBe(0);
    expect(AGENT_CREDIT_COSTS.prepare_ad_launch_review).toBe(0);
    expect(AGENT_CREDIT_COSTS.rate_content).toBe(0);
    expect(AGENT_CREDIT_COSTS.rate_ingredient).toBe(0);
    expect(AGENT_CREDIT_COSTS.get_top_ingredients).toBe(0);
    expect(AGENT_CREDIT_COSTS.replicate_top_ingredient).toBe(0);
    expect(AGENT_CREDIT_COSTS.capture_memory).toBe(0);
    expect(AGENT_CREDIT_COSTS.get_genfeed_tools).toBe(0);
  });
});

it('serves every agent tool exactly as the catalog defines it', () => {
  for (const tool of getToolDefinitions()) {
    const canonical = getToolByName(tool.name);
    expect(tool.parameters, tool.name).toEqual(canonical?.parameters);
    expect(tool.description, tool.name).toBe(canonical?.description);
    expect(tool.creditCost, tool.name).toBe(canonical?.creditCost);
  }
});

it('shares validation and prices across agent/MCP with client-specific documentation', () => {
  const mcpTools = new Map(
    toMcpTools(getToolsForSurface('mcp')).map((tool) => [tool.name, tool]),
  );
  const shared = getToolDefinitions().filter((tool) =>
    mcpTools.has(String(tool.name)),
  );
  expect(shared.length).toBeGreaterThan(0);
  expect(shared.map((tool) => String(tool.name))).toEqual(
    expect.arrayContaining(['create_post', 'get_analytics']),
  );
  for (const tool of shared) {
    const mcp = mcpTools.get(String(tool.name));
    if (!mcp) throw new Error(`Missing shared MCP tool: ${tool.name}`);
    const isBrandRequired = isMcpBrandRequiredTool(String(tool.name));
    // MCP can shorten documentation and hide app-only fields (#7178); the
    // canonical agent definition is checked verbatim in the preceding test.
    expect(mcp.description.length, tool.name).toBeGreaterThan(0);
    if (MCP_REWORDED_TOOLS.has(String(tool.name))) {
      expect(mcp.description, tool.name).toContain('never publishes');
    }
    const properties = tool.parameters.properties;
    if (
      !properties ||
      typeof properties !== 'object' ||
      Array.isArray(properties)
    ) {
      throw new Error(`Missing agent properties: ${tool.name}`);
    }
    const agentProperties: Record<string, unknown> = Object.fromEntries(
      Object.entries(properties),
    );
    for (const [name, schema] of Object.entries(mcp.inputSchema.properties)) {
      expect(schemaValidation(schema), `${tool.name}.${name}`).toEqual(
        schemaValidation(
          name === 'brandId' && isBrandRequired && !(name in agentProperties)
            ? { type: 'string' }
            : agentProperties[name],
        ),
      );
    }
    expect(mcp.inputSchema.type, tool.name).toBe(tool.parameters.type);
    if (isBrandRequired) {
      expect(mcp.inputSchema.required, tool.name).toContain('brandId');
      expect(mcp.description, tool.name).toContain(MCP_BRAND_REQUIRED_NOTE);
    }
    expect(tool.creditCost, tool.name).toBe(mcp._meta['genfeed.ai/creditCost']);
  }
  expect(mcpTools.get('analyze_performance')?.description).toBe(
    'Analyze 30-day engagement by content type, platform and posting time, including top posts.',
  );
});

it('validation parity preserves property names and literal data named description', () => {
  const schema = {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Display help',
        minLength: 1,
      },
      payload: {
        const: { description: 'literal' },
        default: { description: 'default' },
        enum: [{ description: 'enum' }],
        examples: [{ description: 'example' }],
      },
    },
    required: ['description'],
  };
  expect(schemaValidation(schema)).toEqual({
    ...schema,
    properties: {
      ...schema.properties,
      description: { type: 'string', minLength: 1 },
    },
  });
});

it('advertises only root fields accepted by each canonical tool contract', () => {
  for (const tool of getToolDefinitions()) {
    const canonical = getToolByName(tool.name);
    expect(canonical, tool.name).toBeDefined();
    const properties = tool.parameters.properties;
    if (
      !properties ||
      typeof properties !== 'object' ||
      Array.isArray(properties)
    ) {
      throw new Error(`Missing object properties for ${tool.name}`);
    }
    for (const key of Object.keys(properties)) {
      expect(
        canonical?.parameters.properties,
        `${tool.name}.${key}`,
      ).toHaveProperty(key);
    }
  }
});

it('accepts connected-platform names in both the catalog and agent publishing schemas', () => {
  for (const tool of [
    getToolByName('create_post'),
    getToolDefinitionByName('create_post'),
  ]) {
    expect(tool?.parameters).toMatchObject({
      properties: {
        platform: { type: 'string' },
        platforms: { items: { type: 'string' } },
      },
    });
    expect(tool?.parameters).not.toHaveProperty('properties.platform.enum');
    expect(tool?.parameters).not.toHaveProperty(
      'properties.platforms.items.enum',
    );
  }
});

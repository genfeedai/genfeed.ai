import { getToolsForSurface } from '@genfeedai/actions';
import type { ClientService } from '@mcp/services/client.service';
import { type RemixToolName, remixToolSchemas } from '@mcp/tools/remix.schemas';
import { handleRemixTool, REMIX_TOOL_NAMES } from '@mcp/tools/remix.tool';

const cases = [
  [
    'import_source_post',
    'importSourcePost',
    { brandId: 'brand-1', url: 'https://x.com/example/status/1' },
  ],
  [
    'create_remix_concept',
    'createRemixConcept',
    { brandId: 'brand-1', sourcePostId: 'source-1' },
  ],
  ['get_remix_run', 'getRemixRun', { runId: 'run-1' }],
  [
    'update_remix_concept',
    'updateRemixConcept',
    {
      runId: 'run-1',
      expectedRevision: 2,
      edits: {
        concept: {
          hook: null,
          storyboard: [
            {
              id: 'scene-1',
              ordinal: 1,
              visualIntent: 'Product',
              identity: { avatarAssetId: 'avatar-1', speechVoiceId: 'voice-1' },
            },
          ],
        },
        identity: { avatarAssetId: null, speechVoiceId: null },
        output: { durationSeconds: null },
      },
    },
  ],
  [
    'attach_remix_analysis_source',
    'attachRemixAnalysisSource',
    { runId: 'run-1', expectedRevision: 2, assetId: null },
  ],
  [
    'quote_remix_generation',
    'quoteRemixGeneration',
    {
      runId: 'run-1',
      expectedRevision: 2,
      operation: 'generate',
      model: 'image-model',
    },
  ],
  [
    'start_remix_generation',
    'startRemixGeneration',
    { runId: 'run-1', expectedRevision: 2, quoteId: 'quote-1' },
  ],
  [
    'control_remix_generation',
    'controlRemixGeneration',
    { runId: 'run-1', expectedRevision: 2, action: 'cancel' },
  ],
] as const;

function build() {
  return Object.fromEntries(
    cases.map(([, method]) => [
      method,
      vi.fn().mockResolvedValue({
        id: 'run-1',
        revision: 2,
        execution: { variants: [{ assetIds: ['asset-1'] }] },
      }),
    ]),
  );
}

describe('handleRemixTool', () => {
  it.each(cases)(
    'validates %s and preserves the canonical response',
    async (name, method, args) => {
      const client = build();
      const result = await handleRemixTool(
        client as unknown as ClientService,
        name,
        args,
      );
      expect(client[method]).toHaveBeenCalledExactlyOnceWith(args);
      expect(JSON.parse(result.content[0].text)).toEqual({
        id: 'run-1',
        revision: 2,
        execution: { variants: [{ assetIds: ['asset-1'] }] },
      });
    },
  );

  it.each(cases)(
    'rejects unknown fields in %s before HTTP',
    async (name, method, args) => {
      const client = build();
      await expect(
        handleRemixTool(client as unknown as ClientService, name, {
          ...args,
          unauthorized: true,
        }),
      ).rejects.toThrow();
      expect(client[method]).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['import_source_post', { brandId: 'brand-1', url: 'file:///tmp/video' }],
    ['import_source_post', { url: 'https://x.com/example/status/1' }],
    [
      'create_remix_concept',
      { brandId: 'brand-1', sourcePostId: '../foreign' },
    ],
    ['get_remix_run', { runId: '../foreign' }],
    [
      'update_remix_concept',
      {
        runId: 'run-1',
        expectedRevision: 0,
        edits: { intent: { objective: 'test' } },
      },
    ],
    [
      'update_remix_concept',
      {
        runId: 'run-1',
        expectedRevision: 1,
        edits: { source: { sourcePostId: 'other' } },
      },
    ],
    [
      'update_remix_concept',
      {
        runId: 'run-1',
        expectedRevision: 1,
        edits: {
          concept: {
            storyboard: [
              { ordinal: 1, visualIntent: 'Test', providerJobId: 'invented' },
            ],
          },
        },
      },
    ],
    [
      'update_remix_concept',
      {
        runId: 'run-1',
        expectedRevision: 1,
        edits: { identity: { avatarAssetId: null, speechVoiceId: 'voice' } },
      },
    ],
    [
      'start_remix_generation',
      { runId: 'run-1', expectedRevision: 1, quoteId: 'quote', approved: true },
    ],
  ])('fails closed for invalid %s payload', async (name, args) => {
    const client = build();
    await expect(
      handleRemixTool(
        client as unknown as ClientService,
        name as string,
        args as Record<string, unknown>,
      ),
    ).rejects.toThrow();
    for (const mock of Object.values(client))
      expect(mock).not.toHaveBeenCalled();
  });

  it('advertises strict matching top-level schemas and preserves scene IDs and nullable clears', () => {
    const tools = getToolsForSurface('mcp').filter((tool) =>
      REMIX_TOOL_NAMES.has(tool.name),
    );
    expect(tools).toHaveLength(8);
    for (const tool of tools) {
      const schema = remixToolSchemas[tool.name as RemixToolName];
      expect(Object.keys(tool.parameters.properties).sort()).toEqual(
        Object.keys(schema.shape).sort(),
      );
      expect(tool.parameters.additionalProperties).toBe(false);
    }
    for (const [name, , fixture] of cases)
      expect(remixToolSchemas[name].safeParse(fixture).success).toBe(true);
  });

  it('rejects unknown tools', async () => {
    await expect(
      handleRemixTool(build() as unknown as ClientService, 'remix_unknown', {}),
    ).rejects.toThrow('Unknown remix tool');
  });
});

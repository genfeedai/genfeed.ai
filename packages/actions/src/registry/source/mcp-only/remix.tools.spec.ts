import { describe, expect, it } from 'vitest';
import { CURATED_ACTION_CATALOG } from '../../curated-action-catalog';
import { MUTATION_POLICY_BY_NAME } from '../../mutation-policy';
import { DEFAULT_MCP_PROFILE_TOOLSETS } from '../../toolset-profiles';
import { deriveMcpToolPresentation } from '../tool-annotations';
import { MCP_REMIX_TOOLS } from './remix.tools';

describe('MCP remix discovery and policy', () => {
  it('keeps eight explicit MCP-only schemas off the bare default', () => {
    expect(MCP_REMIX_TOOLS).toHaveLength(8);
    for (const tool of MCP_REMIX_TOOLS) {
      expect(tool.parameters.additionalProperties).toBe(false);
      const catalog = CURATED_ACTION_CATALOG.find(
        (entry) => entry.name === tool.name,
      );
      expect(catalog?.surfaces).toEqual(['mcp']);
      expect(DEFAULT_MCP_PROFILE_TOOLSETS).not.toContain(catalog?.toolset);
      expect(tool.parameters.properties).not.toHaveProperty('organizationId');
      expect(tool.parameters.properties).not.toHaveProperty('approved');
    }
  });

  it.each([
    'import_source_post',
    'start_remix_generation',
    'control_remix_generation',
  ])('requires durable approval for %s', (name) => {
    expect(MUTATION_POLICY_BY_NAME[name]).toBe('approval-required');
    expect(
      deriveMcpToolPresentation(name, MUTATION_POLICY_BY_NAME[name])
        .annotations,
    ).toMatchObject({
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it.each([
    'create_remix_concept',
    'update_remix_concept',
    'attach_remix_analysis_source',
    'quote_remix_generation',
  ])('declares %s a direct write rather than a read', (name) => {
    expect(MUTATION_POLICY_BY_NAME[name]).toBe('direct');
    expect(
      deriveMcpToolPresentation(name, MUTATION_POLICY_BY_NAME[name]).annotations
        .readOnlyHint,
    ).toBe(false);
  });

  it('marks retrieval read-only and conservatively avoids idempotent write promises', () => {
    expect(
      deriveMcpToolPresentation('get_remix_run', undefined).annotations,
    ).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
    for (const name of ['import_source_post', 'create_remix_concept'])
      expect(
        deriveMcpToolPresentation(name, MUTATION_POLICY_BY_NAME[name])
          .annotations,
      ).toMatchObject({ destructiveHint: false, idempotentHint: false });
  });
});

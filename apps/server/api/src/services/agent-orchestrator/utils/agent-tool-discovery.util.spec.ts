import { getToolDefinitions } from '@api/services/agent-orchestrator/tools/agent-tool-registry';
import { buildToolDefinitions } from '@api/services/agent-orchestrator/utils/agent-tool-definitions.util';
import {
  AGENT_CORE_TOOL_NAMES,
  AGENT_CORE_TOOLS_PAYLOAD_BUDGET_BYTES,
  createTurnToolset,
  FIND_TOOLS_TOOL_NAME,
  LAZY_TOOLSET_MIN_TOOLS,
} from '@api/services/agent-orchestrator/utils/agent-tool-discovery.util';
import { describe, expect, it } from 'vitest';

const catalog = buildToolDefinitions();
const names = (tools: { function: { name: string } }[]) =>
  tools.map((tool) => tool.function.name);

describe('agent tool discovery', () => {
  it('sends the whole pool to a turn with a short curated tool list', () => {
    const specialist = catalog.slice(0, LAZY_TOOLSET_MIN_TOOLS);
    const toolset = createTurnToolset(specialist);

    expect(toolset.isLazy).toBe(false);
    expect(toolset.roundTools()).toBe(specialist);
  });

  it('names only tools that exist in the agent catalog as core tools', () => {
    const missing = AGENT_CORE_TOOL_NAMES.filter(
      (name) =>
        !getToolDefinitions().some((tool) => String(tool.name) === name),
    );

    expect(missing).toEqual([]);
  });

  it('starts a general chat turn with the core set and find_tools only', () => {
    const toolset = createTurnToolset(catalog);

    expect(toolset.isLazy).toBe(true);
    expect(names(toolset.roundTools()).sort()).toEqual(
      [FIND_TOOLS_TOOL_NAME, ...AGENT_CORE_TOOL_NAMES].sort(),
    );
  });

  it('keeps the first request of a turn inside the payload budget', () => {
    const lazyBytes = JSON.stringify(
      createTurnToolset(catalog).roundTools(),
    ).length;
    const fullBytes = JSON.stringify(catalog).length;

    expect(lazyBytes).toBeLessThanOrEqual(
      AGENT_CORE_TOOLS_PAYLOAD_BUDGET_BYTES,
    );
    expect(lazyBytes).toBeLessThan(fullBytes / 3);
  });

  it('loads a tool outside the core set for the rest of the turn', () => {
    const toolset = createTurnToolset(catalog);

    const result = toolset.find('storyboard');

    expect(result.found.map((tool) => tool.name)).toContain('storyboard_video');
    expect(names(toolset.roundTools())).toContain('storyboard_video');
  });

  it('loads one tool by its exact name', () => {
    const toolset = createTurnToolset(catalog);

    const result = toolset.find('schedule_post');

    expect(result.found).toEqual([
      expect.objectContaining({ name: 'schedule_post' }),
    ]);
  });

  it('answers a query nothing matches without loading anything', () => {
    const toolset = createTurnToolset(catalog);
    const before = names(toolset.roundTools());

    const result = toolset.find('zzzqqq');

    expect(result.found).toEqual([]);
    expect(names(toolset.roundTools())).toEqual(before);
  });

  it('never loads a tool that is not in the pool', () => {
    const toolset = createTurnToolset(
      catalog.filter((tool) => tool.function.name !== 'storyboard_video'),
    );

    toolset.load('storyboard_video');
    toolset.find('storyboard');

    expect(names(toolset.roundTools())).not.toContain('storyboard_video');
  });

  it('caps what one search loads', () => {
    const toolset = createTurnToolset(catalog);

    expect(toolset.find('get', 50).found).toHaveLength(12);
  });
});

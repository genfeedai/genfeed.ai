import { describe, expect, it } from 'vitest';
import { COMMANDS, type Command, filterCommands, groupCommandsByCategory } from './commands';

describe('filterCommands', () => {
  it('returns all commands when query is empty', () => {
    expect(filterCommands(COMMANDS, '')).toEqual(COMMANDS);
    expect(filterCommands(COMMANDS, '  ')).toEqual(COMMANDS);
  });

  it('finds commands by exact label match', () => {
    const results = filterCommands(COMMANDS, 'Run Workflow');
    expect(results.some((c) => c.id === 'run-workflow')).toBe(true);
  });

  it('finds commands by keyword', () => {
    const results = filterCommands(COMMANDS, 'execute');
    expect(results.some((c) => c.id === 'run-workflow')).toBe(true);
  });

  it('handles fuzzy matching (typos)', () => {
    const results = filterCommands(COMMANDS, 'workflw');
    expect(results.some((c) => c.id === 'run-workflow')).toBe(true);
  });

  it('finds node commands by model name', () => {
    const results = filterCommands(COMMANDS, 'flux');
    expect(results.some((c) => c.id === 'add-image-gen')).toBe(true);
  });

  it('returns empty array for nonsense query', () => {
    const results = filterCommands(COMMANDS, 'zzzxyzqqq');
    expect(results).toHaveLength(0);
  });

  it('ranks label matches higher than keyword matches', () => {
    const results = filterCommands(COMMANDS, 'settings');
    expect(results[0].id).toBe('open-settings');
  });
});

describe('groupCommandsByCategory', () => {
  const testCommands: Command[] = COMMANDS.slice(0, 6);

  it('groups commands by category', () => {
    const groups = groupCommandsByCategory(testCommands, []);
    expect(groups.has('actions')).toBe(true);
    expect(groups.has('nodes')).toBe(true);
  });

  it('includes recent commands when provided', () => {
    const groups = groupCommandsByCategory(testCommands, ['run-workflow']);
    expect(groups.has('recent')).toBe(true);
    const recent = groups.get('recent')!;
    expect(recent[0].id).toBe('run-workflow');
  });

  it('skips recent category when no matching ids', () => {
    const groups = groupCommandsByCategory(testCommands, ['nonexistent-id']);
    expect(groups.has('recent')).toBe(false);
  });

  it('preserves category order: recent, actions, nodes, navigation', () => {
    const groups = groupCommandsByCategory(COMMANDS, ['open-settings']);
    const keys = Array.from(groups.keys());
    expect(keys[0]).toBe('recent');
    const nonRecentKeys = keys.slice(1);
    expect(nonRecentKeys).toEqual(['actions', 'nodes', 'navigation']);
  });
});

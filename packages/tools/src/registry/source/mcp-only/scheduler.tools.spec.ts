import { describe, expect, it } from 'vitest';
import { MCP_SCHEDULER_TOOLS } from './scheduler.tools.js';

const toolsByName = new Map(
  MCP_SCHEDULER_TOOLS.map((tool) => [tool.name, tool]),
);

describe('MCP_SCHEDULER_TOOLS', () => {
  it('exposes lifecycle tools plus read-only capability discovery', () => {
    expect(MCP_SCHEDULER_TOOLS.map((tool) => tool.name).sort()).toEqual([
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

  it('matches the REST brand publishing-readiness contract', () => {
    const tool = toolsByName.get('list_brand_publishing_readiness');
    expect(tool?.creditCost).toBe(0);
    expect(tool?.parameters.required).toEqual(['brandId']);
    expect(tool?.parameters.properties).toEqual({
      brandId: expect.objectContaining({ type: 'string' }),
    });
    expect(tool?.description).toContain('credential');
    expect(tool?.description).toContain('Read-only');
  });

  it('matches the REST channel-capability list query contract', () => {
    const tool = toolsByName.get('list_scheduler_capabilities');
    expect(tool?.creditCost).toBe(0);
    expect(tool?.parameters.required ?? []).toEqual([]);
    expect(tool?.parameters.properties).toEqual(
      expect.objectContaining({
        includeHidden: expect.objectContaining({ type: 'boolean' }),
        includePlanned: expect.objectContaining({ type: 'boolean' }),
      }),
    );
  });

  it('matches the REST platform capability get contract', () => {
    const tool = toolsByName.get('get_scheduler_capability');
    expect(tool?.creditCost).toBe(0);
    expect(tool?.parameters.required).toEqual(['platform']);
    expect(tool?.parameters.properties).toHaveProperty('platform');
  });

  it('matches the REST validate-target body contract', () => {
    const tool = toolsByName.get('validate_scheduler_target');
    expect(tool?.creditCost).toBe(0);
    expect(tool?.parameters.required).toEqual(['platform']);
    expect(Object.keys(tool?.parameters.properties ?? {}).sort()).toEqual([
      'caption',
      'credentialId',
      'media',
      'platform',
      'publishMode',
      'settings',
      'visibility',
    ]);
  });
});

import { getToolsForSurface } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';

describe('@genfeedai/actions CLI agent surface', () => {
  it('exposes the canonical CLI-safe agent tools', () => {
    const names = getToolsForSurface('cli').map((tool) => tool.name);

    expect(names).toContain('create_post');
    expect(names).toContain('generate');

    expect(names).toContain('get_account');
    expect(names).toContain('get_trends');
  });
});

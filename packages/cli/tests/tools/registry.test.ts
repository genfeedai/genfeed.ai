import { getToolsForSurface } from '@genfeedai/tools';
import { describe, expect, it } from 'vitest';

describe('@genfeedai/tools CLI agent surface', () => {
  it('exposes the canonical CLI-safe agent tools', () => {
    const names = getToolsForSurface('cli').map((tool) => tool.name);

    expect(names).toContain('create_post');
    expect(names).toContain('generate_image');
    expect(names).toContain('generate_video');
    expect(names).toContain('get_credits_balance');
    expect(names).toContain('get_trends');
  });
});

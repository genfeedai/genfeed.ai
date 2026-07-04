import * as Module from '@web-components/home/_demo';
import { describe, expect, it } from 'vitest';

describe('Demo Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

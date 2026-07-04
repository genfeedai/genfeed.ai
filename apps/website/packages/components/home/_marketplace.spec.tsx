import * as Module from '@web-components/home/_marketplace';
import { describe, expect, it } from 'vitest';

describe('Marketplace Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

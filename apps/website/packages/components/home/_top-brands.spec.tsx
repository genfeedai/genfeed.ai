import * as Module from '@web-components/home/_top-brands';
import { describe, expect, it } from 'vitest';

describe('TopBrands Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

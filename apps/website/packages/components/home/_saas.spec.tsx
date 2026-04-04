import * as Module from '@web-components/home/_saas';
import { describe, expect, it } from 'vitest';

describe('Saas Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

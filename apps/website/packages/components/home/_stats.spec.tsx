import * as Module from '@web-components/home/_stats';
import { describe, expect, it } from 'vitest';

describe('Stats Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

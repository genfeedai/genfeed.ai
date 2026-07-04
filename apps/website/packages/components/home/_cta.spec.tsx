import * as Module from '@web-components/home/_cta';
import { describe, expect, it } from 'vitest';

describe('Cta Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

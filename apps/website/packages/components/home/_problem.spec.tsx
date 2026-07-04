import * as Module from '@web-components/home/_problem';
import { describe, expect, it } from 'vitest';

describe('Problem Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

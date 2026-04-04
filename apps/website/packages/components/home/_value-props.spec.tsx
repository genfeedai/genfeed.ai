import * as Module from '@web-components/home/_value-props';
import { describe, expect, it } from 'vitest';

describe('ValueProps Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

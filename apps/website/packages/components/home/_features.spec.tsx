import * as Module from '@web-components/home/_features';
import { describe, expect, it } from 'vitest';

describe('Features Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

import * as Module from '@web-components/home/_showcase';
import { describe, expect, it } from 'vitest';

describe('Showcase Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

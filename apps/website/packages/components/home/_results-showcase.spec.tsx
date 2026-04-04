import * as Module from '@web-components/home/_results-showcase';
import { describe, expect, it } from 'vitest';

describe('ResultsShowcase Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

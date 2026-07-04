import * as Module from '@web-components/home/_features-grid';
import { describe, expect, it } from 'vitest';

describe('FeaturesGrid Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

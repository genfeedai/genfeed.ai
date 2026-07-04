import * as Module from '@web-components/home/_integrations';
import { describe, expect, it } from 'vitest';

describe('Integrations Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

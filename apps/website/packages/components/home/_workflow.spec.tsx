import * as Module from '@web-components/home/_workflow';
import { describe, expect, it } from 'vitest';

describe('Workflow Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

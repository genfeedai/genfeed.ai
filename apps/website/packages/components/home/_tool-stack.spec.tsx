import * as Module from '@web-components/home/_tool-stack';
import { describe, expect, it } from 'vitest';

describe('ToolStack Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

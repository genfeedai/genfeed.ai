import * as Module from '@web-components/NotFoundContent';
import { describe, expect, it } from 'vitest';

describe('NotFoundContent Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

import * as Module from '@web-components/home/_how-section';
import { describe, expect, it } from 'vitest';

describe('HowSection Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

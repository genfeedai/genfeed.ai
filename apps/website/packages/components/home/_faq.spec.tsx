import * as Module from '@web-components/home/_faq';
import { describe, expect, it } from 'vitest';

describe('Faq Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

import * as Module from '@web-components/home/_testimonials';
import { describe, expect, it } from 'vitest';

describe('Testimonials Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

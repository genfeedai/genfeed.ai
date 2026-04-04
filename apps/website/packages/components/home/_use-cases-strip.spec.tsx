import * as Module from '@web-components/home/_use-cases-strip';
import { describe, expect, it } from 'vitest';

describe('UseCasesStrip Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

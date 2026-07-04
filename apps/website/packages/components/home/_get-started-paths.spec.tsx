import * as Module from '@web-components/home/_get-started-paths';
import { describe, expect, it } from 'vitest';

describe('GetStartedPaths Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

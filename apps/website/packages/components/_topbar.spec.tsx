import * as Module from '@ui/shell/topbars/WebsiteTopbar';
import { describe, expect, it } from 'vitest';

describe('topbar Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });
});

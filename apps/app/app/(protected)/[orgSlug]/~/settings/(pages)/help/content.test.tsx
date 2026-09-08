import { describe, expect, it } from 'vitest';
import Module from './content';

describe('Settings help page', () => {
  it('exports the canonical help component', () => {
    expect(Module).toBeDefined();
  });
});

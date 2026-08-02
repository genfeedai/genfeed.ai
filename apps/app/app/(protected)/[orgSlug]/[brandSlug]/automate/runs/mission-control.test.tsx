import { describe, expect, it } from 'vitest';
import Module from './mission-control.tsx';

describe('mission-control.tsx', () => {
  it('exports a component', () => {
    expect(Module).toBeDefined();
  });
});

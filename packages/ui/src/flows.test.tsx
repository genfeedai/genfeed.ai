import { FlowCanvas, FlowNodeShell } from '@ui/flows';
import { describe, expect, it } from 'vitest';

describe('@ui/flows', () => {
  it('exports shared flow primitives', () => {
    expect(FlowCanvas).toBeTruthy();
    expect(FlowNodeShell).toBeTruthy();
  });
});

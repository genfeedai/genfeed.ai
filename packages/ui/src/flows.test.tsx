import { FlowCanvas, FlowNodeShell } from '@ui/flows';
import { describe, expect, it } from 'vitest';

describe('@ui/flows', () => {
  it('re-exports shared ship flow primitives', () => {
    expect(FlowCanvas).toBeTruthy();
    expect(FlowNodeShell).toBeTruthy();
  });
});

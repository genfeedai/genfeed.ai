import { describe, expect, it } from 'vitest';
import { SystemWorkflowDispatchClass } from './system-workflow-dispatch-class.constant';

describe('SystemWorkflowDispatchClass', () => {
  it('has exactly the two documented values', () => {
    expect(SystemWorkflowDispatchClass.INTERACTIVE).toBe('interactive');
    expect(SystemWorkflowDispatchClass.BACKGROUND).toBe('background');
    expect(Object.values(SystemWorkflowDispatchClass).sort()).toEqual(
      ['background', 'interactive'].sort(),
    );
  });
});

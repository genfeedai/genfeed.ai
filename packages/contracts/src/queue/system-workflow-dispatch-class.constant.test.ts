import { describe, expect, it } from 'vitest';
import { SystemWorkflowDispatchClass } from './system-workflow-dispatch-class.constant';

describe('SystemWorkflowDispatchClass', () => {
  it('has exactly the three documented values', () => {
    expect(SystemWorkflowDispatchClass.INTERACTIVE).toBe('interactive');
    expect(SystemWorkflowDispatchClass.BACKGROUND).toBe('background');
    expect(SystemWorkflowDispatchClass.SCHEDULED_PUBLISH).toBe(
      'scheduled_publish',
    );
    expect(Object.values(SystemWorkflowDispatchClass).sort()).toEqual(
      ['background', 'interactive', 'scheduled_publish'].sort(),
    );
  });
});

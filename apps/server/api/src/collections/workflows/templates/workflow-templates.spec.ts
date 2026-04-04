import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { describe, expect, it } from 'vitest';

describe('WorkflowTemplates', () => {
  it('includes the X landscape avatar starter in the public template registry', () => {
    expect(WORKFLOW_TEMPLATES).toHaveProperty('avatar-ugc-x-landscape-heygen');
  });

  it('includes the real-estate workflow starters in the public template registry', () => {
    expect(WORKFLOW_TEMPLATES).toHaveProperty('virtual-staging-rescue');
    expect(WORKFLOW_TEMPLATES).toHaveProperty('floor-plan-interior-preview');
  });
});

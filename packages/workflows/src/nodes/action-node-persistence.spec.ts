import { describe, expect, it } from 'vitest';
import {
  getWorkflowActionIdForNodeType,
  getWorkflowPresentationNodeType,
} from './action-node-persistence';

describe('workflow action-node persistence', () => {
  it('maps editor presentation types to one canonical action ID', () => {
    expect(getWorkflowActionIdForNodeType('ai-generate-image')).toBe(
      'imageGen',
    );
    expect(getWorkflowActionIdForNodeType('imageGen')).toBe('imageGen');
    expect(getWorkflowActionIdForNodeType('workflowOutput')).toBe(
      'workflow.collect-output',
    );
  });

  it('returns no action for unsupported presentation types', () => {
    expect(getWorkflowActionIdForNodeType('input-prompt')).toBeUndefined();
    expect(getWorkflowActionIdForNodeType('workflow-ref')).toBeUndefined();
    expect(getWorkflowActionIdForNodeType('not-an-action')).toBeUndefined();
  });

  it('hydrates specialized editor presentations without changing action identity', () => {
    expect(getWorkflowPresentationNodeType('aiAvatarVideo')).toBe(
      'ai-avatar-video',
    );
    expect(getWorkflowPresentationNodeType('effect-captions')).toBe(
      'captionGen',
    );
    expect(getWorkflowPresentationNodeType('imageGen')).toBe('imageGen');
  });
});

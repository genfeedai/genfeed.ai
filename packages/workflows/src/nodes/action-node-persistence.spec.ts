import { describe, expect, it } from 'vitest';
import {
  getWorkflowActionIdForNodeType,
  getWorkflowPresentationNodeType,
  hasEditorNodeType,
  pickActionInputParameters,
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

  it('keeps only the declared inputs of an action with an editor node', () => {
    expect(hasEditorNodeType('motionControl')).toBe(true);
    expect(hasEditorNodeType('imageGen')).toBe(false);
    expect(
      pickActionInputParameters('motionControl', {
        characterOrientation: 'video',
        inputImage: 'https://cdn/image.png',
        mode: 'video_transfer',
        model: 'kwaivgi/kling-v3-motion-control',
        qualityMode: 'pro',
        trajectoryPoints: [],
      }),
    ).toEqual({
      characterOrientation: 'video',
      model: 'kwaivgi/kling-v3-motion-control',
      qualityMode: 'pro',
    });
    expect(
      pickActionInputParameters('annotation', {
        annotations: [{ id: 'a' }],
        hasAnnotations: true,
        outputImage: null,
      }),
    ).toEqual({ annotations: [{ id: 'a' }] });
  });

  it('keeps every parameter of an action without an editor node', () => {
    expect(pickActionInputParameters('imageGen', { anything: 1 })).toEqual({
      anything: 1,
    });
  });
});

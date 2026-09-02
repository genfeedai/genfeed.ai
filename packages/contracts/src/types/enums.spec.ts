import { describe, expect, it } from 'vitest';
import {
  KlingQuality,
  ProcessingNodeType,
  ReframeNodeType,
  UpscaleNodeType,
  WorkflowTemplateCategory,
} from './enums';
import { EdgeStyleEnum } from './workflow';

describe('workflow enums', () => {
  it('preserves WorkflowTemplateCategory values', () => {
    expect(WorkflowTemplateCategory.IMAGE).toBe('image');
    expect(WorkflowTemplateCategory.VIDEO).toBe('video');
    expect(WorkflowTemplateCategory.AUDIO).toBe('audio');
    expect(WorkflowTemplateCategory.FULL_PIPELINE).toBe('full-pipeline');
    expect(Object.values(WorkflowTemplateCategory)).toHaveLength(4);
  });

  it('preserves ReframeNodeType values', () => {
    expect(ReframeNodeType.REFRAME).toBe('reframe');
    expect(ReframeNodeType.LUMA_REFRAME_IMAGE).toBe('lumaReframeImage');
    expect(ReframeNodeType.LUMA_REFRAME_VIDEO).toBe('lumaReframeVideo');
    expect(Object.values(ReframeNodeType)).toHaveLength(3);
  });

  it('preserves UpscaleNodeType values', () => {
    expect(UpscaleNodeType.UPSCALE).toBe('upscale');
    expect(UpscaleNodeType.TOPAZ_IMAGE_UPSCALE).toBe('topazImageUpscale');
    expect(UpscaleNodeType.TOPAZ_VIDEO_UPSCALE).toBe('topazVideoUpscale');
    expect(Object.values(UpscaleNodeType)).toHaveLength(3);
  });

  it('preserves KlingQuality wire values', () => {
    expect(KlingQuality.STANDARD).toBe('std');
    expect(KlingQuality.PRO).toBe('pro');
    expect(Object.values(KlingQuality)).toHaveLength(2);
  });

  it('includes every reframe and upscale type in ProcessingNodeType', () => {
    const processingValues = Object.values(ProcessingNodeType) as string[];
    for (const value of Object.values(ReframeNodeType)) {
      expect(processingValues).toContain(value);
    }
    for (const value of Object.values(UpscaleNodeType)) {
      expect(processingValues).toContain(value);
    }
  });

  it('preserves the remaining ProcessingNodeType values', () => {
    expect(ProcessingNodeType.VIDEO_FRAME_EXTRACT).toBe('videoFrameExtract');
    expect(ProcessingNodeType.LIP_SYNC).toBe('lipSync');
    expect(ProcessingNodeType.TEXT_TO_SPEECH).toBe('textToSpeech');
    expect(ProcessingNodeType.VOICE_CHANGE).toBe('voiceChange');
    expect(ProcessingNodeType.TRANSCRIBE).toBe('transcribe');
    expect(ProcessingNodeType.SUBTITLE).toBe('subtitle');
    expect(ProcessingNodeType.VIDEO_STITCH).toBe('videoStitch');
    expect(ProcessingNodeType.WORKFLOW_REF).toBe('workflowRef');
    expect(ProcessingNodeType.VIDEO_QA).toBe('videoQa');
    expect(Object.values(ProcessingNodeType)).toHaveLength(15);
  });

  it('preserves EdgeStyleEnum values', () => {
    expect(EdgeStyleEnum.DEFAULT).toBe('default');
    expect(EdgeStyleEnum.SMOOTHSTEP).toBe('smoothstep');
    expect(EdgeStyleEnum.STRAIGHT).toBe('straight');
    expect(Object.values(EdgeStyleEnum)).toHaveLength(3);
  });
});

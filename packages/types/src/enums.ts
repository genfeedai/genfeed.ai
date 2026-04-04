export enum WorkflowTemplateCategory {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  FULL_PIPELINE = 'full-pipeline',
}

/**
 * Reframe node types (Luma)
 */
export enum ReframeNodeType {
  REFRAME = 'reframe',
  LUMA_REFRAME_IMAGE = 'lumaReframeImage',
  LUMA_REFRAME_VIDEO = 'lumaReframeVideo',
}

/**
 * Upscale node types (Topaz)
 */
export enum UpscaleNodeType {
  UPSCALE = 'upscale',
  TOPAZ_IMAGE_UPSCALE = 'topazImageUpscale',
  TOPAZ_VIDEO_UPSCALE = 'topazVideoUpscale',
}

/**
 * Processing node types - all nodes handled by the processing processor
 */
export enum KlingQuality {
  STANDARD = 'std',
  PRO = 'pro',
}

export enum ProcessingNodeType {
  // Reframe (Luma)
  REFRAME = 'reframe',
  LUMA_REFRAME_IMAGE = 'lumaReframeImage',
  LUMA_REFRAME_VIDEO = 'lumaReframeVideo',
  // Upscale (Topaz)
  UPSCALE = 'upscale',
  TOPAZ_IMAGE_UPSCALE = 'topazImageUpscale',
  TOPAZ_VIDEO_UPSCALE = 'topazVideoUpscale',
  // Other processing nodes
  VIDEO_FRAME_EXTRACT = 'videoFrameExtract',
  LIP_SYNC = 'lipSync',
  TEXT_TO_SPEECH = 'textToSpeech',
  VOICE_CHANGE = 'voiceChange',
  TRANSCRIBE = 'transcribe',
  SUBTITLE = 'subtitle',
  VIDEO_STITCH = 'videoStitch',
  WORKFLOW_REF = 'workflowRef',
}

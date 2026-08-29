export const FILE_QUEUE_NAMES = {
  FILE_PROCESSING: 'file-processing',
  IMAGE_PROCESSING: 'image-processing',
  TASK_PROCESSING: 'task-processing',
  VIDEO_PROCESSING: 'video-processing',
  YOUTUBE_PROCESSING: 'youtube-processing',
} as const;

export const FILE_JOB_TYPES = {
  ADD_CAPTIONS: 'add-captions',
  ADD_CAPTIONS_OVERLAY: 'add-captions-overlay',
  ADD_TEXT_OVERLAY: 'add-text-overlay',
  ADD_WATERMARK: 'add-watermark',
  CAPTION_MEDIA: 'caption-media',
  CLEANUP_TEMP_FILES: 'cleanup-temp-files',
  CLIP_MEDIA: 'clip-media',
  CLIP_TRIM: 'clip-trim',
  CONVERT_TO_PORTRAIT: 'convert-to-portrait',
  CREATE_CLIPS: 'create-clips',
  DOWNLOAD_FILE: 'download-file',
  EXTRACT_FRAMES: 'extract-frames',
  EXTRACT_REFERENCE_FRAMES: 'extract-reference-frames',
  GET_VIDEO_METADATA: 'get-video-metadata',
  HOOK_REMIX: 'hook-remix',
  IMAGE_TO_VIDEO: 'image-to-video',
  KEN_BURNS_EFFECT: 'ken-burns-effect',
  MERGE_VIDEOS: 'merge-videos',
  MIRROR_VIDEO: 'mirror-video',
  PORTRAIT_BLUR: 'portrait-blur',
  PREPARE_ALL_FILES: 'prepare-all-files',
  RENDER_EDITOR_COMPOSITION: 'render-editor-composition',
  RESIZE_IMAGE: 'resize-image',
  RESIZE_MEDIA: 'resize-media',
  RESIZE_VIDEO: 'resize-video',
  REVERSE_VIDEO: 'reverse-video',
  SPLIT_SCREEN: 'split-screen',
  SPLIT_VIDEO: 'split-video',
  TRANSFORM_MEDIA: 'transform-media',
  TRIM_VIDEO: 'trim-video',
  UPLOAD_TO_S3: 'upload-to-s3',
  UPLOAD_YOUTUBE: 'upload-youtube',
  UPLOAD_YOUTUBE_UNLISTED: 'upload-youtube-unlisted',
  UPSCALE_MEDIA: 'upscale-media',
  VIDEO_TO_AUDIO: 'video-to-audio',
  VIDEO_TO_GIF: 'video-to-gif',
} as const;

export const FILE_JOB_PRIORITY = {
  HIGH: 1,
  LOW: 10,
  NORMAL: 5,
} as const;

export type FileQueueName =
  (typeof FILE_QUEUE_NAMES)[keyof typeof FILE_QUEUE_NAMES];
export type FileJobType = (typeof FILE_JOB_TYPES)[keyof typeof FILE_JOB_TYPES];
export type FileJobPriority =
  (typeof FILE_JOB_PRIORITY)[keyof typeof FILE_JOB_PRIORITY];

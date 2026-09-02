import { describe, expect, it } from 'vitest';
import {
  FILE_JOB_PRIORITY,
  FILE_JOB_TYPES,
  FILE_QUEUE_NAMES,
} from './file-queue.constants';

describe('file queue contracts', () => {
  it('preserves the queue names consumed across the server boundary', () => {
    expect(FILE_QUEUE_NAMES).toEqual({
      FILE_PROCESSING: 'file-processing',
      IMAGE_PROCESSING: 'image-processing',
      TASK_PROCESSING: 'task-processing',
      VIDEO_PROCESSING: 'video-processing',
      YOUTUBE_PROCESSING: 'youtube-processing',
    });
  });

  it('preserves representative persisted job names', () => {
    expect(FILE_JOB_TYPES).toMatchObject({
      ADD_CAPTIONS: 'add-captions',
      DOWNLOAD_FILE: 'download-file',
      RENDER_EDITOR_COMPOSITION: 'render-editor-composition',
      UPLOAD_YOUTUBE: 'upload-youtube',
    });
    expect(new Set(Object.values(FILE_JOB_TYPES)).size).toBe(
      Object.keys(FILE_JOB_TYPES).length,
    );
  });

  it('preserves the lower-number-is-higher priority ordering', () => {
    expect(FILE_JOB_PRIORITY).toEqual({
      HIGH: 1,
      LOW: 10,
      NORMAL: 5,
    });
  });
});

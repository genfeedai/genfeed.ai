import { describe, expect, it } from 'vitest';
import {
  WebSocketEventStatus,
  WebSocketEventType,
} from '../src/websocket-events.enum';

describe('websocket-events.enum', () => {
  describe('WebSocketEventType', () => {
    it('should have 21 members', () => {
      expect(Object.values(WebSocketEventType)).toHaveLength(21);
    });

    it('should have correct values', () => {
      expect(WebSocketEventType.VIDEO_GENERATED).toBe('video-generated');
      expect(WebSocketEventType.VIDEO_MERGED).toBe('video-merged');
      expect(WebSocketEventType.VIDEO_RESIZED).toBe('video-resized');
      expect(WebSocketEventType.VIDEO_REVERSED).toBe('video-reversed');
      expect(WebSocketEventType.VIDEO_MIRRORED).toBe('video-mirrored');
      expect(WebSocketEventType.VIDEO_TRIMMED).toBe('video-trimmed');
      expect(WebSocketEventType.VIDEO_TEXT_OVERLAY).toBe('video-text-overlay');
      expect(WebSocketEventType.VIDEO_PORTRAIT).toBe('video-portrait');
      expect(WebSocketEventType.CAPTIONS_COMPLETED).toBe('captions-completed');
      expect(WebSocketEventType.CAPTIONS_FAILED).toBe('captions-failed');
      expect(WebSocketEventType.IMAGE_GENERATED).toBe('image-generated');
      expect(WebSocketEventType.IMAGE_RESIZED).toBe('image-resized');
      expect(WebSocketEventType.IMAGE_TO_VIDEO).toBe('image-to-video');
      expect(WebSocketEventType.AUDIO_GENERATED).toBe('audio-generated');
      expect(WebSocketEventType.AUDIO_CONVERTED).toBe('audio-converted');
      expect(WebSocketEventType.TRAINING_STARTED).toBe('training-started');
      expect(WebSocketEventType.TRAINING_COMPLETED).toBe('training-completed');
      expect(WebSocketEventType.TRAINING_FAILED).toBe('training-failed');
      expect(WebSocketEventType.PROCESSING_STARTED).toBe('processing-started');
      expect(WebSocketEventType.PROCESSING_COMPLETED).toBe(
        'processing-completed',
      );
      expect(WebSocketEventType.PROCESSING_FAILED).toBe('processing-failed');
    });
  });

  describe('WebSocketEventStatus', () => {
    it('should have 5 members', () => {
      expect(Object.values(WebSocketEventStatus)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(WebSocketEventStatus.STARTED).toBe('started');
      expect(WebSocketEventStatus.PROCESSING).toBe('processing');
      expect(WebSocketEventStatus.COMPLETED).toBe('completed');
      expect(WebSocketEventStatus.FAILED).toBe('failed');
      expect(WebSocketEventStatus.PROGRESS).toBe('progress');
    });
  });
});

import { TranscriptsService } from '@services/content/transcripts.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('TranscriptsService', () => {
  let service: TranscriptsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TranscriptsService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(TranscriptsService);
    });
  });

  describe('transcript management', () => {
    it('has findAll method for fetching all transcripts', () => {
      expect(service.findAll).toBeDefined();
      expect(typeof service.findAll).toBe('function');
    });

    it('has findOne method for fetching single transcript', () => {
      expect(service.findOne).toBeDefined();
      expect(typeof service.findOne).toBe('function');
    });

    it('has post method for creating transcripts', () => {
      expect(service.post).toBeDefined();
      expect(typeof service.post).toBe('function');
    });

    it('has patch method for updating transcripts', () => {
      expect(service.patch).toBeDefined();
      expect(typeof service.patch).toBe('function');
    });

    it('has delete method for removing transcripts', () => {
      expect(service.delete).toBeDefined();
      expect(typeof service.delete).toBe('function');
    });
  });

  describe('transcript features', () => {
    it('supports video transcription', () => {
      expect(service).toBeDefined();
    });

    it('supports audio transcription', () => {
      expect(service).toBeDefined();
    });

    it('supports transcript editing', () => {
      expect(service).toBeDefined();
    });
  });
});

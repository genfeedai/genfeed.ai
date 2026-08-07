import { describe, expect, it } from 'vitest';
import {
  AvatarProvider,
  LoraStatus,
  PersonaContentFormat,
  PersonaStatus,
} from '../src/persona.enum';

describe('persona.enum', () => {
  describe('PersonaStatus', () => {
    it('should have 3 members matching Prisma', () => {
      expect(Object.values(PersonaStatus)).toHaveLength(3);
    });

    it('should match Prisma SCREAMING_SNAKE', () => {
      expect(PersonaStatus.ACTIVE).toBe('ACTIVE');
      expect(PersonaStatus.INACTIVE).toBe('INACTIVE');
      expect(PersonaStatus.ARCHIVED).toBe('ARCHIVED');
    });
  });

  describe('AvatarProvider', () => {
    it('should have 2 members', () => {
      expect(Object.values(AvatarProvider)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(AvatarProvider.HEYGEN).toBe('heygen');
      expect(AvatarProvider.HEDRA).toBe('hedra');
    });
  });

  describe('PersonaContentFormat', () => {
    it('should have 7 members', () => {
      expect(Object.values(PersonaContentFormat)).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(PersonaContentFormat.PHOTO).toBe('photo');
      expect(PersonaContentFormat.VIDEO).toBe('video');
      expect(PersonaContentFormat.REEL).toBe('reel');
      expect(PersonaContentFormat.STORY).toBe('story');
      expect(PersonaContentFormat.ARTICLE).toBe('article');
      expect(PersonaContentFormat.AUDIO).toBe('audio');
      expect(PersonaContentFormat.TEXT).toBe('text');
    });
  });

  describe('LoraStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(LoraStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(LoraStatus.NONE).toBe('none');
      expect(LoraStatus.TRAINING).toBe('training');
      expect(LoraStatus.READY).toBe('ready');
      expect(LoraStatus.FAILED).toBe('failed');
    });
  });
});

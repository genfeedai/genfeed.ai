import { describe, expect, it } from 'vitest';
import {
  AvatarProvider,
  isPersonaHandle,
  LoraStatus,
  normalizePersonaHandle,
  PERSONA_HANDLE_PATTERN,
  PersonaContentFormat,
  PersonaStatus,
} from '../../src/enums/persona.enum';

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

  describe('character handles', () => {
    it('accepts lowercase URL-safe handles of 2–32 characters', () => {
      expect(isPersonaHandle('an')).toBe(true);
      expect(isPersonaHandle('anna')).toBe(true);
      expect(isPersonaHandle('anna_01')).toBe(true);
      expect(isPersonaHandle('red-jacket')).toBe(true);
      expect(PERSONA_HANDLE_PATTERN.test('a'.repeat(32))).toBe(true);
    });

    it('rejects uppercase, spaces, short, and long handles', () => {
      expect(isPersonaHandle('Anna')).toBe(false);
      expect(isPersonaHandle('a')).toBe(false);
      expect(isPersonaHandle('a'.repeat(33))).toBe(false);
      expect(isPersonaHandle('anna doe')).toBe(false);
      expect(isPersonaHandle('anna@')).toBe(false);
    });

    it('normalizes empty handles to null and lowercases the rest', () => {
      expect(normalizePersonaHandle(undefined)).toBeNull();
      expect(normalizePersonaHandle(null)).toBeNull();
      expect(normalizePersonaHandle('')).toBeNull();
      expect(normalizePersonaHandle('  ')).toBeNull();
      expect(normalizePersonaHandle('Anna')).toBe('anna');
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

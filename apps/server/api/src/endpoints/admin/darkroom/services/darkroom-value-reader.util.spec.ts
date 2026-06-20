import { DarkroomValueReader } from '@api/endpoints/admin/darkroom/services/darkroom-value-reader.util';
import {
  ContentIntelligencePlatform,
  IngredientStatus,
} from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('DarkroomValueReader', () => {
  describe('deriveGenerationJobState', () => {
    // Every (status, stage) input pair the derivation can receive.
    const statuses = [
      IngredientStatus.FAILED,
      IngredientStatus.GENERATED,
      IngredientStatus.PROCESSING,
      IngredientStatus.DRAFT,
      undefined,
      'unexpected-status',
    ];
    const stages = ['queued', 'uploading', 'running on ComfyUI', ''];

    it('returns failed for any FAILED status regardless of stage', () => {
      for (const stage of stages) {
        expect(
          DarkroomValueReader.deriveGenerationJobState(
            IngredientStatus.FAILED,
            stage,
          ),
        ).toBe('failed');
      }
    });

    it('returns completed for any GENERATED status regardless of stage', () => {
      for (const stage of stages) {
        expect(
          DarkroomValueReader.deriveGenerationJobState(
            IngredientStatus.GENERATED,
            stage,
          ),
        ).toBe('completed');
      }
    });

    it('falls back to the stage when status is non-terminal', () => {
      const nonTerminal = statuses.filter(
        (status) =>
          status !== IngredientStatus.FAILED &&
          status !== IngredientStatus.GENERATED,
      );

      for (const status of nonTerminal) {
        expect(
          DarkroomValueReader.deriveGenerationJobState(status, 'queued'),
        ).toBe('queued');
        expect(
          DarkroomValueReader.deriveGenerationJobState(status, 'uploading'),
        ).toBe('uploading');
        expect(
          DarkroomValueReader.deriveGenerationJobState(
            status,
            'running on ComfyUI',
          ),
        ).toBe('processing');
        expect(DarkroomValueReader.deriveGenerationJobState(status, '')).toBe(
          'processing',
        );
      }
    });
  });

  describe('ingredientStatusForJobState', () => {
    it('maps terminal and non-terminal job states to ingredient statuses', () => {
      expect(DarkroomValueReader.ingredientStatusForJobState('failed')).toBe(
        IngredientStatus.FAILED,
      );
      expect(DarkroomValueReader.ingredientStatusForJobState('completed')).toBe(
        IngredientStatus.GENERATED,
      );
      expect(
        DarkroomValueReader.ingredientStatusForJobState('processing'),
      ).toBe(IngredientStatus.PROCESSING);
      expect(DarkroomValueReader.ingredientStatusForJobState('queued')).toBe(
        IngredientStatus.PROCESSING,
      );
      expect(DarkroomValueReader.ingredientStatusForJobState('uploading')).toBe(
        IngredientStatus.PROCESSING,
      );
      expect(DarkroomValueReader.ingredientStatusForJobState(undefined)).toBe(
        IngredientStatus.PROCESSING,
      );
    });
  });

  describe('value coercion helpers', () => {
    it('readString returns the string only when non-empty', () => {
      expect(DarkroomValueReader.readString('hello')).toBe('hello');
      expect(DarkroomValueReader.readString('')).toBeUndefined();
      expect(DarkroomValueReader.readString(42)).toBeUndefined();
      expect(DarkroomValueReader.readString(null)).toBeUndefined();
    });

    it('readNumber returns finite numbers only', () => {
      expect(DarkroomValueReader.readNumber(7)).toBe(7);
      expect(DarkroomValueReader.readNumber(Number.NaN)).toBeUndefined();
      expect(DarkroomValueReader.readNumber('7')).toBeUndefined();
    });

    it('readReferenceId resolves nested id shapes', () => {
      expect(DarkroomValueReader.readReferenceId('abc')).toBe('abc');
      expect(DarkroomValueReader.readReferenceId({ _id: 'nested' })).toBe(
        'nested',
      );
      expect(DarkroomValueReader.readReferenceId({})).toBeUndefined();
    });

    it('readPlatform only accepts known platforms', () => {
      expect(DarkroomValueReader.readPlatform('instagram')).toBe(
        ContentIntelligencePlatform.INSTAGRAM,
      );
      expect(DarkroomValueReader.readPlatform('myspace')).toBeUndefined();
    });
  });

  describe('getDimensionsFromAspectRatio', () => {
    it('returns empty for missing or invalid ratios', () => {
      expect(DarkroomValueReader.getDimensionsFromAspectRatio()).toEqual({});
      expect(DarkroomValueReader.getDimensionsFromAspectRatio('0:0')).toEqual(
        {},
      );
    });

    it('scales the longest edge to 1024', () => {
      expect(DarkroomValueReader.getDimensionsFromAspectRatio('1:1')).toEqual({
        height: 1024,
        width: 1024,
      });
      expect(DarkroomValueReader.getDimensionsFromAspectRatio('16:9')).toEqual({
        height: 576,
        width: 1024,
      });
    });
  });

  describe('getDatasetExtension', () => {
    it('infers the extension from the url and category', () => {
      expect(DarkroomValueReader.getDatasetExtension('a/b.png', 'image')).toBe(
        'png',
      );
      expect(DarkroomValueReader.getDatasetExtension('a/b.webp', 'image')).toBe(
        'webp',
      );
      expect(DarkroomValueReader.getDatasetExtension('a/b.mp4', 'image')).toBe(
        'mp4',
      );
      expect(DarkroomValueReader.getDatasetExtension('a/b', 'video')).toBe(
        'mp4',
      );
      expect(DarkroomValueReader.getDatasetExtension('a/b.jpg', 'image')).toBe(
        'jpg',
      );
    });
  });
});

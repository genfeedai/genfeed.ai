import { AdminFleetValueReader } from '@api/endpoints/admin/fleet/services/fleet-value-reader.util';
import {
  ContentIntelligencePlatform,
  IngredientStatus,
} from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('AdminFleetValueReader', () => {
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
          AdminFleetValueReader.deriveGenerationJobState(
            IngredientStatus.FAILED,
            stage,
          ),
        ).toBe('failed');
      }
    });

    it('returns completed for any GENERATED status regardless of stage', () => {
      for (const stage of stages) {
        expect(
          AdminFleetValueReader.deriveGenerationJobState(
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
          AdminFleetValueReader.deriveGenerationJobState(status, 'queued'),
        ).toBe('queued');
        expect(
          AdminFleetValueReader.deriveGenerationJobState(status, 'uploading'),
        ).toBe('uploading');
        expect(
          AdminFleetValueReader.deriveGenerationJobState(
            status,
            'running on ComfyUI',
          ),
        ).toBe('processing');
        expect(AdminFleetValueReader.deriveGenerationJobState(status, '')).toBe(
          'processing',
        );
      }
    });
  });

  describe('ingredientStatusForJobState', () => {
    it('maps terminal and non-terminal job states to ingredient statuses', () => {
      expect(AdminFleetValueReader.ingredientStatusForJobState('failed')).toBe(
        IngredientStatus.FAILED,
      );
      expect(
        AdminFleetValueReader.ingredientStatusForJobState('completed'),
      ).toBe(IngredientStatus.GENERATED);
      expect(
        AdminFleetValueReader.ingredientStatusForJobState('processing'),
      ).toBe(IngredientStatus.PROCESSING);
      expect(AdminFleetValueReader.ingredientStatusForJobState('queued')).toBe(
        IngredientStatus.PROCESSING,
      );
      expect(
        AdminFleetValueReader.ingredientStatusForJobState('uploading'),
      ).toBe(IngredientStatus.PROCESSING);
      expect(AdminFleetValueReader.ingredientStatusForJobState(undefined)).toBe(
        IngredientStatus.PROCESSING,
      );
    });
  });

  describe('value coercion helpers', () => {
    it('readString returns the string only when non-empty', () => {
      expect(AdminFleetValueReader.readString('hello')).toBe('hello');
      expect(AdminFleetValueReader.readString('')).toBeUndefined();
      expect(AdminFleetValueReader.readString(42)).toBeUndefined();
      expect(AdminFleetValueReader.readString(null)).toBeUndefined();
    });

    it('readNumber returns finite numbers only', () => {
      expect(AdminFleetValueReader.readNumber(7)).toBe(7);
      expect(AdminFleetValueReader.readNumber(Number.NaN)).toBeUndefined();
      expect(AdminFleetValueReader.readNumber('7')).toBeUndefined();
    });

    it('readReferenceId resolves nested id shapes', () => {
      expect(AdminFleetValueReader.readReferenceId('abc')).toBe('abc');
      expect(AdminFleetValueReader.readReferenceId({ id: 'nested' })).toBe(
        'nested',
      );
      expect(AdminFleetValueReader.readReferenceId({})).toBeUndefined();
    });

    it('readPlatform only accepts known platforms', () => {
      expect(AdminFleetValueReader.readPlatform('instagram')).toBe(
        ContentIntelligencePlatform.INSTAGRAM,
      );
      expect(AdminFleetValueReader.readPlatform('myspace')).toBeUndefined();
    });
  });

  describe('getDimensionsFromAspectRatio', () => {
    it('returns empty for missing or invalid ratios', () => {
      expect(AdminFleetValueReader.getDimensionsFromAspectRatio()).toEqual({});
      expect(AdminFleetValueReader.getDimensionsFromAspectRatio('0:0')).toEqual(
        {},
      );
    });

    it('scales the longest edge to 1024', () => {
      expect(AdminFleetValueReader.getDimensionsFromAspectRatio('1:1')).toEqual(
        {
          height: 1024,
          width: 1024,
        },
      );
      expect(
        AdminFleetValueReader.getDimensionsFromAspectRatio('16:9'),
      ).toEqual({
        height: 576,
        width: 1024,
      });
    });
  });

  describe('getDatasetExtension', () => {
    it('infers the extension from the url and category', () => {
      expect(
        AdminFleetValueReader.getDatasetExtension('a/b.png', 'image'),
      ).toBe('png');
      expect(
        AdminFleetValueReader.getDatasetExtension('a/b.webp', 'image'),
      ).toBe('webp');
      expect(
        AdminFleetValueReader.getDatasetExtension('a/b.mp4', 'image'),
      ).toBe('mp4');
      expect(AdminFleetValueReader.getDatasetExtension('a/b', 'video')).toBe(
        'mp4',
      );
      expect(
        AdminFleetValueReader.getDatasetExtension('a/b.jpg', 'image'),
      ).toBe('jpg');
    });
  });
});

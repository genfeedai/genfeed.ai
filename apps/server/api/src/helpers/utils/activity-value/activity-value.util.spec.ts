import {
  buildCompletionValue,
  buildFailureValue,
  parseActivityValue,
} from '@api/helpers/utils/activity-value/activity-value.util';
import { ActivityKey } from '@genfeedai/enums';

describe('ActivityValueUtil', () => {
  describe('buildCompletionValue', () => {
    it('should build completion value with correct fields', () => {
      const result = JSON.parse(
        buildCompletionValue({
          activityKey: ActivityKey.VIDEO_GENERATED,
          ingredientId: 'abc123',
        }),
      );

      expect(result).toEqual({
        ingredientId: 'abc123',
        label: 'Video Generation',
        progress: 100,
        resultId: 'abc123',
        resultType: 'VIDEO',
        type: 'generation',
      });
    });

    it('should merge existing value fields', () => {
      const result = JSON.parse(
        buildCompletionValue({
          activityKey: ActivityKey.IMAGE_GENERATED,
          existingValue: { customField: 'custom', type: 'reframe' },
          ingredientId: 'def456',
        }),
      );

      expect(result.customField).toBe('custom');
      expect(result.type).toBe('reframe');
      expect(result.ingredientId).toBe('def456');
    });

    it('should use default type "generation" when not in existing value', () => {
      const result = JSON.parse(
        buildCompletionValue({
          activityKey: ActivityKey.MUSIC_GENERATED,
          ingredientId: 'ghi789',
        }),
      );

      expect(result.type).toBe('generation');
    });

    it('should set progress to 100', () => {
      const result = JSON.parse(
        buildCompletionValue({
          activityKey: ActivityKey.VIDEO_GENERATED,
          ingredientId: 'test',
        }),
      );

      expect(result.progress).toBe(100);
    });
  });

  describe('buildFailureValue', () => {
    it('should build failure value with error message', () => {
      const result = JSON.parse(
        buildFailureValue({
          activityKey: ActivityKey.VIDEO_FAILED,
          errorMessage: 'GPU timeout',
          ingredientId: 'abc123',
        }),
      );

      expect(result).toEqual({
        error: 'GPU timeout',
        ingredientId: 'abc123',
        label: 'Video Generation',
        type: 'generation',
      });
    });

    it('should use default error message', () => {
      const result = JSON.parse(
        buildFailureValue({
          activityKey: ActivityKey.IMAGE_FAILED,
          ingredientId: 'def456',
        }),
      );

      expect(result.error).toBe('Generation failed');
    });

    it('should merge existing value fields', () => {
      const result = JSON.parse(
        buildFailureValue({
          activityKey: ActivityKey.MUSIC_FAILED,
          existingValue: { customField: 'kept', type: 'remix' },
          ingredientId: 'ghi789',
        }),
      );

      expect(result.customField).toBe('kept');
      expect(result.type).toBe('remix');
    });

    it('should not include progress or resultId', () => {
      const result = JSON.parse(
        buildFailureValue({
          activityKey: ActivityKey.VIDEO_FAILED,
          ingredientId: 'test',
        }),
      );

      expect(result.progress).toBeUndefined();
      expect(result.resultId).toBeUndefined();
    });
  });

  describe('parseActivityValue', () => {
    it('should parse valid JSON string', () => {
      const result = parseActivityValue(
        JSON.stringify({ ingredientId: 'abc', type: 'generation' }),
      );

      expect(result).toEqual({ ingredientId: 'abc', type: 'generation' });
    });

    it('should return object as-is', () => {
      const input = { ingredientId: 'abc', type: 'generation' };
      const result = parseActivityValue(input);

      expect(result).toEqual(input);
    });

    it('should return empty object for non-JSON strings', () => {
      const result = parseActivityValue('abc123');

      expect(result).toEqual({});
    });

    it('should return empty object for undefined', () => {
      const result = parseActivityValue(undefined);

      expect(result).toEqual({});
    });

    it('should handle empty string', () => {
      const result = parseActivityValue('');

      expect(result).toEqual({});
    });
  });
});

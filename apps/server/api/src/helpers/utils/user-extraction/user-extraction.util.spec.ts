import { describe, expect, it } from 'vitest';

import { UserExtractionUtil } from './user-extraction.util';

describe('UserExtractionUtil', () => {
  describe('extractUserIds', () => {
    it('returns empty object when userField is undefined', () => {
      expect(UserExtractionUtil.extractUserIds(undefined)).toEqual({});
    });

    it('extracts dbUserId from a plain string user ID', () => {
      const id = '507f191e810c19729de860ee';
      const result = UserExtractionUtil.extractUserIds(id);
      expect(result.dbUserId).toBe(id);
      expect(result.authProviderUserId).toBe(id);
      expect(result.userId).toBe(id);
      expect(result.userRoom).toBe(`user:${id}`);
    });

    it('extracts dbUserId from a string', () => {
      const oid = '507f191e810c19729de860ee';
      const result = UserExtractionUtil.extractUserIds(oid);
      expect(result.dbUserId).toBe(oid);
      expect(result.userId).toBe(oid);
    });

    it('extracts the canonical id from a populated user document', () => {
      const oid = '507f191e810c19729de860ee';
      const userDoc = { id: oid };
      const result = UserExtractionUtil.extractUserIds(userDoc);
      expect(result.dbUserId).toBe(oid);
      expect(result.authProviderUserId).toBe(oid);
      expect(result.userId).toBe(oid);
      expect(result.userRoom).toBe(`user:${oid}`);
    });

    it('extracts _id when the populated compatibility shape uses it', () => {
      const strId = '507f191e810c19729de860ee';
      const userDoc = { _id: strId };
      const result = UserExtractionUtil.extractUserIds(userDoc);
      expect(result.dbUserId).toBe(strId);
      expect(result.userId).toBe(strId);
    });

    it('does not create a room when a populated document has no id', () => {
      const result = UserExtractionUtil.extractUserIds({});
      expect(result.userRoom).toBeUndefined();
    });

    it('uses one canonical id for queue compatibility and ownership', () => {
      const oid = '507f191e810c19729de860ee';
      const result = UserExtractionUtil.extractUserIds({ id: oid });
      expect(result.authProviderUserId).toBe(oid);
      expect(result.userId).toBe(oid);
    });
  });

  describe('extractBrandId', () => {
    it('returns undefined when brandField is undefined', () => {
      expect(UserExtractionUtil.extractBrandId(undefined)).toBeUndefined();
    });

    it('returns the string as-is when brandField is a string', () => {
      const id = '507f191e810c19729de860ee';
      expect(UserExtractionUtil.extractBrandId(id)).toBe(id);
    });

    it('returns hex string when brandField is a string', () => {
      const oid = '507f191e810c19729de860ee';
      expect(UserExtractionUtil.extractBrandId(oid)).toBe(oid);
    });

    it('extracts id from populated brand document (ObjectId)', () => {
      const oid = '507f191e810c19729de860ee';
      expect(UserExtractionUtil.extractBrandId({ id: oid })).toBe(oid);
    });

    it('extracts id from populated brand document (string)', () => {
      const strId = '507f191e810c19729de860ee';
      expect(UserExtractionUtil.extractBrandId({ id: strId })).toBe(strId);
    });

    it('returns undefined when brand document has no _id', () => {
      expect(UserExtractionUtil.extractBrandId({})).toBeUndefined();
    });
  });
});

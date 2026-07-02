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
      expect(result.authProviderUserId).toBeUndefined();
      expect(result.userId).toBe(id);
    });

    it('extracts dbUserId from a string', () => {
      const oid = '507f191e810c19729de860ee';
      const result = UserExtractionUtil.extractUserIds(oid);
      expect(result.dbUserId).toBe(oid);
      expect(result.userId).toBe(oid);
    });

    it('extracts id and authProviderId from a populated user document', () => {
      const oid = '507f191e810c19729de860ee';
      const userDoc = { id: oid, authProviderId: 'authProvider_abc123' };
      const result = UserExtractionUtil.extractUserIds(userDoc);
      expect(result.dbUserId).toBe(oid);
      expect(result.authProviderUserId).toBe('authProvider_abc123');
      expect(result.userId).toBe('authProvider_abc123');
      expect(result.userRoom).toBe('user:authProvider_abc123');
    });

    it('extracts string id from a populated user document', () => {
      const strId = '507f191e810c19729de860ee';
      const userDoc = { id: strId, authProviderId: 'authProvider_xyz' };
      const result = UserExtractionUtil.extractUserIds(userDoc);
      expect(result.dbUserId).toBe(strId);
      expect(result.authProviderUserId).toBe('authProvider_xyz');
    });

    it('sets userRoom only when authProviderUserId is present', () => {
      const oid = '507f191e810c19729de860ee';
      const userDoc = { id: oid, authProviderId: undefined };
      const result = UserExtractionUtil.extractUserIds(userDoc);
      expect(result.userRoom).toBeUndefined();
    });

    it('prefers authProviderUserId as userId over dbUserId', () => {
      const oid = '507f191e810c19729de860ee';
      const userDoc = { id: oid, authProviderId: 'authProvider_preferred' };
      const result = UserExtractionUtil.extractUserIds(userDoc);
      expect(result.userId).toBe('authProvider_preferred');
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

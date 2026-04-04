import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { UserExtractionUtil } from './user-extraction.util';

describe('UserExtractionUtil', () => {
  describe('extractUserIds', () => {
    it('returns empty object when userField is undefined', () => {
      expect(UserExtractionUtil.extractUserIds(undefined)).toEqual({});
    });

    it('extracts dbUserId from a plain string user ID', () => {
      const id = new Types.ObjectId().toHexString();
      const result = UserExtractionUtil.extractUserIds(id);
      expect(result.dbUserId).toBe(id);
      expect(result.clerkUserId).toBeUndefined();
      expect(result.userId).toBe(id);
    });

    it('extracts dbUserId from a Types.ObjectId', () => {
      const oid = new Types.ObjectId();
      const result = UserExtractionUtil.extractUserIds(oid);
      expect(result.dbUserId).toBe(oid.toHexString());
      expect(result.userId).toBe(oid.toHexString());
    });

    it('extracts _id and clerkId from a populated user document', () => {
      const oid = new Types.ObjectId();
      const userDoc = { _id: oid, clerkId: 'clerk_abc123' };
      const result = UserExtractionUtil.extractUserIds(userDoc);
      expect(result.dbUserId).toBe(oid.toHexString());
      expect(result.clerkUserId).toBe('clerk_abc123');
      expect(result.userId).toBe('clerk_abc123');
      expect(result.userRoom).toBe('user-clerk_abc123');
    });

    it('extracts string _id from a populated user document', () => {
      const strId = new Types.ObjectId().toHexString();
      const userDoc = { _id: strId, clerkId: 'clerk_xyz' };
      const result = UserExtractionUtil.extractUserIds(userDoc);
      expect(result.dbUserId).toBe(strId);
      expect(result.clerkUserId).toBe('clerk_xyz');
    });

    it('sets userRoom only when clerkUserId is present', () => {
      const oid = new Types.ObjectId();
      const userDoc = { _id: oid, clerkId: undefined };
      const result = UserExtractionUtil.extractUserIds(userDoc);
      expect(result.userRoom).toBeUndefined();
    });

    it('prefers clerkUserId as userId over dbUserId', () => {
      const oid = new Types.ObjectId();
      const userDoc = { _id: oid, clerkId: 'clerk_preferred' };
      const result = UserExtractionUtil.extractUserIds(userDoc);
      expect(result.userId).toBe('clerk_preferred');
    });
  });

  describe('extractBrandId', () => {
    it('returns undefined when brandField is undefined', () => {
      expect(UserExtractionUtil.extractBrandId(undefined)).toBeUndefined();
    });

    it('returns the string as-is when brandField is a string', () => {
      const id = new Types.ObjectId().toHexString();
      expect(UserExtractionUtil.extractBrandId(id)).toBe(id);
    });

    it('returns hex string when brandField is a Types.ObjectId', () => {
      const oid = new Types.ObjectId();
      expect(UserExtractionUtil.extractBrandId(oid)).toBe(oid.toHexString());
    });

    it('extracts _id from populated brand document (ObjectId)', () => {
      const oid = new Types.ObjectId();
      expect(UserExtractionUtil.extractBrandId({ _id: oid })).toBe(
        oid.toHexString(),
      );
    });

    it('extracts _id from populated brand document (string)', () => {
      const strId = new Types.ObjectId().toHexString();
      expect(UserExtractionUtil.extractBrandId({ _id: strId })).toBe(strId);
    });

    it('returns undefined when brand document has no _id', () => {
      expect(UserExtractionUtil.extractBrandId({})).toBeUndefined();
    });
  });
});

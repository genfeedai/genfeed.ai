import {
  buildResourcePath,
  ensureLeadingSlash,
  joinUrlPaths,
  removeTrailingSlash,
} from '@helpers/formatting/url/url.helper';
import { describe, expect, it } from 'vitest';

describe('url.helper', () => {
  describe('ensureLeadingSlash', () => {
    it('returns "/" for empty string', () => {
      expect(ensureLeadingSlash('')).toBe('/');
    });

    it('adds leading slash when missing', () => {
      expect(ensureLeadingSlash('path')).toBe('/path');
      expect(ensureLeadingSlash('foo/bar')).toBe('/foo/bar');
    });

    it('does not duplicate leading slash', () => {
      expect(ensureLeadingSlash('/path')).toBe('/path');
      expect(ensureLeadingSlash('/foo/bar')).toBe('/foo/bar');
    });
  });

  describe('removeTrailingSlash', () => {
    it('returns empty string for empty input', () => {
      expect(removeTrailingSlash('')).toBe('');
    });

    it('returns empty string for single slash', () => {
      expect(removeTrailingSlash('/')).toBe('');
    });

    it('removes trailing slash', () => {
      expect(removeTrailingSlash('/path/')).toBe('/path');
      expect(removeTrailingSlash('foo/')).toBe('foo');
    });

    it('does not modify path without trailing slash', () => {
      expect(removeTrailingSlash('/path')).toBe('/path');
      expect(removeTrailingSlash('foo')).toBe('foo');
    });
  });

  describe('joinUrlPaths', () => {
    it('joins two segments', () => {
      expect(joinUrlPaths('/api', 'users')).toBe('/api/users');
    });

    it('joins multiple segments', () => {
      expect(joinUrlPaths('/api', 'v1', 'users')).toBe('/api/v1/users');
    });

    it('handles segments with leading/trailing slashes', () => {
      expect(joinUrlPaths('/api/', '/users/')).toBe('/api/users/');
    });

    it('removes duplicate slashes', () => {
      expect(joinUrlPaths('/api//', '//users')).toBe('/api/users');
    });

    it('filters empty segments', () => {
      expect(joinUrlPaths('/api', '', 'users')).toBe('/api/users');
    });

    it('handles single segment', () => {
      expect(joinUrlPaths('/api')).toBe('/api');
    });
  });

  describe('buildResourcePath', () => {
    it('returns "/" when no arguments', () => {
      expect(buildResourcePath()).toBe('/');
    });

    it('returns path with leading slash for resourceId only', () => {
      expect(buildResourcePath('123')).toBe('/123');
    });

    it('returns path with resourceId already having leading slash', () => {
      expect(buildResourcePath('/123')).toBe('/123');
    });

    it('joins resourceId and action', () => {
      expect(buildResourcePath('123', 'edit')).toBe('/123/edit');
    });

    it('handles undefined resourceId with action', () => {
      expect(buildResourcePath(undefined, 'edit')).toBe('edit');
    });
  });
});

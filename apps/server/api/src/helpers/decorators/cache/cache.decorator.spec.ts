import { CacheKeyGenerator } from '@api/helpers/decorators/cache/cache.decorator';
import { AssetScope } from '@genfeedai/enums';

describe('CacheKeyGenerator', () => {
  describe('userScoped', () => {
    it('should generate user-scoped cache key', () => {
      const userId = '507f1f77bcf86cd799439011';
      const result = CacheKeyGenerator.userScoped(userId, 'profile');

      expect(result).toBe('user:507f1f77bcf86cd799439011:profile');
    });

    it('should generate key with multiple parts', () => {
      const userId = '507f1f77bcf86cd799439011';
      const result = CacheKeyGenerator.userScoped(
        userId,
        'videos',
        'favorites',
        'list',
      );

      expect(result).toBe(
        'user:507f1f77bcf86cd799439011:videos:favorites:list',
      );
    });

    it('should generate key with no additional parts', () => {
      const userId = '507f1f77bcf86cd799439011';
      const result = CacheKeyGenerator.userScoped(userId);

      expect(result).toBe('user:507f1f77bcf86cd799439011:');
    });
  });

  describe('brandScoped', () => {
    it('should generate brand-scoped cache key', () => {
      const brandId = '507f1f77bcf86cd799439012';
      const result = CacheKeyGenerator.brandScoped(brandId, 'posts');

      expect(result).toBe('brand:507f1f77bcf86cd799439012:posts');
    });

    it('should generate key with multiple parts', () => {
      const brandId = '507f1f77bcf86cd799439012';
      const result = CacheKeyGenerator.brandScoped(
        brandId,
        'posts',
        'scheduled',
      );

      expect(result).toBe('brand:507f1f77bcf86cd799439012:posts:scheduled');
    });
  });

  describe('organizationScoped', () => {
    it('should generate organization-scoped cache key', () => {
      const orgId = '507f1f77bcf86cd799439013';
      const result = CacheKeyGenerator.organizationScoped(orgId, 'members');

      expect(result).toBe('org:507f1f77bcf86cd799439013:members');
    });

    it('should generate key with multiple parts', () => {
      const orgId = '507f1f77bcf86cd799439013';
      const result = CacheKeyGenerator.organizationScoped(
        orgId,
        'settings',
        'billing',
        'current',
      );

      expect(result).toBe(
        'org:507f1f77bcf86cd799439013:settings:billing:current',
      );
    });
  });

  describe('paginated', () => {
    it('should generate paginated cache key without filters', () => {
      const result = CacheKeyGenerator.paginated('users:list', 1, 10);

      expect(result).toBe('users:list:page:1:limit:10:filters:');
    });

    it('should generate paginated cache key with filters', () => {
      const filters = { role: 'admin', status: 'active' };
      const result = CacheKeyGenerator.paginated('users:list', 2, 20, filters);

      expect(result).toContain('users:list:page:2:limit:20:filters:');
      expect(result).toContain('role:admin');
      expect(result).toContain('status:active');
    });

    it('should sort filter keys for consistent cache keys', () => {
      const filters1 = { role: 'admin', status: 'active' };
      const filters2 = { role: 'admin', status: 'active' };

      const result1 = CacheKeyGenerator.paginated(
        'users:list',
        1,
        10,
        filters1,
      );
      const result2 = CacheKeyGenerator.paginated(
        'users:list',
        1,
        10,
        filters2,
      );

      expect(result1).toBe(result2);
    });

    it('should handle complex filter values', () => {
      const filters = {
        category: 'video',
        scope: AssetScope.PUBLIC,
        search: 'test query',
      };
      const result = CacheKeyGenerator.paginated(
        'content:list',
        3,
        30,
        filters,
      );

      expect(result).toContain('category:video');
      expect(result).toContain('scope:public');
      expect(result).toContain('search:test query');
    });

    it('should handle different page and limit combinations', () => {
      const result1 = CacheKeyGenerator.paginated('items', 1, 10);
      const result2 = CacheKeyGenerator.paginated('items', 2, 10);
      const result3 = CacheKeyGenerator.paginated('items', 1, 20);

      expect(result1).not.toBe(result2);
      expect(result1).not.toBe(result3);
      expect(result2).not.toBe(result3);
    });

    it('should handle empty filters object', () => {
      const result = CacheKeyGenerator.paginated('items', 1, 10, {});

      expect(result).toBe('items:page:1:limit:10:filters:');
    });
  });
});

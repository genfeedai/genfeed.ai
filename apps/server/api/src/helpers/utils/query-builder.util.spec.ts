import { QueryBuilder } from '@api/helpers/utils/query-builder.util';

describe('QueryBuilderUtil', () => {
  it('sets organizationId as a plain string', () => {
    const organizationId = 'org_abc123';

    const query = new QueryBuilder(organizationId).build();

    expect(query.organizationId).toBe(organizationId);
    expect(query.isDeleted).toBe(false);
  });

  it('passes filter values through without ObjectId conversion', () => {
    const organizationId = 'org_abc123';
    const userId = 'user_xyz789';

    const query = new QueryBuilder(organizationId)
      .addFilter('userId', userId)
      .build();

    expect(query.organizationId).toBe(organizationId);
    expect(query.userId).toBe(userId);
  });

  it('builds Prisma-style `in` filters', () => {
    const id1 = 'id_one';
    const id2 = 'id_two';

    const query = new QueryBuilder()
      .addInFilter('categoryId', [id1, id2])
      .build();

    const filter = query.categoryId as { in: unknown[] };
    expect(filter.in).toHaveLength(2);
    expect(filter.in[0]).toBe(id1);
    expect(filter.in[1]).toBe(id2);
  });

  it('leaves non-id fields unchanged', () => {
    const query = new QueryBuilder().addFilter('status', 'active').build();

    expect(query.status).toBe('active');
  });

  it('sets isDeleted: false by default', () => {
    const query = new QueryBuilder().build();

    expect(query.isDeleted).toBe(false);
  });

  it('builds a text search filter with contains + insensitive mode', () => {
    const query = new QueryBuilder().addTextSearch('hello', 'title').build();

    expect(query.title).toEqual({ contains: 'hello', mode: 'insensitive' });
  });

  it('builds a date range filter with Prisma gte/lte syntax', () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-12-31');

    const query = new QueryBuilder()
      .addDateRange('createdAt', start, end)
      .build();

    expect(query.createdAt).toEqual({ gte: start, lte: end });
  });

  it('does not add organizationId filter when not provided', () => {
    const query = new QueryBuilder().build();

    expect(query).not.toHaveProperty('organizationId');
  });

  it('clone() produces an independent copy', () => {
    const original = new QueryBuilder('org_123').addFilter('status', 'active');
    const cloned = original.clone();
    cloned.addFilter('type', 'post');

    expect(original.build()).not.toHaveProperty('type');
    expect(cloned.build()).toHaveProperty('type');
  });

  it('reset() restores base state while preserving organizationId', () => {
    const builder = new QueryBuilder('org_abc')
      .addFilter('status', 'active')
      .reset();

    const query = builder.build();
    expect(query.organizationId).toBe('org_abc');
    expect(query.isDeleted).toBe(false);
    expect(query).not.toHaveProperty('status');
  });
});

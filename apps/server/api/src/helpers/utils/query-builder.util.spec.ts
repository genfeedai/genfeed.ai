import { QueryBuilder } from '@api/helpers/utils/query-builder.util';
import { Types } from 'mongoose';

describe('QueryBuilderUtil', () => {
  it('casts organization and user filters to ObjectId values', () => {
    const organizationId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();

    const query = new QueryBuilder(organizationId)
      .addFilter('user', userId)
      .build();

    expect(query.organization).toBeInstanceOf(Types.ObjectId);
    expect(query.user).toBeInstanceOf(Types.ObjectId);
    expect(String(query.organization)).toBe(organizationId);
    expect(String(query.user)).toBe(userId);
  });

  it('casts ObjectId values inside $in filters', () => {
    const roomId = new Types.ObjectId().toString();
    const secondRoomId = new Types.ObjectId().toString();

    const query = new QueryBuilder()
      .addInFilter('room', [roomId, secondRoomId])
      .build();

    const values = (query.room as { $in: unknown[] }).$in;
    expect(values).toHaveLength(2);
    expect(values[0]).toBeInstanceOf(Types.ObjectId);
    expect(values[1]).toBeInstanceOf(Types.ObjectId);
    expect(String(values[0])).toBe(roomId);
    expect(String(values[1])).toBe(secondRoomId);
  });

  it('leaves non ObjectId fields unchanged', () => {
    const query = new QueryBuilder().addFilter('status', 'active').build();

    expect(query.status).toBe('active');
  });
});

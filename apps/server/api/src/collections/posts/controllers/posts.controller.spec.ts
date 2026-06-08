import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import type { User } from '@clerk/backend';
import type { PostsQueryDto } from '../dto/posts-query.dto';

const makeUser = (overrides: Partial<User['publicMetadata']> = {}): User =>
  ({
    publicMetadata: {
      organization: 'org-1',
      brand: 'brand-1',
      user: 'user-1',
      role: 'member',
      ...overrides,
    },
  }) as unknown as User;

describe('PostsController.buildFindAllQuery', () => {
  let controller: PostsController;

  beforeEach(() => {
    // Minimal stub — only buildFindAllQuery is under test here
    controller = {
      buildFindAllQuery: PostsController.prototype.buildFindAllQuery,
    } as unknown as PostsController;
  });

  it('uses parentId (scalar FK) not parent (relation alias) in OR filter', () => {
    const query: PostsQueryDto = {} as PostsQueryDto;
    const result = controller.buildFindAllQuery(makeUser(), query);

    const orFilter = (result.where as Record<string, unknown>).OR as Record<
      string,
      unknown
    >[];

    expect(orFilter).toBeDefined();

    const keys = orFilter.flatMap((branch) => Object.keys(branch));
    expect(keys).not.toContain('parent');
    expect(keys.filter((k) => k === 'parentId').length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('includes { parentId: null } branch for top-level posts', () => {
    const query: PostsQueryDto = {} as PostsQueryDto;
    const result = controller.buildFindAllQuery(makeUser(), query);

    const orFilter = (result.where as Record<string, unknown>).OR as Record<
      string,
      unknown
    >[];

    expect(orFilter).toContainEqual({ parentId: null });
  });

  it('includes { parentId: { not: null } } branch (has parent)', () => {
    const query: PostsQueryDto = {} as PostsQueryDto;
    const result = controller.buildFindAllQuery(makeUser(), query);

    const orFilter = (result.where as Record<string, unknown>).OR as Record<
      string,
      unknown
    >[];

    expect(orFilter).toContainEqual({ parentId: { not: null } });
  });
});

import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { buildUpdateOperations } from '@api/helpers/utils/objectid/update-operations.util';

describe('buildUpdateOperations', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('converts relationship fields into plain Prisma update data', async () => {
    const folderId = '507f191e810c19729de860ee';
    const spy = vi
      .spyOn(ObjectIdUtil, 'convertRelationshipField')
      .mockResolvedValue(folderId);

    const result = await buildUpdateOperations(
      { folder: 'raw-folder', label: 'Sample' },
      ['folder'],
    );

    expect(spy).toHaveBeenCalledWith('raw-folder', 'folder');
    expect(result).toEqual({
      folder: folderId,
      label: 'Sample',
    });
  });

  it('keeps null relationship values as null updates', async () => {
    vi.spyOn(ObjectIdUtil, 'convertRelationshipField')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('507f191e810c19729de860ee');

    const result = await buildUpdateOperations(
      { folder: 'to-keep', parent: null },
      ['parent', 'folder'],
    );

    expect(result).toEqual({
      folder: expect.any(String),
      parent: null,
    });
  });

  it('returns null fields when no relationship value remains', async () => {
    vi.spyOn(ObjectIdUtil, 'convertRelationshipField').mockResolvedValue(null);

    const result = await buildUpdateOperations({ parent: null }, ['parent']);

    expect(result).toEqual({ parent: null });
  });
});

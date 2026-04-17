import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { buildUpdateOperations } from '@api/helpers/utils/objectid/update-operations.util';

describe('buildUpdateOperations', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('converts relationship fields into $set entries', async () => {
    const folderId = '507f191e810c19729de860ee';
    const spy = vi
      .spyOn(ObjectIdUtil, 'convertRelationshipField')
      .mockResolvedValue(folderId);

    const result = await buildUpdateOperations(
      { folder: 'raw-folder', label: 'Sample' },
      ['folder'],
    );

    expect(spy).toHaveBeenCalledWith('raw-folder', 'folder');
    expect(result.$set).toEqual({
      folder: folderId,
      label: 'Sample',
    });
    expect(result.$unset).toBeUndefined();
  });

  it('moves null relationship values into $unset', async () => {
    vi.spyOn(ObjectIdUtil, 'convertRelationshipField')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('507f191e810c19729de860ee');

    const result = await buildUpdateOperations(
      { folder: 'to-keep', parent: null },
      ['parent', 'folder'],
    );

    expect(result.$set).toEqual({
      folder: expect.any(Types.ObjectId),
    });
    expect(result.$unset).toEqual({ parent: '' });
  });

  it('omits $set or $unset when no fields remain', async () => {
    vi.spyOn(ObjectIdUtil, 'convertRelationshipField').mockResolvedValue(null);

    const result = await buildUpdateOperations({ parent: null }, ['parent']);

    expect(result.$set).toBeUndefined();
    expect(result.$unset).toEqual({ parent: '' });
  });
});

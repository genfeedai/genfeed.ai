import { GenerateClipsDto } from '@api/collections/clipper-projects/dto/generate-clips.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const base = {
  editedHighlights: [{ id: 'h1', summary: 'Summary', title: 'Title' }],
  selectedHighlightIds: ['h1'],
};

async function errorsFor(extra: object) {
  return (
    await validate(plainToInstance(GenerateClipsDto, { ...base, ...extra }))
  ).map((error) => error.property);
}

describe('GenerateClipsDto avatarQuality', () => {
  it.each([undefined, 'draft', 'low', 'medium', 'high'])(
    'accepts %s',
    async (avatarQuality) => {
      expect(await errorsFor({ avatarQuality })).toEqual([]);
    },
  );

  it.each(['ultra', 'LOW', '2k', 1])('rejects %j', async (avatarQuality) => {
    expect(await errorsFor({ avatarQuality })).toEqual(['avatarQuality']);
  });
});

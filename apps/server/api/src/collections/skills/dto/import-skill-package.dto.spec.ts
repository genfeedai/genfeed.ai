import { ImportSkillPackageDto } from '@api/collections/skills/dto/import-skill-package.dto';
import { parseSkillPackageManifest } from '@api/collections/skills/utils/skill-package-manifest.util';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';

function request() {
  return {
    slug: 'Example-Skill',
    package: {
      format: 'files',
      files: [
        {
          path: 'SKILL.md',
          content: '---\nname: Example\ndescription: Useful\n---\nInstructions',
        },
      ],
    },
  };
}
const pipe = new ValidationPipe();
function transform(value: unknown) {
  return pipe.transform(value, {
    metatype: ImportSkillPackageDto,
    type: 'body',
  });
}
describe('ImportSkillPackageDto through the actual ValidationPipe', () => {
  it('accepts file and ZIP envelopes without coercing request strings', async () => {
    await expect(transform(request())).resolves.toMatchObject(request());
    await expect(
      transform({
        slug: 'example',
        package: { format: 'zip', archiveBase64: 'UEs=' },
      }),
    ).resolves.toMatchObject({
      package: { format: 'zip', archiveBase64: 'UEs=' },
    });
  });
  it.each([
    { ...request(), ownerId: 'trusted' },
    { ...request(), sourceUrl: null },
    { ...request(), expectedPackageChecksum: null },
    { ...request(), slug: 1 },
    { ...request(), slug: ' bad' },
    { ...request(), slug: 'x'.repeat(161) },
    {
      ...request(),
      package: { format: 'zip', archiveBase64: 'UEs=', files: [] },
    },
    {
      ...request(),
      package: { format: 'files', files: [], archiveBase64: 'UEs=' },
    },
    { ...request(), package: { format: 'directory', files: [] } },
    { ...request(), package: { format: 'files', files: null } },
    {
      ...request(),
      package: {
        format: 'files',
        files: [{ path: 'SKILL.md', content: 'x', ownerId: 'trusted' }],
      },
    },
    { ...request(), package: { format: 'zip', archiveBase64: null } },
    {
      ...request(),
      package: { format: 'zip', archiveBase64: 'A'.repeat(1_333_337) },
    },
    {
      ...request(),
      package: {
        format: 'files',
        files: Array.from({ length: 129 }, () => ({
          path: 'a.md',
          content: '',
        })),
      },
    },
    { ...request(), sourceUrl: 'file:///etc' },
    { ...request(), expectedPackageChecksum: 'g'.repeat(64) },
  ])('rejects malformed, mixed and unknown fields with 400', async (input) => {
    await expect(transform(input)).rejects.toMatchObject({ status: 400 });
  });
  it('rejects source provenance containing dummy user information with 400', async () => {
    const sourceUrl = new URL('https://example.test');
    sourceUrl.username = 'fixture-user';
    sourceUrl.password = 'fixture-password';
    expect(sourceUrl.username).toBe('fixture-user');
    expect(sourceUrl.password).toBe('fixture-password');
    await expect(
      transform({ ...request(), sourceUrl: sourceUrl.toString() }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rejects raw prototype-related unknown keys before class-transformer can drop them', async () => {
    const top = JSON.parse(
      JSON.stringify(request()).replace(
        '"slug"',
        '"constructor": "trusted", "slug"',
      ),
    ) as unknown;
    const nested = JSON.parse(
      JSON.stringify(request()).replace(
        '"format"',
        '"__proto__": {"trusted":true}, "format"',
      ),
    ) as unknown;
    const file = JSON.parse(
      JSON.stringify(request()).replace(
        '"path"',
        '"constructor": "trusted", "path"',
      ),
    ) as unknown;
    for (const input of [top, nested, file])
      await expect(transform(input)).rejects.toMatchObject({ status: 400 });
  });
  it('passes the transformed DTO into the defensive parser without undefined optionals changing semantics', async () => {
    const dto = await transform(request());
    expect(parseSkillPackageManifest(dto).slug).toBe('example-skill');
  });
  it('enforces byte bounds and canonical encoding through the actual pipe', async () => {
    await expect(
      transform({
        slug: 'skill',
        package: {
          format: 'files',
          files: [{ path: 'SKILL.md', content: '😀'.repeat(32_001) }],
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
    for (const archiveBase64 of [
      'AB==',
      Buffer.alloc(1_000_001).toString('base64'),
    ]) {
      await expect(
        transform({ slug: 'skill', package: { format: 'zip', archiveBase64 } }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });
});

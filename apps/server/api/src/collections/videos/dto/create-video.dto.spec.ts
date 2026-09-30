import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import type { ArgumentMetadata } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

function entityId(index: number): string {
  return `c${String(index).padStart(8, '0')}`;
}

const metadata: ArgumentMetadata = { metatype: CreateVideoDto, type: 'body' };

async function resolvedRequest(pipe: ValidationPipe, value: object) {
  return (await pipe.transform(value, metadata)) as Record<string, unknown>;
}

async function referencesErrorsFor(referenceCount: number) {
  const dto = plainToInstance(CreateVideoDto, {
    references: Array.from({ length: referenceCount }, (_, i) => entityId(i)),
  });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'references');
}

describe('CreateVideoDto', () => {
  it('should be defined', () => {
    expect(CreateVideoDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateVideoDto();
      expect(dto).toBeInstanceOf(CreateVideoDto);
    });

    it('accepts a references array at the maximum size', async () => {
      expect(await referencesErrorsFor(10)).toEqual([]);
    });

    it('rejects a references array over the maximum size', async () => {
      const referencesErrors = await referencesErrorsFor(11);

      expect(referencesErrors).toHaveLength(1);
      expect(referencesErrors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });
  });

  // Background music is a Studio editor concern now — generation only
  // generates the video (#4683). `CreateVideoDto` does NOT opt into
  // `FORBID_NON_WHITELISTED`: the pipe's default `whitelist: true` already
  // strips any undeclared property before validation runs, and real callers
  // (Studio's generation payload, the MCP `createVideo` tool) routinely send
  // other undeclared fields that have always been dropped this way. Forbidding
  // non-whitelisted properties would turn every one of those into a hard 400.
  describe('background music removed from generation', () => {
    const pipe = new ValidationPipe();

    it('silently strips backgroundMusic instead of erroring', async () => {
      const resolved = await resolvedRequest(pipe, {
        backgroundMusic: { ingredientId: entityId(1) },
        text: 'a video',
      });

      expect(resolved).not.toHaveProperty('backgroundMusic');
      expect(resolved.text).toBe('a video');
    });

    it('silently strips musicVolume instead of erroring', async () => {
      const resolved = await resolvedRequest(pipe, {
        musicVolume: 50,
        text: 'a video',
      });

      expect(resolved).not.toHaveProperty('musicVolume');
      expect(resolved.text).toBe('a video');
    });

    it('silently strips muteVideoAudio instead of erroring', async () => {
      const resolved = await resolvedRequest(pipe, {
        muteVideoAudio: true,
        text: 'a video',
      });

      expect(resolved).not.toHaveProperty('muteVideoAudio');
      expect(resolved.text).toBe('a video');
    });

    it('no longer types backgroundMusic, musicVolume, or muteVideoAudio on the DTO', () => {
      const dto: Partial<CreateVideoDto> = {
        // @ts-expect-error backgroundMusic/musicVolume/muteVideoAudio were removed from CreateVideoDto (#4683) — excess-property checking reports the whole literal as one diagnostic, anchored on this first excess key.
        backgroundMusic: { ingredientId: entityId(1) },
        musicVolume: 50,
        muteVideoAudio: true,
      };

      expect(dto).toBeDefined();
    });
  });

  // #4702 review: a strict `FORBID_NON_WHITELISTED` flag broke every real
  // caller, because Studio and the MCP tool both send fields this DTO has
  // never declared — they were always silently dropped, request and all.
  describe('tolerates undeclared fields real callers already send', () => {
    const pipe = new ValidationPipe();

    it('accepts a Studio-shaped payload (brand/folder are not DTO fields)', async () => {
      const resolved = await resolvedRequest(pipe, {
        autoSelectModel: false,
        blacklist: ['logo'],
        brand: entityId(1),
        brandingMode: 'brand',
        cameraMovement: 'dolly-in',
        duration: 8,
        folder: entityId(2),
        format: 'portrait',
        height: 1920,
        isAudioEnabled: true,
        isBrandingEnabled: true,
        model: 'google/veo-3',
        outputs: 1,
        references: [],
        tags: [entityId(3)],
        text: 'a product ad',
        useTemplate: true,
        width: 1080,
      });

      expect(resolved).not.toHaveProperty('brand');
      expect(resolved).not.toHaveProperty('folder');
      expect(resolved).toMatchObject({
        blacklist: ['logo'],
        duration: 8,
        model: 'google/veo-3',
        tags: [entityId(3)],
        text: 'a product ad',
        width: 1080,
      });
    });

    it('accepts an MCP-shaped payload (prompt/title/voiceOver are not DTO fields)', async () => {
      const resolved = await resolvedRequest(pipe, {
        duration: 10,
        height: 1080,
        model: 'google/veo-2',
        prompt: 'A calm mountain lake at sunrise',
        style: 'cinematic',
        text: 'A calm mountain lake at sunrise',
        title: 'Mountain lake',
        voiceOver: { enabled: true, script: 'Welcome' },
        width: 1920,
      });

      expect(resolved).not.toHaveProperty('prompt');
      expect(resolved).not.toHaveProperty('title');
      expect(resolved).not.toHaveProperty('voiceOver');
      expect(resolved).toMatchObject({
        duration: 10,
        height: 1080,
        model: 'google/veo-2',
        style: 'cinematic',
        text: 'A calm mountain lake at sunrise',
        width: 1920,
      });
    });
  });
});

import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import {
  PostFormat,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';

describe('CreatePostDto', () => {
  const validEntityId = 'ckz1234567890abcdefghi';

  it('should be defined', () => {
    expect(CreatePostDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreatePostDto();
      expect(dto).toBeInstanceOf(CreatePostDto);
    });

    it('accepts publish attribution and experiment metadata', async () => {
      const dto = Object.assign(new CreatePostDto(), {
        campaignId: validEntityId,
        contentRunId: validEntityId,
        creativeVersion: 'creative-v2',
        credentialId: validEntityId,
        description: 'Caption',
        hookVersion: 'hook-v1',
        ingredients: [],
        label: 'Post',
        personaId: 'ckz1234567890abcdefgij',
        publishIntent: 'experiment',
        scheduleSlot: 'weekday-morning',
        targetExecutionState: TargetExecutionState.SCHEDULED,
        variantId: 'trend-remix-post-thread',
        visibility: PostVisibility.PRIVATE,
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('accepts canonical scalar IDs and public relation ID arrays', async () => {
      const dto = Object.assign(new CreatePostDto(), {
        credentialId: validEntityId,
        description: 'Thread reply',
        ingredients: ['ckz1234567890abcdefgij'],
        label: 'Post',
        parentId: 'ckz1234567890abcdefgik',
        targetExecutionState: TargetExecutionState.SCHEDULED,
        tags: ['ckz1234567890abcdefgil'],
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('accepts first-class long-form and thread formats', async () => {
      for (const format of [PostFormat.LONG_FORM, PostFormat.THREAD]) {
        const dto = Object.assign(new CreatePostDto(), {
          credentialId: validEntityId,
          description: 'X content',
          format,
          ingredients: [],
          label: 'Post',
          targetExecutionState: TargetExecutionState.DRAFT,
        });

        expect(await validate(dto)).toHaveLength(0);
      }
    });

    it('rejects unsupported post formats', async () => {
      const dto = Object.assign(new CreatePostDto(), {
        credentialId: validEntityId,
        description: 'X content',
        format: 'carousel',
        ingredients: [],
        label: 'Post',
        targetExecutionState: TargetExecutionState.DRAFT,
      });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'format')).toBe(true);
    });

    it('rejects Mongo-era relation aliases', async () => {
      const dto = Object.assign(new CreatePostDto(), {
        credential: validEntityId,
        credentialId: validEntityId,
        description: 'Thread reply',
        ingredients: [],
        label: 'Post',
        parent: 'ckz1234567890abcdefgik',
        targetExecutionState: TargetExecutionState.DRAFT,
      });

      const errors = await validate(dto, {
        forbidNonWhitelisted: true,
        whitelist: true,
      });

      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['credential', 'parent']),
      );
    });

    it('rejects leftover Post.status on create', async () => {
      const dto = Object.assign(new CreatePostDto(), {
        credentialId: validEntityId,
        description: 'Thread reply',
        ingredients: [],
        label: 'Post',
        status: 'scheduled',
        targetExecutionState: TargetExecutionState.SCHEDULED,
      });

      const errors = await validate(dto, {
        forbidNonWhitelisted: true,
        whitelist: true,
      });

      expect(errors.map((error) => error.property)).toContain('status');
    });

    it('rejects leftover Post.status through the request pipe', async () => {
      const pipe = new ValidationPipe();

      await expect(
        pipe.transform(
          {
            credentialId: validEntityId,
            description: 'Thread reply',
            ingredients: [],
            label: 'Post',
            status: 'scheduled',
            targetExecutionState: TargetExecutionState.SCHEDULED,
          },
          { metatype: CreatePostDto, type: 'body' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects invalid content run attribution IDs', async () => {
      const dto = Object.assign(new CreatePostDto(), {
        contentRunId: 'not-an-entity-id',
        credentialId: validEntityId,
        description: 'Caption',
        ingredients: [],
        label: 'Post',
        targetExecutionState: TargetExecutionState.SCHEDULED,
      });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'contentRunId')).toBe(
        true,
      );
    });
  });
});

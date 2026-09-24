import 'reflect-metadata';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { CreatePromptDto } from '@api/collections/prompts/dto/create-prompt.dto';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { CreateAgentStudioHandoffDto } from '@api/services/agent-orchestrator/dto/create-agent-studio-handoff.dto';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe.each([
  CreateImageDto,
  CreateVideoDto,
  CreatePromptDto,
  CreateAgentStudioHandoffDto,
])('%s requested skills DTO', (Dto) => {
  it.each([
    null,
    'cinema',
    [''],
    ['bad_slug'],
    [1],
    ['a'.repeat(161)],
    Array(9).fill('cinema'),
  ])('rejects malformed selections %j', async (requestedSkillSlugs) => {
    const errors = await validate(
      Object.assign(new Dto(), { requestedSkillSlugs }),
    );
    expect(
      errors.some((error) => error.property === 'requestedSkillSlugs'),
    ).toBe(true);
  });
  it.each([undefined, [], ['Cinema', 'detail']].map((value) => [value]))(
    'allows optional valid selections %j',
    async (requestedSkillSlugs) => {
      const errors = await validate(
        Object.assign(new Dto(), { requestedSkillSlugs }),
      );
      expect(
        errors.some((error) => error.property === 'requestedSkillSlugs'),
      ).toBe(false);
    },
  );
});

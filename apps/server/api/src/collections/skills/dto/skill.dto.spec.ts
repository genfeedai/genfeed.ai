import 'reflect-metadata';

import {
  CreateSkillDto,
  CustomizeSkillDto,
  ImportSkillDto,
  UpdateSkillDto,
} from '@api/collections/skills/dto/skill.dto';
import { ContentSkillCategory } from '@genfeedai/contracts';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

const validPayload = {
  category: ContentSkillCategory.WRITING,
  channels: ['x'],
  description: 'Draft short posts',
  modalities: ['text'],
  name: 'Short post',
  requiredProviders: [],
  slug: 'short-post',
  workflowStage: 'creation',
};

describe('skill DTOs', () => {
  it('accepts a complete create payload and optional import fields', async () => {
    const created = plainToInstance(CreateSkillDto, {
      ...validPayload,
      isBuiltIn: false,
    });
    await expect(validate(created)).resolves.toEqual([]);

    const imported = plainToInstance(ImportSkillDto, {
      ...validPayload,
      sourceUrl: 'https://genfeed.ai/skills/short-post',
    });
    await expect(validate(imported)).resolves.toEqual([]);
  });

  it('rejects an empty create payload and accepts partial updates', async () => {
    const empty = plainToInstance(CreateSkillDto, {});
    const errors = await validate(empty);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'name',
        'slug',
        'description',
        'category',
        'modalities',
        'channels',
        'workflowStage',
      ]),
    );

    const updated = plainToInstance(UpdateSkillDto, {
      name: 'Renamed',
      status: 'published',
    });
    await expect(validate(updated)).resolves.toEqual([]);

    const customized = plainToInstance(CustomizeSkillDto, {
      description: 'Tweaked copy',
    });
    await expect(validate(customized)).resolves.toEqual([]);
  });

  it('rejects client-created built-in skills', async () => {
    const created = plainToInstance(CreateSkillDto, {
      ...validPayload,
      isBuiltIn: true,
    });

    const errors = await validate(created);

    expect(errors.map((error) => error.property)).toContain('isBuiltIn');
  });

  it('rejects null status and slug values on partial updates', async () => {
    const updated = plainToInstance(UpdateSkillDto, {
      slug: null,
      status: null,
    });

    const errors = await validate(updated);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['slug', 'status']),
    );
  });
});

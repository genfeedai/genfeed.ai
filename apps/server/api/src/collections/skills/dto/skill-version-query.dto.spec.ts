import {
  parseSkillVersionEmptyQueryV1,
  SkillVersionListQueryDto,
} from '@api/collections/skills/dto/skill-version-query.dto';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('skill versions strict untouched query', () => {
  it('admits default/min/max and positive PostgreSQL Int cursors', () => {
    expect(SkillVersionListQueryDto.parse({})).toEqual({ limit: 20 });
    expect(
      SkillVersionListQueryDto.parse({
        limit: '1',
        beforeVersionNumber: '2147483647',
      }),
    ).toEqual({ limit: 1, beforeVersionNumber: 2147483647 });
    expect(SkillVersionListQueryDto.parse({ limit: '50' }).limit).toBe(50);
    expect(SkillVersionListQueryDto.parse({ limit: 20 }).limit).toBe(20);
  });
  for (const value of [
    null,
    undefined,
    [],
    ['2'],
    '',
    '0',
    '-1',
    '1.0',
    '1.5',
    '1e1',
    ' 2',
    '2 ',
    '+2',
    '02',
    '0x10',
    'Infinity',
    false,
    {},
    1.5,
    NaN,
    Infinity,
  ]) {
    it(`rejects malformed numeric input ${JSON.stringify(value)}`, () => {
      expect(() => SkillVersionListQueryDto.parse({ limit: value })).toThrow(
        BadRequestException,
      );
      expect(() =>
        SkillVersionListQueryDto.parse({ beforeVersionNumber: value }),
      ).toThrow(BadRequestException);
    });
  }
  it('rejects both upper bounds and every unknown/client brand selector', () => {
    expect(() => SkillVersionListQueryDto.parse({ limit: '51' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      SkillVersionListQueryDto.parse({ beforeVersionNumber: '2147483648' }),
    ).toThrow(BadRequestException);
    for (const key of ['brandId', 'brandSlug', 'page', 'cursor', 'arbitrary']) {
      expect(() => SkillVersionListQueryDto.parse({ [key]: '1' })).toThrow(
        BadRequestException,
      );
      expect(() => parseSkillVersionEmptyQueryV1({ [key]: '1' })).toThrow(
        BadRequestException,
      );
    }
    expect(() => parseSkillVersionEmptyQueryV1({ limit: '1' })).toThrow(
      BadRequestException,
    );
    expect(() => parseSkillVersionEmptyQueryV1({})).not.toThrow();
  });
  it('preserves raw unknown fields through the global Object-metatype pipe before rejection', async () => {
    const raw = { limit: '1e1', brandId: 'client-brand' };
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const untouched = await pipe.transform(raw, {
      type: 'query',
      metatype: Object,
    });
    expect(untouched).toEqual(raw);
    expect(() => SkillVersionListQueryDto.parse(untouched)).toThrow(
      BadRequestException,
    );
  });
});

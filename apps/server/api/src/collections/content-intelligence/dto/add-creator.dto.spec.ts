import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddCreatorDto, ScrapeConfigDto } from './add-creator.dto';

describe('ScrapeConfigDto validation', () => {
  it('accepts valid scrape config', async () => {
    const dto = plainToInstance(ScrapeConfigDto, {
      maxPosts: 100,
      dateRangeDays: 90,
      includeReplies: false,
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects maxPosts below minimum (10)', async () => {
    const dto = plainToInstance(ScrapeConfigDto, { maxPosts: 5 });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'maxPosts')).toBe(true);
  });

  it('rejects maxPosts above maximum (500)', async () => {
    const dto = plainToInstance(ScrapeConfigDto, { maxPosts: 501 });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'maxPosts')).toBe(true);
  });

  it('rejects dateRangeDays below minimum (7)', async () => {
    const dto = plainToInstance(ScrapeConfigDto, { dateRangeDays: 3 });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'dateRangeDays')).toBe(true);
  });

  it('rejects dateRangeDays above maximum (365)', async () => {
    const dto = plainToInstance(ScrapeConfigDto, { dateRangeDays: 366 });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'dateRangeDays')).toBe(true);
  });

  it('rejects non-boolean includeReplies', async () => {
    const dto = plainToInstance(ScrapeConfigDto, { includeReplies: 'yes' });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'includeReplies')).toBe(true);
  });
});

describe('AddCreatorDto nested scrapeConfig validation', () => {
  it('propagates nested ScrapeConfigDto constraint violations', async () => {
    const dto = plainToInstance(AddCreatorDto, {
      handle: 'testcreator',
      platform: 'linkedin',
      scrapeConfig: {
        dateRangeDays: 400,
        includeReplies: 'yes',
        maxPosts: 1,
      },
    });
    const errors = await validate(dto);

    const scrapeConfigError = errors.find((e) => e.property === 'scrapeConfig');
    expect(scrapeConfigError).toBeDefined();
    expect(
      scrapeConfigError?.children?.some((c) => c.property === 'maxPosts'),
    ).toBe(true);
    expect(
      scrapeConfigError?.children?.some((c) => c.property === 'dateRangeDays'),
    ).toBe(true);
    expect(
      scrapeConfigError?.children?.some((c) => c.property === 'includeReplies'),
    ).toBe(true);
  });

  it('passes when scrapeConfig is omitted', async () => {
    const dto = plainToInstance(AddCreatorDto, {
      handle: 'testcreator',
      platform: 'linkedin',
    });
    const errors = await validate(dto);

    const scrapeConfigErrors = errors.filter(
      (e) => e.property === 'scrapeConfig',
    );
    expect(scrapeConfigErrors).toHaveLength(0);
  });

  it('passes when scrapeConfig fields are within bounds', async () => {
    const dto = plainToInstance(AddCreatorDto, {
      handle: 'testcreator',
      platform: 'linkedin',
      scrapeConfig: {
        dateRangeDays: 30,
        includeReplies: true,
        maxPosts: 50,
      },
    });
    const errors = await validate(dto);

    const scrapeConfigErrors = errors.filter(
      (e) => e.property === 'scrapeConfig',
    );
    expect(scrapeConfigErrors).toHaveLength(0);
  });
});

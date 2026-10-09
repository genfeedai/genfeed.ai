import { CreateOrganizationSettingDto } from '@api/collections/organization-settings/dto/create-organization-setting.dto';
import { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('organization module preference DTO validation', () => {
  it('accepts supported boolean overrides through the existing update DTO', async () => {
    const dto = Object.assign(new UpdateOrganizationSettingDto(), {
      moduleOverrides: { automation: true, discovery: false },
    });
    expect(await validate(dto)).toEqual([]);
  });
  it.each([{ unknown: true }, { batch: 'true' }, { playground: false }, [], 1])(
    'rejects malformed override %j',
    async (moduleOverrides) => {
      const dto = Object.assign(new UpdateOrganizationSettingDto(), {
        moduleOverrides,
      });
      expect(
        (await validate(dto)).some(
          (error) => error.property === 'moduleOverrides',
        ),
      ).toBe(true);
    },
  );
  it('rejects explicit null on create rather than resetting preferences', async () => {
    const dto = Object.assign(new CreateOrganizationSettingDto(), {
      moduleOverrides: null,
    });
    expect(
      (await validate(dto)).some(
        (error) => error.property === 'moduleOverrides',
      ),
    ).toBe(true);
  });
  it('keeps omitted preferences compatible with existing updates', async () => {
    expect(await validate(new UpdateOrganizationSettingDto())).toEqual([]);
  });
});

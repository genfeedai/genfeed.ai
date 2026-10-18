import { CreateSettingDto } from '@api/collections/settings/dto/create-setting.dto';
import { testId, testIds } from '@helpers/testing/test-id.helper';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function localeErrorsFor(locale: unknown) {
  const dto = plainToInstance(CreateSettingDto, { locale });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'locale');
}

async function themeErrorsFor(theme: unknown) {
  const dto = plainToInstance(CreateSettingDto, { theme });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'theme');
}

async function railAppOrderErrorsFor(railAppOrder: unknown) {
  const dto = plainToInstance(CreateSettingDto, { railAppOrder });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'railAppOrder');
}

describe('CreateSettingDto', () => {
  it('should be defined', () => {
    expect(CreateSettingDto).toBeDefined();
  });

  describe('homeAppId', () => {
    async function homeAppIdErrorsFor(homeAppId: unknown) {
      const dto = plainToInstance(CreateSettingDto, { homeAppId });
      const errors = await validate(dto);

      return errors.filter((error) => error.property === 'homeAppId');
    }

    it('accepts any rail app, or null to clear it', async () => {
      expect(await homeAppIdErrorsFor('agent')).toEqual([]);
      expect(await homeAppIdErrorsFor('turbo')).toEqual([]);
      expect(await homeAppIdErrorsFor(null)).toEqual([]);
    });

    it('rejects an unknown app id', async () => {
      expect(await homeAppIdErrorsFor('studio')).toHaveLength(1);
    });
  });

  describe('hiddenAppIds', () => {
    async function hiddenAppIdsErrorsFor(hiddenAppIds: unknown) {
      const dto = plainToInstance(CreateSettingDto, { hiddenAppIds });
      const errors = await validate(dto);

      return errors.filter((error) => error.property === 'hiddenAppIds');
    }

    it('accepts core app ids', async () => {
      expect(await hiddenAppIdsErrorsFor(['library', 'analytics'])).toEqual([]);
      expect(await hiddenAppIdsErrorsFor([])).toEqual([]);
    });

    it('rejects secondary apps, unknown ids and duplicates', async () => {
      expect(await hiddenAppIdsErrorsFor(['turbo'])).toHaveLength(1);
      expect(await hiddenAppIdsErrorsFor(['studio'])).toHaveLength(1);
      expect(await hiddenAppIdsErrorsFor(['agent', 'agent'])).toHaveLength(1);
    });
  });

  describe('railAppOrder', () => {
    it('accepts core and secondary app ids in any order', async () => {
      expect(
        await railAppOrderErrorsFor(['turbo', 'workspace', 'agent']),
      ).toEqual([]);
      expect(await railAppOrderErrorsFor([])).toEqual([]);
    });

    it('rejects unknown ids and duplicates', async () => {
      expect(await railAppOrderErrorsFor(['studio'])).toHaveLength(1);
      expect(await railAppOrderErrorsFor(['agent', 'agent'])).toHaveLength(1);
    });
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateSettingDto();
      expect(dto).toBeInstanceOf(CreateSettingDto);
    });

    it('accepts a supported locale', async () => {
      expect(await localeErrorsFor('en-XA')).toEqual([]);
    });

    it('accepts an omitted locale', async () => {
      expect(await localeErrorsFor(undefined)).toEqual([]);
    });

    it('rejects a locale outside the allowlist', async () => {
      // The column is TEXT, so the allowlist is the only thing standing between
      // a typo and a request that renders against a catalog that does not exist.
      const localeErrors = await localeErrorsFor('de');

      expect(localeErrors).toHaveLength(1);
      expect(localeErrors[0]?.constraints).toHaveProperty('isIn');
    });

    it.each(['system', 'light', 'dark'])(
      'accepts the %s theme preference',
      async (theme) => {
        expect(await themeErrorsFor(theme)).toEqual([]);
      },
    );

    it('rejects a theme outside the shared allowlist', async () => {
      const themeErrors = await themeErrorsFor('solarized');

      expect(themeErrors).toHaveLength(1);
      expect(themeErrors[0]?.constraints).toHaveProperty('isIn');
    });

    it('accepts a boolean video email preference', async () => {
      const dto = plainToInstance(CreateSettingDto, {
        isVideoNotificationsEmail: true,
      });
      const errors = await validate(dto);

      expect(
        errors.filter(
          (error) => error.property === 'isVideoNotificationsEmail',
        ),
      ).toEqual([]);
    });

    it('rejects a non-boolean video email preference', async () => {
      const dto = plainToInstance(CreateSettingDto, {
        isVideoNotificationsEmail: 'yes',
      });
      const errors = await validate(dto);
      const videoEmailErrors = errors.filter(
        (error) => error.property === 'isVideoNotificationsEmail',
      );

      expect(videoEmailErrors).toHaveLength(1);
      expect(videoEmailErrors[0]?.constraints).toHaveProperty('isBoolean');
    });
  });

  describe('favoriteWorkflowIds', () => {
    it('accepts up to 50 unique workflow ids', async () => {
      expect(await favoriteWorkflowErrorsFor(testIds('workflow', 50))).toEqual(
        [],
      );
    });

    it('accepts an empty favorites list', async () => {
      expect(await favoriteWorkflowErrorsFor([])).toEqual([]);
    });

    it('rejects more than 50 favorites', async () => {
      const errors = await favoriteWorkflowErrorsFor(testIds('workflow', 51));

      expect(errors).toHaveLength(1);
      expect(errors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });

    it('rejects duplicate favorites', async () => {
      const workflowId = testId('workflow');
      const errors = await favoriteWorkflowErrorsFor([workflowId, workflowId]);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.constraints).toHaveProperty('arrayUnique');
    });

    it('rejects values that are not entity ids', async () => {
      const errors = await favoriteWorkflowErrorsFor(['not an id']);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.constraints).toHaveProperty('isEntityId');
    });

    it('accepts an omitted favorites list', async () => {
      expect(await favoriteWorkflowErrorsFor(undefined)).toEqual([]);
    });

    it('rejects a non-array value', async () => {
      const errors = await favoriteWorkflowErrorsFor(testId('workflow'));

      expect(errors).toHaveLength(1);
      expect(errors[0]?.constraints).toHaveProperty('isArray');
    });
  });
});

async function favoriteWorkflowErrorsFor(favoriteWorkflowIds: unknown) {
  const dto = plainToInstance(CreateSettingDto, { favoriteWorkflowIds });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'favoriteWorkflowIds');
}

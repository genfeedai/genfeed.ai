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

describe('CreateSettingDto', () => {
  describe('validation', () => {
    it('rejects a locale outside the allowlist', async () => {
      // The column is TEXT, so the allowlist is the only thing standing between
      // a typo and a request that renders against a catalog that does not exist.
      const localeErrors = await localeErrorsFor('de');

      expect(localeErrors).toHaveLength(1);
      expect(localeErrors[0]?.constraints).toHaveProperty('isIn');
    });

    it('rejects a theme outside the shared allowlist', async () => {
      const themeErrors = await themeErrorsFor('solarized');

      expect(themeErrors).toHaveLength(1);
      expect(themeErrors[0]?.constraints).toHaveProperty('isIn');
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

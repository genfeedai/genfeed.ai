import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminUpdateUserProfileDto } from './admin-update-user-profile.dto';

describe('AdminUpdateUserProfileDto', () => {
  it('accepts clearable names and a nonblank handle', async () => {
    expect(
      await validate(
        plainToInstance(AdminUpdateUserProfileDto, {
          firstName: '',
          lastName: '',
          handle: 'jane',
        }),
      ),
    ).toHaveLength(0);
  });
  it.each(['', '   ', 4, null])('rejects invalid handle %s', async (handle) => {
    expect(
      await validate(
        plainToInstance(AdminUpdateUserProfileDto, {
          firstName: 'Jane',
          lastName: '',
          handle,
        }),
      ),
    ).not.toHaveLength(0);
  });
  it('strips access, email and onboarding fields from the profile boundary', async () => {
    const dto = plainToInstance(AdminUpdateUserProfileDto, {
      firstName: 'Jane',
      lastName: '',
      handle: 'jane',
      email: 'other@example.com',
      platformRole: 'SUPERADMIN',
      isOnboardingCompleted: true,
    });
    await validate(dto, { whitelist: true });
    expect(dto).toEqual({ firstName: 'Jane', lastName: '', handle: 'jane' });
  });
});

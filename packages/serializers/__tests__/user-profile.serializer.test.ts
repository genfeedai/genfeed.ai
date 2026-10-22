import { UserSerializer } from '@serializers/server/users/user.serializer';
import { describe, expect, it } from 'vitest';

describe('User profile identity', () => {
  it('retains the authentication full name when split names are empty', () => {
    const output = UserSerializer.serialize({
      id: 'legacy-user',
      name: 'Jane Example',
      firstName: '',
      lastName: '',
      handle: 'jane',
    });
    expect(output).toMatchObject({
      data: {
        id: 'legacy-user',
        attributes: {
          name: 'Jane Example',
          firstName: '',
          lastName: '',
          handle: 'jane',
        },
      },
    });
  });
});

import 'reflect-metadata';

import {
  RolesDecorator,
  SKIP_ROLES_KEY,
  SkipRoles,
} from '@api/helpers/decorators/roles/roles.decorator';

describe('RolesDecorator', () => {
  it('stores roles metadata on target method', () => {
    class Test {
      @RolesDecorator('superadmin', 'user')
      method(this: void) {
        /* stub */
      }
    }
    const meta = Reflect.getMetadata('roles', Test.prototype.method);
    expect(meta).toEqual(['superadmin', 'user']);
  });

  it('marks an authenticated self-scoped handler to skip role checks', () => {
    class Test {
      @SkipRoles()
      method(this: void) {
        /* stub */
      }
    }

    expect(Reflect.getMetadata(SKIP_ROLES_KEY, Test.prototype.method)).toBe(
      true,
    );
  });
});

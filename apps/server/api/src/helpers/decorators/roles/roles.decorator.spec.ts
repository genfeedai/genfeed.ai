import 'reflect-metadata';

import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';

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
});

import 'reflect-metadata';

import { IS_PUBLIC_KEY, Public } from '@libs/decorators/public.decorator';

describe('Public decorator', () => {
  it('sets metadata flag on the method', () => {
    class Test {
      @Public()
      method(this: void) {
        return undefined;
      }
    }
    const meta = Reflect.getMetadata(IS_PUBLIC_KEY, Test.prototype.method);
    expect(meta).toBe(true);
  });
});

import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { describe, expect, it } from 'vitest';

describe('CurrentUser decorator', () => {
  it('is defined and is a function (decorator)', () => {
    expect(CurrentUser).toBeDefined();
    // NestJS decorators are functions
    expect(typeof CurrentUser).toBe('function');
  });
});

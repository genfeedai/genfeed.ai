import { encodeJwtToken } from '@api/helpers/utils/jwt/jwt.util';
import jwt from 'jsonwebtoken';

describe('encodeJwtToken', () => {
  it('creates a signed JWT with expected payload', () => {
    const ak = 'test-ak';
    const sk = 'super-secret';

    const token = encodeJwtToken(ak, sk);
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, sk);
    expect(decoded.iss).toBe(ak);

    const now = Math.floor(Date.now() / 1000);
    // exp should be ~ now + 1800, nbf ~ now - 5
    expect(decoded.exp).toBeGreaterThanOrEqual(now + 1700);
    expect(decoded.exp).toBeLessThanOrEqual(now + 1900);
    expect(decoded.nbf).toBeLessThanOrEqual(now);
    expect(decoded.nbf).toBeGreaterThanOrEqual(now - 60);
  });
});

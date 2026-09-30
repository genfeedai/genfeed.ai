import jwt from 'jsonwebtoken';
import { encodeJwtToken } from './jwt.util';

describe('encodeJwtToken', () => {
  const secret = 'test-secret-key';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('signs an HS256 token carrying the access key as issuer', () => {
    const token = encodeJwtToken('access-key', secret);
    const decoded = jwt.verify(token, secret);

    expect(typeof decoded).toBe('object');
    expect(decoded).toMatchObject({ iss: 'access-key' });
  });

  it('sets exp 30 minutes ahead and nbf 5 seconds behind the current time', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = encodeJwtToken('access-key', secret);
    const decoded = jwt.verify(token, secret) as {
      exp: number;
      nbf: number;
    };

    expect(decoded.exp).toBe(now + 1800);
    expect(decoded.nbf).toBe(now - 5);
  });

  it('produces a token that fails verification under a different secret', () => {
    const token = encodeJwtToken('access-key', secret);

    expect(() => jwt.verify(token, 'other-secret')).toThrowError();
  });
});

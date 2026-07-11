import jwt from 'jsonwebtoken';

export function encodeJwtToken(ak: string, sk: string): string {
  const headers = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000); // current time in seconds

  const payload = {
    exp: now + 1800, // current time + 30 minutes
    iss: ak,
    nbf: now - 5, // current time - 5 seconds
  };

  return jwt.sign(payload, sk, { header: headers });
}

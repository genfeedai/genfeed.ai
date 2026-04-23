declare module 'jsonapi-serializer' {
  export class Error {
    constructor(payload: unknown);
  }
}

declare module 'jsonwebtoken' {
  export function sign(
    payload: Record<string, unknown>,
    secretOrPrivateKey: string,
    options?: Record<string, unknown>,
  ): string;

  const jwt: {
    sign: typeof sign;
  };

  export default jwt;
}

declare module 'bcrypt';

declare namespace Express {
  namespace Multer {
    interface File {
      buffer: Buffer;
      destination?: string;
      encoding: string;
      fieldname: string;
      filename?: string;
      mimetype: string;
      originalname: string;
      path?: string;
      size: number;
      stream?: NodeJS.ReadableStream;
    }
  }
}

import {
  IncomingMessage,
  type RequestOptions,
  request as requestHttp,
} from 'node:http';
import { request as requestHttps } from 'node:https';
import { Socket } from 'node:net';
import { Duplex, Readable } from 'node:stream';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { FanvueService } from '@api/services/integrations/fanvue/services/fanvue.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { NEVER, of, Subject, throwError } from 'rxjs';

vi.mock('axios', async (original) => original<typeof import('axios')>());

vi.mock('node:https', async (original) => {
  const actual = await original<typeof import('node:https')>();
  return { ...actual, request: vi.fn(actual.request) };
});

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => `decrypted_${value}`),
    encrypt: vi.fn((value: string) => `encrypted_${value}`),
  },
}));

describe('FanvueService', () => {
  let service: FanvueService;
  let httpService: vi.Mocked<HttpService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let loggerService: vi.Mocked<LoggerService>;
  let configValues: Record<string, string | undefined>;

  const mockClientId = 'fanvue-client-id';
  const mockClientSecret = 'fanvue-client-secret';
  const mockRedirectUri = 'https://app.example.com/fanvue/callback';

  beforeEach(async () => {
    configValues = {
      FANVUE_CLIENT_ID: mockClientId,
      FANVUE_CLIENT_SECRET: mockClientSecret,
      FANVUE_REDIRECT_URI: mockRedirectUri,
    };
    const mockConfigService = {
      get: vi.fn((key: string) => configValues[key]),
    };

    const mockHttpService = {
      axiosRef: axios.create({ adapter: 'http', proxy: false }),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    };

    const mockCredentialsService = {
      findOne: vi.fn(),
      patch: vi.fn(),
      // Multi-account resolution routes through `resolveBrandAccount`; the double
      // answers with whatever `findOne` is primed to return so the existing
      // single-account cases keep describing one connected account.
      resolveBrandAccount: vi.fn((options: { credentialId?: string | null }) =>
        (mockCredentialsService.findOne as vi.Mock)(options),
      ),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FanvueService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: CredentialsService, useValue: mockCredentialsService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<FanvueService>(FanvueService);
    httpService = module.get(HttpService);
    credentialsService = module.get(CredentialsService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('reports configured OAuth without exposing configuration values', () => {
    expect(() => service.requireConfigured()).not.toThrow();

    configValues.FANVUE_CLIENT_SECRET = 'PLACEHOLDER_NOT_CONFIGURED';

    expect(() => service.requireConfigured()).toThrowError(
      'Fanvue OAuth is not configured for this deployment.',
    );
  });

  describe('generatePkce', () => {
    it('should return codeVerifier and codeChallenge', () => {
      const result = service.generatePkce();

      expect(result).toHaveProperty('codeVerifier');
      expect(result).toHaveProperty('codeChallenge');
      expect(typeof result.codeVerifier).toBe('string');
      expect(typeof result.codeChallenge).toBe('string');
    });

    it('should generate codeVerifier with maximum 128 characters', () => {
      const result = service.generatePkce();

      expect(result.codeVerifier.length).toBeLessThanOrEqual(128);
      expect(result.codeVerifier.length).toBeGreaterThan(0);
    });

    it('should generate different PKCE pairs on each call', () => {
      const result1 = service.generatePkce();
      const result2 = service.generatePkce();

      expect(result1.codeVerifier).not.toBe(result2.codeVerifier);
      expect(result1.codeChallenge).not.toBe(result2.codeChallenge);
    });

    it('should generate base64url-safe codeChallenge', () => {
      const result = service.generatePkce();

      // base64url should not contain +, /, or =
      expect(result.codeChallenge).not.toMatch(/[+/=]/);
    });
  });

  describe('buildAuthUrl', () => {
    it('should return a valid Fanvue OAuth URL', () => {
      const state = 'random-state';
      const codeChallenge = 'challenge-abc';
      const url = service.buildAuthUrl(state, codeChallenge);

      expect(url).toContain('https://auth.fanvue.com/oauth2/auth');
      expect(url).toContain(`client_id=${mockClientId}`);
      expect(url).toContain(
        `redirect_uri=${encodeURIComponent(mockRedirectUri)}`,
      );
      expect(url).toContain('response_type=code');
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain(`code_challenge=${codeChallenge}`);
      expect(url).toContain(`state=${state}`);
    });

    it('should include all required scopes', () => {
      const url = service.buildAuthUrl('state', 'challenge');

      expect(new URL(url).searchParams.get('scope')?.split(' ')).toEqual([
        'openid',
        'offline_access',
        'offline',
        'read:self',
        'read:media',
        'write:media',
        'write:post',
      ]);
    });

    it.each([
      ['FANVUE_CLIENT_ID', undefined],
      ['FANVUE_CLIENT_SECRET', undefined],
      ['FANVUE_REDIRECT_URI', undefined],
      ['FANVUE_CLIENT_ID', '   '],
      ['FANVUE_CLIENT_SECRET', '   '],
      ['FANVUE_REDIRECT_URI', '   '],
      ['FANVUE_CLIENT_ID', 'PLACEHOLDER_NOT_CONFIGURED'],
      ['FANVUE_CLIENT_SECRET', 'PLACEHOLDER_NOT_CONFIGURED'],
      ['FANVUE_REDIRECT_URI', 'PLACEHOLDER_NOT_CONFIGURED'],
    ])('rejects %s=%s instead of building a malformed URL', (key, value) => {
      configValues[key] = value;

      expect(() => service.buildAuthUrl('state', 'challenge')).toThrow(
        ServiceUnavailableException,
      );
    });

    it('trims configured values before building the provider URL', () => {
      configValues.FANVUE_CLIENT_ID = `  ${mockClientId}  `;
      configValues.FANVUE_CLIENT_SECRET = `  ${mockClientSecret}  `;
      configValues.FANVUE_REDIRECT_URI = `  ${mockRedirectUri}  `;

      const providerUrl = new URL(service.buildAuthUrl('state', 'challenge'));

      expect(providerUrl.searchParams.get('client_id')).toBe(mockClientId);
      expect(providerUrl.searchParams.get('redirect_uri')).toBe(
        mockRedirectUri,
      );
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('requires the redirect URI before making the token request', async () => {
      configValues.FANVUE_REDIRECT_URI = undefined;

      await expect(
        service.exchangeCodeForTokens('auth-code', 'verifier'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('should exchange code for tokens successfully', async () => {
      const mockTokenResponse = {
        access_token: 'fv-access-token',
        expires_in: 3600,
        id_token: 'fv-id-token',
        refresh_token: 'fv-refresh-token',
        scope: 'openid offline_access',
        token_type: 'Bearer',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockTokenResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.exchangeCodeForTokens(
        'auth-code',
        'verifier-123',
      );

      expect(result).toEqual(mockTokenResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        'https://auth.fanvue.com/oauth2/token',
        expect.stringContaining('code=auth-code'),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          expiresIn: 3600,
          hasAccessToken: true,
          hasRefreshToken: true,
        }),
      );
    });

    it('should include code_verifier in token exchange request', async () => {
      const mockTokenResponse = {
        access_token: 'token',
        expires_in: 3600,
        id_token: 'id',
        refresh_token: 'refresh',
        scope: 'openid',
        token_type: 'Bearer',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockTokenResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.exchangeCodeForTokens('code', 'my-verifier');

      const postBody = httpService.post.mock.calls[0][1] as string;
      expect(postBody).toContain('code_verifier=my-verifier');
      expect(postBody).toContain('grant_type=authorization_code');
      expect(postBody).toContain(`client_id=${mockClientId}`);
      expect(postBody).toContain(`client_secret=${mockClientSecret}`);
    });

    it('should throw and log error when API request fails', async () => {
      const apiError = Object.assign(new Error('Bad Request'), {
        response: { data: { error: 'invalid_grant' }, status: 400 },
      });

      httpService.post.mockReturnValue(throwError(() => apiError));

      await expect(
        service.exchangeCodeForTokens('bad-code', 'verifier'),
      ).rejects.toThrow('Bad Request');
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          error: { error: 'invalid_grant' },
          httpCode: 400,
        }),
      );
    });
  });

  describe('refreshToken', () => {
    const orgId = 'test-object-id';
    const brandId = 'test-object-id';

    it('should return existing token when it does not need refresh', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      const mockCredential = {
        id: 'test-object-id',
        accessToken: 'encrypted-access-token',
        accessTokenExpiry: futureDate,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh-token',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);

      const result = await service.refreshToken(orgId, brandId);

      expect(result.accessToken).toBe('decrypted_encrypted-access-token');
      expect(result.credential).toEqual(mockCredential);
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('acts as the account named by credentialId', async () => {
      // A brand may hold several Fanvue accounts; token repair addresses the
      // named one instead of whichever happens to be the brand default.
      credentialsService.findOne.mockResolvedValue({
        id: 'credential-2',
        accessToken: 'encrypted-access-token',
        accessTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh-token',
      } as never);

      await service.refreshToken(orgId, brandId, 'credential-2');

      expect(credentialsService.resolveBrandAccount).toHaveBeenCalledWith({
        brandId,
        credentialId: 'credential-2',
        isDisconnectedIncluded: true,
        organizationId: orgId,
        platform: CredentialPlatform.FANVUE,
      });
    });

    it('should refresh token when it expires within 10 minutes', async () => {
      const nearExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
      const mockCredential = {
        id: 'test-object-id',
        accessToken: 'encrypted-old-token',
        accessTokenExpiry: nearExpiry,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh-token',
      };

      const mockTokenResponse = {
        access_token: 'new-access-token',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
        scope: 'read:self read:media write:media write:post',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockTokenResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );
      credentialsService.patch.mockResolvedValue({
        ...mockCredential,
        accessToken: 'new-access-token',
      } as never);

      const result = await service.refreshToken(orgId, brandId);

      expect(result.accessToken).toBe('new-access-token');
      expect(httpService.post).toHaveBeenCalledWith(
        'https://auth.fanvue.com/oauth2/token',
        expect.stringContaining('grant_type=refresh_token'),
        expect.any(Object),
      );
      // Tokens are passed as plaintext now — CredentialsService encrypts at the
      // write boundary, so the provider no longer pre-encrypts (which would
      // double-encrypt).
      expect(credentialsService.patch).toHaveBeenCalledWith(
        mockCredential.id,
        expect.objectContaining({
          accessToken: 'new-access-token',
          grantedScopes: [
            'read:media',
            'read:self',
            'write:media',
            'write:post',
          ],
          grantedScopesCapturedAt: expect.any(Date),
          isConnected: true,
          refreshToken: 'new-refresh-token',
        }),
      );
    });

    it('does not disconnect an account when server OAuth config is unavailable', async () => {
      configValues.FANVUE_CLIENT_SECRET = 'PLACEHOLDER_NOT_CONFIGURED';
      credentialsService.findOne.mockResolvedValue({
        accessToken: 'encrypted-access-token',
        accessTokenExpiry: new Date(Date.now() + 5 * 60 * 1000),
        id: 'credential-1',
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh-token',
      } as never);

      await expect(service.refreshToken(orgId, brandId)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      expect(httpService.post).not.toHaveBeenCalled();
      expect(credentialsService.patch).not.toHaveBeenCalled();
    });

    it('should throw when credential is not found', async () => {
      credentialsService.findOne.mockResolvedValue(null as never);

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'Fanvue credential not found',
      );
    });

    it('should disconnect and throw when tokens are missing', async () => {
      const mockCredential = {
        id: 'test-object-id',
        accessToken: undefined,
        platform: CredentialPlatform.FANVUE,
        refreshToken: undefined,
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'Fanvue tokens not found',
      );
      expect(credentialsService.patch).toHaveBeenCalledWith(mockCredential.id, {
        isConnected: false,
      });
    });

    it('should disconnect when token refresh API call fails', async () => {
      const nearExpiry = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now
      const mockCredential = {
        id: 'test-object-id',
        accessToken: 'encrypted-token',
        accessTokenExpiry: nearExpiry,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      httpService.post.mockReturnValue(
        throwError(() => new Error('Token refresh failed')),
      );

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'Token refresh failed',
      );
      expect(credentialsService.patch).toHaveBeenCalledWith(mockCredential.id, {
        isConnected: false,
      });
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should use old refresh token when new one is not returned', async () => {
      const nearExpiry = new Date(Date.now() + 3 * 60 * 1000);
      const mockCredential = {
        id: 'test-object-id',
        accessToken: 'encrypted-token',
        accessTokenExpiry: nearExpiry,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-old-refresh',
      };

      const mockTokenResponse = {
        access_token: 'new-access',
        expires_in: 7200,
        refresh_token: undefined,
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockTokenResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );
      credentialsService.patch.mockResolvedValue(mockCredential as never);

      await service.refreshToken(orgId, brandId);

      // The decrypted old refresh token is re-saved as plaintext; the
      // CredentialsService write boundary re-encrypts it (no double-encrypt).
      expect(credentialsService.patch).toHaveBeenCalledWith(
        mockCredential.id,
        expect.objectContaining({
          refreshToken: 'decrypted_encrypted-old-refresh',
        }),
      );
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile successfully', async () => {
      const mockProfile = {
        displayName: 'Test User',
        email: 'test@example.com',
        handle: 'testuser',
        uuid: 'fv-uuid-123',
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: mockProfile,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.getUserProfile('access-token');

      expect(result).toEqual(mockProfile);
      expect(httpService.get).toHaveBeenCalledWith(
        'https://api.fanvue.com/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer access-token',
            'X-Fanvue-API-Version': '2025-06-26',
          }),
        }),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ handle: 'testuser', uuid: 'fv-uuid-123' }),
      );
    });

    it('should throw and log error when API call fails', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Profile fetch failed')),
      );

      await expect(service.getUserProfile('bad-token')).rejects.toThrow(
        'Profile fetch failed',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('uploadMedia', () => {
    const mediaUrl = 'https://cdn.example.com/media/photo.jpg';
    const accessToken = 'synthetic-account-token';
    const session = {
      mediaUuid: 'media-uuid',
      uploadId: 'upload/id',
      partSize: 4,
      maxParts: 100,
      totalParts: null,
    };
    let bodies: Buffer[];
    let sockets: Duplex[];
    let sentBytes: number;
    let retainBytes: boolean;
    let allBytesCorrect: boolean;
    let source: Readable;
    let byteDelayMs: number;
    let responseDelayMs: number;
    let earlyResponse: boolean;
    let responseHeaders: string;
    let connectionDelayMs: number;
    let transmitted: number[];
    let replyFor: (options: RequestOptions) => string;
    let nativeOptions: RequestOptions[];
    let wires: StorageWire[];

    class StorageWire extends Duplex {
      connecting = connectionDelayMs > 0;
      readonly bytes: Buffer[] = [];
      private headersReceived = false;
      private idleTimer?: ReturnType<typeof setTimeout>;
      private writeTimer?: ReturnType<typeof setTimeout>;
      private idleMilliseconds = 0;

      _read(): void {}

      private progress(body: Buffer): void {
        sentBytes += body.length;
        allBytesCorrect &&= body.every((byte) => byte === 73);
        transmitted.push(...(body.length < 100 ? body : []));
        if (retainBytes && body.length) {
          const copy = Buffer.from(body);
          bodies.push(copy);
          this.bytes.push(copy);
        }
        this.refreshIdle();
      }

      private refreshIdle(): void {
        clearTimeout(this.idleTimer);
        if (this.idleMilliseconds > 0) {
          this.idleTimer = setTimeout(
            () => this.emit('timeout'),
            this.idleMilliseconds,
          );
        }
      }

      _write(
        chunk: Buffer,
        _encoding: BufferEncoding,
        done: (error?: Error | null) => void,
      ): void {
        if (this.connecting) {
          this.once('connect', () => this._write(chunk, _encoding, done));
          return;
        }
        let body = chunk;
        if (!this.headersReceived) {
          const boundary = chunk.indexOf('\r\n\r\n');
          expect(boundary).toBeGreaterThanOrEqual(0);
          this.headersReceived = true;
          body = chunk.subarray(boundary + 4);
        }
        if (!byteDelayMs || body.length === 0) {
          this.progress(body);
          done();
          return;
        }
        let offset = 0;
        const send = () => {
          if (this.destroyed) return;
          this.progress(body.subarray(offset, ++offset));
          if (offset === body.length) done();
          else this.writeTimer = setTimeout(send, byteDelayMs);
        };
        this.writeTimer = setTimeout(send, byteDelayMs);
      }

      _destroy(
        error: Error | null,
        done: (error?: Error | null) => void,
      ): void {
        clearTimeout(this.idleTimer);
        clearTimeout(this.writeTimer);
        done(error);
      }

      setTimeout(milliseconds: number): this {
        this.idleMilliseconds = milliseconds;
        this.refreshIdle();
        return this;
      }

      setNoDelay(): this {
        return this;
      }
      setKeepAlive(): this {
        return this;
      }
    }

    function response<T>(data: T) {
      return {
        config: { headers: new axios.AxiosHeaders() },
        data,
        headers: {},
        status: 200,
        statusText: 'OK',
      };
    }

    function prepare(
      chunks: Iterable<Uint8Array> = [Buffer.from('abcdefghi')],
    ): void {
      source = Readable.from(chunks, { objectMode: false, highWaterMark: 1 });
      httpService.get.mockImplementation((url) =>
        of(
          response(
            url === mediaUrl ? source : 'https://storage.example.com/part',
          ),
        ),
      );
      httpService.post.mockReturnValue(of(response(session)));
      httpService.patch.mockReturnValue(of(response({})));
    }

    beforeEach(() => {
      bodies = [];
      sockets = [];
      sentBytes = 0;
      retainBytes = true;
      allBytesCorrect = true;
      byteDelayMs = 0;
      responseDelayMs = 0;
      earlyResponse = false;
      connectionDelayMs = 0;
      responseHeaders = 'ETag: "part-etag"\r\n';
      transmitted = [];
      replyFor = () => '';
      nativeOptions = [];
      wires = [];
      prepare();
      const realHttp = new HttpService(httpService.axiosRef);
      httpService.put.mockImplementation((url, data, config) =>
        realHttp.put(url, data, config),
      );
      vi.mocked(requestHttps).mockImplementation(
        (
          options: RequestOptions | string | URL,
          callbackOrOptions?:
            | RequestOptions
            | Parameters<typeof requestHttp>[2],
          callback?: Parameters<typeof requestHttp>[2],
        ) => {
          const onResponse =
            typeof callbackOrOptions === 'function'
              ? callbackOrOptions
              : callback;
          if (typeof options === 'string' || options instanceof URL)
            throw new Error('Expected options');
          const socket = new StorageWire();
          sockets.push(socket);
          nativeOptions.push(options);
          wires.push(socket);
          const request = requestHttp(
            {
              ...options,
              agent: undefined,
              createConnection: () => socket,
              protocol: 'http:',
            },
            earlyResponse ? undefined : onResponse,
          );
          if (connectionDelayMs > 0) {
            const connectTimer = setTimeout(() => {
              socket.connecting = false;
              socket.emit('connect');
            }, connectionDelayMs);
            socket.once('close', () => clearTimeout(connectTimer));
          }
          if (earlyResponse) {
            const timer = setTimeout(() => {
              const responseSocket = new Socket();
              const incoming = new IncomingMessage(responseSocket);
              incoming.statusCode = 200;
              incoming.statusMessage = 'OK';
              incoming.headers = { etag: '"part-etag"' };
              incoming.complete = true;
              incoming.once('end', () => responseSocket.destroy());
              onResponse?.(incoming);
              incoming.push(null);
            }, 1);
            socket.once('close', () => clearTimeout(timer));
          }
          request.on('finish', () => {
            if (earlyResponse) {
              socket.push(null);
              return;
            }
            const respond = () => {
              const reply = replyFor(options);
              socket.push(
                'HTTP/1.1 200 OK\r\nContent-Length: ' +
                  Buffer.byteLength(reply) +
                  '\r\n' +
                  responseHeaders +
                  'Connection: close\r\n\r\n' +
                  reply,
              );
              socket.push(null);
            };
            if (responseDelayMs > 0) {
              const timer = setTimeout(respond, responseDelayMs);
              socket.once('close', () => clearTimeout(timer));
            } else respond();
          });
          return request;
        },
      );
    });

    afterEach(() => {
      for (const socket of sockets) socket.destroy();
      vi.useRealTimers();
    });

    it('streams irregular chunks into returned-size parts and completes the documented protocol once', async () => {
      prepare([Buffer.from('a'), Buffer.from('bcdef'), Buffer.from('ghi')]);
      expect(await service.uploadMedia(accessToken, mediaUrl, 'image')).toBe(
        'media-uuid',
      );
      expect(bodies.map((body) => body.toString())).toEqual([
        'abcd',
        'efgh',
        'i',
      ]);
      expect(httpService.get).toHaveBeenNthCalledWith(
        1,
        mediaUrl,
        expect.objectContaining({ responseType: 'stream' }),
      );
      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.fanvue.com/media/uploads',
        {
          filename: 'photo.jpg',
          name: 'photo.jpg',
          mediaType: 'image',
        },
        expect.any(Object),
      );
      expect(httpService.patch).toHaveBeenCalledExactlyOnceWith(
        'https://api.fanvue.com/media/uploads/upload%2Fid',
        {
          parts: [1, 2, 3].map((PartNumber) => ({
            ETag: '"part-etag"',
            PartNumber,
          })),
        },
        expect.any(Object),
      );
      expect(
        httpService.put.mock.calls.map((call) => call[2]?.headers),
      ).toEqual(
        [4, 4, 1].map((size) =>
          expect.objectContaining({
            'Content-Length': size,
            Authorization: false,
            Cookie: false,
          }),
        ),
      );
      expect(source.destroyed).toBe(true);
    });

    it('does not add an empty tail for an exact multiple', async () => {
      prepare([Buffer.from('abcdefgh')]);
      await service.uploadMedia(accessToken, mediaUrl, 'video');
      expect(bodies.map((body) => body.length)).toEqual([4, 4]);
      expect(httpService.post.mock.calls[0][1]).toEqual({
        filename: 'photo.jpg',
        name: 'photo.jpg',
        mediaType: 'video',
      });
    });

    it('rejects empty input before creating remote state', async () => {
      prepare([]);
      await expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toThrow('Fanvue media upload failed');
      expect(httpService.post).not.toHaveBeenCalled();
      expect(httpService.patch).not.toHaveBeenCalled();
    });

    it('sanitizes source failures and logs only the bounded stage', async () => {
      httpService.get.mockReturnValueOnce(
        throwError(() =>
          Object.assign(new Error('secret URL token provider body'), {
            response: { status: 403, data: 'private' },
          }),
        ),
      );
      const operation = service.uploadMedia(accessToken, mediaUrl, 'image');
      await expect(operation).rejects.toEqual(
        new Error('Fanvue media upload failed'),
      );
      expect(loggerService.error).toHaveBeenCalledExactlyOnceWith(
        'Fanvue media upload failed',
        { stage: 'source', httpCode: 403 },
      );
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it.each([
      { partSize: 0 },
      { partSize: 1.1 },
      { maxParts: 0 },
      { totalParts: 3 },
      { totalParts: undefined },
      { uploadId: '' },
      { mediaUuid: '' },
      { mediaUuid: '  ' },
      { uploadId: '  ' },
      { maxParts: Number.MAX_SAFE_INTEGER + 1 },
      { partSize: Number.MAX_SAFE_INTEGER + 1 },
    ])('rejects invalid session fields %j', async (fields) => {
      httpService.post.mockReturnValue(of(response({ ...session, ...fields })));
      await expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toThrow('Fanvue media upload failed');
      expect(httpService.put).not.toHaveBeenCalled();
      expect(httpService.patch).not.toHaveBeenCalled();
      expect(source.destroyed).toBe(true);
    });

    it.each([
      'http://storage.example.com/a',
      'https://user:password@storage.example.com/a',
      '{"signedUrl":"https://storage.example.com/a"}',
    ])('rejects non-bare signed HTTPS URL %s', async (signed) => {
      httpService.get.mockImplementation((url) =>
        of(response(url === mediaUrl ? source : signed)),
      );
      await expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toThrow('Fanvue media upload failed');
      expect(httpService.put).not.toHaveBeenCalled();
      expect(httpService.patch).not.toHaveBeenCalled();
    });

    it('rejects overflow before signing beyond maxParts', async () => {
      httpService.post.mockReturnValue(
        of(response({ ...session, maxParts: 1 })),
      );
      await expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toThrow('Fanvue media upload failed');
      expect(httpService.put).toHaveBeenCalledTimes(1);
      expect(httpService.get).toHaveBeenCalledTimes(2);
      expect(httpService.patch).not.toHaveBeenCalled();
    });

    it.each([
      {},
      { 'content-length': 'wrong' },
      { 'content-length': '1' },
      { 'content-length': '9007199254740992', 'content-encoding': 'gzip' },
    ])(
      'uses delivered bytes rather than advisory headers %j',
      async (headers) => {
        httpService.get.mockImplementation((url) =>
          of({
            ...response(
              url === mediaUrl ? source : 'https://storage.example.com/part',
            ),
            headers,
          }),
        );
        await service.uploadMedia(accessToken, mediaUrl, 'image');
        expect(sentBytes).toBe(9);
        expect(bodies.map((body) => body.toString())).toEqual([
          'abcd',
          'efgh',
          'i',
        ]);
      },
    );

    it('permits exactly maxParts when the last full part reaches clean EOF', async () => {
      prepare([Buffer.from('abcd')]);
      httpService.post.mockReturnValue(
        of(response({ ...session, maxParts: 1 })),
      );
      await expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).resolves.toBe('media-uuid');
      expect(httpService.put).toHaveBeenCalledTimes(1);
      expect(httpService.patch).toHaveBeenCalledTimes(1);
    });

    it.each(
      ['create', 'sign', 'put'].flatMap((stage) =>
        ['error', 'aborted', 'close'].map((event) => ({ stage, event })),
      ),
    )(
      'observes source $event while $stage is paused',
      async ({ stage, event }) => {
        source = new Readable({ read() {} });
        source.push(Buffer.from('abcdefghi'));
        httpService.get.mockReturnValueOnce(of(response(source)));
        const pending = new Subject<ReturnType<typeof response>>();
        if (stage === 'create') httpService.post.mockReturnValue(pending);
        if (stage === 'sign')
          httpService.get.mockImplementation((url) =>
            url === mediaUrl ? of(response(source)) : NEVER,
          );
        if (stage === 'put') responseDelayMs = 120_000;
        const upload = service.uploadMedia(accessToken, mediaUrl, 'image');
        const failure = expect(upload).rejects.toEqual(
          new Error('Fanvue media upload failed'),
        );
        await vi.waitFor(() => {
          if (stage === 'create')
            expect(httpService.post).toHaveBeenCalledTimes(1);
          if (stage === 'sign')
            expect(httpService.get).toHaveBeenCalledTimes(2);
          if (stage === 'put') expect(httpService.put).toHaveBeenCalledTimes(1);
        });
        if (event === 'error')
          source.destroy(new Error('provider private data'));
        else if (event === 'close') source.destroy();
        else source.emit('aborted');
        await failure;
        expect(httpService.patch).not.toHaveBeenCalled();
        expect(source.destroyed).toBe(true);
        expect(pending.observed).toBe(false);
      },
    );

    it('rejects nonbinary source chunks without a session', async () => {
      source = Readable.from(['not binary'], { objectMode: true });
      httpService.get.mockReturnValueOnce(of(response(source)));
      await expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toEqual(new Error('Fanvue media upload failed'));
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('rejects partial source responses before creating a session', async () => {
      httpService.get.mockReturnValueOnce(
        of({ ...response(source), status: 206 }),
      );
      await expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toEqual(new Error('Fanvue media upload failed'));
      expect(httpService.post).not.toHaveBeenCalled();
      expect(source.destroyed).toBe(true);
    });

    it('fails pre-cancellation without dispatching a source request', async () => {
      const caller = new AbortController();
      caller.abort();
      await expect(
        service.uploadMedia(accessToken, mediaUrl, 'image', caller.signal),
      ).rejects.toEqual(new Error('Fanvue media upload failed'));
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it.each(['create', 'sign', 'put', 'complete'])(
      'cancels pending %s and settles the source',
      async (stage) => {
        const caller = new AbortController();
        if (stage === 'create') httpService.post.mockReturnValue(NEVER);
        if (stage === 'sign')
          httpService.get.mockImplementation((url) =>
            url === mediaUrl ? of(response(source)) : NEVER,
          );
        if (stage === 'put') responseDelayMs = 120_000;
        if (stage === 'complete') httpService.patch.mockReturnValue(NEVER);
        const operation = service.uploadMedia(
          accessToken,
          mediaUrl,
          'image',
          caller.signal,
        );
        const failure = expect(operation).rejects.toEqual(
          new Error('Fanvue media upload failed'),
        );
        await vi.waitFor(() => {
          const count =
            stage === 'create'
              ? httpService.post.mock.calls.length
              : stage === 'sign'
                ? httpService.get.mock.calls.length - 1
                : stage === 'put'
                  ? httpService.put.mock.calls.length
                  : httpService.patch.mock.calls.length;
          expect(count).toBeGreaterThan(0);
        });
        caller.abort();
        await failure;
        expect(source.destroyed).toBe(true);
        if (stage !== 'complete')
          expect(httpService.patch).not.toHaveBeenCalled();
      },
    );

    it.each(['create', 'sign', 'complete'])(
      'owns a 30 second %s deadline',
      async (stage) => {
        vi.useFakeTimers();
        if (stage === 'create') httpService.post.mockReturnValue(NEVER);
        if (stage === 'sign')
          httpService.get.mockImplementation((url) =>
            url === mediaUrl ? of(response(source)) : NEVER,
          );
        if (stage === 'complete') httpService.patch.mockReturnValue(NEVER);
        const operation = service.uploadMedia(accessToken, mediaUrl, 'image');
        const failure = expect(operation).rejects.toEqual(
          new Error('Fanvue media upload failed'),
        );
        await vi.advanceTimersByTimeAsync(30_001);
        await failure;
        expect(source.destroyed).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it('owns a 60 second initial-header deadline', async () => {
      vi.useFakeTimers();
      httpService.get.mockReturnValue(NEVER);
      const failure = expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toEqual(new Error('Fanvue media upload failed'));
      await vi.advanceTimersByTimeAsync(60_001);
      await failure;
      expect(httpService.post).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('owns a 60 second source demand deadline', async () => {
      vi.useFakeTimers();
      source = new Readable({ read() {} });
      httpService.get.mockReturnValueOnce(of(response(source)));
      const failure = expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toEqual(new Error('Fanvue media upload failed'));
      await vi.advanceTimersByTimeAsync(60_001);
      await failure;
      expect(source.destroyed).toBe(true);
      expect(httpService.post).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('rejects missing or empty storage acknowledgements', async () => {
      responseHeaders = '';
      await expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toEqual(new Error('Fanvue media upload failed'));
      expect(httpService.patch).not.toHaveBeenCalled();
    });

    it('exercises the real Axios adapter through a healthy native PUT lasting over 60 seconds', async () => {
      vi.useFakeTimers();
      prepare([Buffer.from('abcdefgh')]);
      httpService.post.mockReturnValue(
        of(response({ ...session, partSize: 8 })),
      );
      byteDelayMs = 10_000;
      const operation = service.uploadMedia(accessToken, mediaUrl, 'image');
      let completed = false;
      void operation.then(() => {
        completed = true;
      });
      await vi.advanceTimersByTimeAsync(70_000);
      expect(completed).toBe(false);
      expect(sentBytes).toBe(7);
      expect(httpService.patch).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10_001);
      expect(await operation).toBe('media-uuid');
      expect(transmitted).toEqual([...Buffer.from('abcdefgh')]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('rejects native PUT socket inactivity without completion', async () => {
      vi.useFakeTimers();
      byteDelayMs = 70_000;
      const failure = expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toEqual(new Error('Fanvue media upload failed'));
      await vi.advanceTimersByTimeAsync(60_001);
      await failure;
      expect(httpService.patch).not.toHaveBeenCalled();
      expect(source.destroyed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('rejects a stalled native connection without completion', async () => {
      vi.useFakeTimers();
      connectionDelayMs = 70_000;
      const failure = expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toEqual(new Error('Fanvue media upload failed'));
      await vi.advanceTimersByTimeAsync(60_001);
      await failure;
      expect(httpService.patch).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('clears inherited auth and cookies at the real Axios/native boundary without mutating defaults', async () => {
      const instance = httpService.axiosRef;
      instance.defaults.auth = {
        username: 'inherited-user',
        password: 'inherited-password',
      };
      instance.defaults.headers.common.Authorization = 'Bearer inherited-token';
      instance.defaults.headers.common.Cookie = 'inherited-cookie';
      instance.defaults.transport = { request: requestHttps };
      const originalTransforms = instance.defaults.transformRequest;
      const realHttp = new HttpService(instance);
      httpService.get.mockImplementation((url, config) =>
        realHttp.get(url, config),
      );
      httpService.post.mockImplementation((url, data, config) =>
        realHttp.post(url, data, config),
      );
      httpService.patch.mockImplementation((url, data, config) =>
        realHttp.patch(url, data, config),
      );
      replyFor = (options) => {
        if (options.hostname === 'cdn.example.com') return 'abcde';
        if (options.method === 'POST') return JSON.stringify(session);
        if (options.method === 'GET') return 'https://storage.example.com/part';
        return '{}';
      };
      expect(await service.uploadMedia(accessToken, mediaUrl, 'image')).toBe(
        'media-uuid',
      );
      for (const options of nativeOptions) {
        expect(options.auth).toBeUndefined();
        expect(options.headers).not.toHaveProperty('Cookie');
        expect(options.headers).not.toHaveProperty('cookie');
        if (options.hostname === 'api.fanvue.com') {
          expect(options.headers).toHaveProperty(
            'Authorization',
            `Bearer ${accessToken}`,
          );
        } else {
          expect(options.headers).not.toHaveProperty('Authorization');
          expect(options.headers).not.toHaveProperty('authorization');
        }
      }
      const createIndex = nativeOptions.findIndex(
        (options) => options.method === 'POST',
      );
      expect(
        JSON.parse(Buffer.concat(wires[createIndex].bytes).toString()),
      ).toEqual({
        filename: 'photo.jpg',
        name: 'photo.jpg',
        mediaType: 'image',
      });
      expect(instance.defaults.auth).toEqual({
        username: 'inherited-user',
        password: 'inherited-password',
      });
      expect(instance.defaults.headers.common.Authorization).toBe(
        'Bearer inherited-token',
      );
      expect(instance.defaults.headers.common.Cookie).toBe('inherited-cookie');
      expect(instance.defaults.transformRequest).toBe(originalTransforms);
    });

    it('isolates two interleaved account tokens and completion state', async () => {
      const otherUrl = 'https://cdn.example.com/media/other.mp4';
      const otherSource = Readable.from([Buffer.from('VWXYZ')], {
        objectMode: false,
      });
      httpService.get.mockImplementation((url) => {
        if (url === mediaUrl) return of(response(source));
        if (url === otherUrl) return of(response(otherSource));
        return of(response('https://storage.example.com/part'));
      });
      httpService.post.mockImplementation((_url, _data, config) =>
        of(
          response({
            ...session,
            uploadId:
              config?.headers?.Authorization === 'Bearer account-B'
                ? 'upload-B'
                : 'upload-A',
            mediaUuid:
              config?.headers?.Authorization === 'Bearer account-B'
                ? 'media-B'
                : 'media-A',
          }),
        ),
      );
      const results = await Promise.all([
        service.uploadMedia('account-A', mediaUrl, 'image'),
        service.uploadMedia('account-B', otherUrl, 'video'),
      ]);
      expect(results).toEqual(['media-A', 'media-B']);
      for (const [url, , config] of httpService.patch.mock.calls) {
        const expected = url.endsWith('upload-A') ? 'account-A' : 'account-B';
        expect(config?.headers?.Authorization).toBe(`Bearer ${expected}`);
      }
      expect(httpService.patch).toHaveBeenCalledTimes(2);
      expect(sentBytes).toBe(14);
    });

    it('does not mutate the part after an early accepted response while native writes are pending', async () => {
      vi.useFakeTimers();
      earlyResponse = true;
      let pulls = 0;
      function* chunks() {
        for (const text of ['abcd', 'efgh', 'ijkl']) {
          pulls++;
          yield Buffer.from(text);
        }
      }
      prepare(chunks());
      byteDelayMs = 10_000;
      const operation = service.uploadMedia(accessToken, mediaUrl, 'image');
      await vi.advanceTimersByTimeAsync(20_000);
      expect(sentBytes).toBe(2);
      expect(pulls).toBeLessThanOrEqual(2);
      expect(httpService.put).toHaveBeenCalledTimes(1);
      expect(httpService.get).toHaveBeenCalledTimes(2);
      const first = httpService.put.mock.calls[0][1];
      expect(first).toEqual(Buffer.from('abcd'));
      await vi.advanceTimersByTimeAsync(100_001);
      expect(await operation).toBe('media-uuid');
      expect(transmitted).toEqual([...Buffer.from('abcdefghijkl')]);
      expect(pulls).toBe(3);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['create', 'sign', 'put', 'complete'])(
      'exposes a fresh stable error and bounded log on %s failure',
      async (stage) => {
        const providerError = Object.assign(
          new Error('private URL token filename and provider body'),
          {
            response: { status: 503, data: { private: 'provider body' } },
          },
        );
        const fail = throwError(() => providerError);
        if (stage === 'create') httpService.post.mockReturnValue(fail);
        if (stage === 'sign')
          httpService.get.mockImplementation((url) =>
            url === mediaUrl ? of(response(source)) : fail,
          );
        if (stage === 'put') httpService.put.mockReturnValue(fail);
        if (stage === 'complete') httpService.patch.mockReturnValue(fail);
        const operation = service.uploadMedia(accessToken, mediaUrl, 'image');
        await expect(operation).rejects.toEqual(
          new Error('Fanvue media upload failed'),
        );
        await expect(operation).rejects.not.toHaveProperty('cause');
        await expect(operation).rejects.not.toBe(providerError);
        expect(loggerService.error).toHaveBeenCalledExactlyOnceWith(
          'Fanvue media upload failed',
          { stage, httpCode: 503 },
        );
        expect(source.destroyed).toBe(true);
      },
    );

    it('cancels an active source demand and removes the caller listener', async () => {
      source = new Readable({ read() {} });
      httpService.get.mockReturnValueOnce(of(response(source)));
      const caller = new AbortController();
      const removed = vi.spyOn(caller.signal, 'removeEventListener');
      const operation = service.uploadMedia(
        accessToken,
        mediaUrl,
        'image',
        caller.signal,
      );
      const failure = expect(operation).rejects.toEqual(
        new Error('Fanvue media upload failed'),
      );
      await vi.waitFor(() => expect(httpService.get).toHaveBeenCalledTimes(1));
      caller.abort();
      await failure;
      expect(source.destroyed).toBe(true);
      expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(httpService.post).not.toHaveBeenCalled();
      removed.mockRestore();
    });

    it('waits for an accepted response after native request finish before consuming another part', async () => {
      vi.useFakeTimers();
      prepare([Buffer.from('abcdefghijkl')]);
      responseDelayMs = 50_000;
      const operation = service.uploadMedia(accessToken, mediaUrl, 'image');
      await vi.advanceTimersByTimeAsync(40_000);
      expect(httpService.put).toHaveBeenCalledTimes(1);
      expect(httpService.put.mock.calls[0][1]).toEqual(Buffer.from('abcd'));
      expect(sentBytes).toBe(4);
      expect(httpService.patch).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(110_001);
      expect(await operation).toBe('media-uuid');
      expect(transmitted).toEqual([...Buffer.from('abcdefghijkl')]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('transfers over 100 MiB from reusable chunks to a nonretaining native sink', async () => {
      const chunk = Buffer.alloc(64 * 1024, 73);
      const chunkCount = 1601;
      function* chunks() {
        for (let i = 0; i < chunkCount; i++) yield chunk;
      }
      retainBytes = false;
      prepare(chunks());
      httpService.post.mockReturnValue(
        of(response({ ...session, partSize: 1024 * 1024, maxParts: 102 })),
      );
      expect(await service.uploadMedia(accessToken, mediaUrl, 'video')).toBe(
        'media-uuid',
      );
      expect(sentBytes).toBe(chunkCount * chunk.length);
      expect(sentBytes).toBeGreaterThan(100 * 1024 * 1024);
      expect(allBytesCorrect).toBe(true);
      const uploadedBuffers = httpService.put.mock.calls
        .map((call) => call[1])
        .filter(Buffer.isBuffer);
      expect(uploadedBuffers).toHaveLength(101);
      expect(new Set(uploadedBuffers.map((body) => body.buffer)).size).toBe(1);
      expect(bodies).toEqual([]);
      expect(httpService.put).toHaveBeenCalledTimes(101);
      expect(httpService.patch).toHaveBeenCalledTimes(1);
    });
  });

  describe('createPost', () => {
    const orgId = 'test-object-id';
    const brandId = 'test-object-id';

    it('should create a post successfully', async () => {
      // Mock refreshToken internals
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const mockCredential = {
        id: 'test-object-id',
        accessToken: 'encrypted-token',
        accessTokenExpiry: futureDate,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);

      const mockPostResponse = {
        content: 'Hello Fanvue!',
        createdAt: '2024-01-01T00:00:00Z',
        uuid: 'post-uuid-123',
        visibility: 'public',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockPostResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.createPost(orgId, brandId, 'Hello Fanvue!');

      expect(result).toEqual(mockPostResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.fanvue.com/posts',
        expect.objectContaining({
          content: 'Hello Fanvue!',
          isLocked: false,
          price: 0,
          visibility: 'public',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Fanvue-API-Version': '2025-06-26',
          }),
        }),
      );
    });

    it('should include mediaUuids when provided', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const mockCredential = {
        id: 'test-object-id',
        accessToken: 'encrypted-token',
        accessTokenExpiry: futureDate,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);

      const mockPostResponse = {
        content: 'Post with media',
        createdAt: '2024-01-01T00:00:00Z',
        uuid: 'post-uuid-456',
        visibility: 'public',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockPostResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.createPost(orgId, brandId, 'Post with media', [
        'media-1',
        'media-2',
      ]);

      const postBody = httpService.post.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(postBody.mediaUuids).toEqual(['media-1', 'media-2']);
    });

    it('should not include mediaUuids when not provided', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const mockCredential = {
        id: 'test-object-id',
        accessToken: 'encrypted-token',
        accessTokenExpiry: futureDate,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: {
            content: 'Text only',
            createdAt: '',
            uuid: 'uuid',
            visibility: 'public',
          },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.createPost(orgId, brandId, 'Text only');

      const postBody = httpService.post.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(postBody.mediaUuids).toBeUndefined();
    });

    it('should throw when refreshToken fails (credential not found)', async () => {
      credentialsService.findOne.mockResolvedValue(null as never);

      await expect(
        service.createPost(orgId, brandId, 'Content'),
      ).rejects.toThrow('Fanvue credential not found');
    });

    it('should throw and log error when post creation API fails', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const mockCredential = {
        id: 'test-object-id',
        accessToken: 'encrypted-token',
        accessTokenExpiry: futureDate,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      httpService.post.mockReturnValue(
        throwError(() => new Error('Post creation failed')),
      );

      await expect(
        service.createPost(orgId, brandId, 'Content'),
      ).rejects.toThrow('Post creation failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});

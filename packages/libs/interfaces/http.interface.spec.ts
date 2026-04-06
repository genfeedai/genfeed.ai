import type {
  HttpServer,
  RequestHandler,
  RequestWithBody,
  ResponseObject,
} from '@libs/interfaces/http.interface';

describe('HttpInterface', () => {
  describe('HttpServer', () => {
    it('should have get, post, and use methods', () => {
      const server: HttpServer = {
        get: vi.fn(),
        post: vi.fn(),
        use: vi.fn(),
      };

      const handler: RequestHandler = vi.fn();
      server.get('/path', handler);
      server.post('/path', handler);
      server.use(handler);

      expect(server.get).toHaveBeenCalledWith('/path', handler);
      expect(server.post).toHaveBeenCalledWith('/path', handler);
      expect(server.use).toHaveBeenCalledWith(handler);
    });

    it('should allow additional server methods', () => {
      const server: HttpServer = {
        delete: vi.fn(),
        get: vi.fn(),
        listen: vi.fn(),
        patch: vi.fn(),
        post: vi.fn(),
        use: vi.fn(),
      } as any;

      expect(server.patch).toBeDefined();
      expect(server.delete).toBeDefined();
      expect(server.listen).toBeDefined();
    });
  });

  describe('RequestHandler', () => {
    it('should be callable with req and res', () => {
      const handler: RequestHandler = (_req, res) => {
        res.status(200);
      };

      const req = {};
      const res = { status: vi.fn().mockReturnThis() };
      handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should optionally accept next parameter', () => {
      const handler: RequestHandler = (_req, _res, next) => {
        if (next) {
          next();
        }
      };

      const req = {};
      const res = {};
      const next = vi.fn();
      void handler(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('RequestWithBody', () => {
    it('should have required request properties', () => {
      const request: RequestWithBody = {
        body: { test: 'data' },
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        query: { id: '123' },
        route: { path: '/api/test' },
        url: '/api/test',
        user: { id: 'user_123' },
      };

      expect(request.body).toEqual({ test: 'data' });
      expect(request.headers).toEqual({ 'content-type': 'application/json' });
      expect(request.method).toBe('POST');
      expect(request.url).toBe('/api/test');
      expect(request.query).toEqual({ id: '123' });
      expect(request.route?.path).toBe('/api/test');
      expect(request.user?.id).toBe('user_123');
    });

    it('should allow optional route and user properties', () => {
      const request: RequestWithBody = {
        body: {},
        headers: {},
        method: 'GET',
        query: {},
        url: '/api/test',
      };

      expect(request.route).toBeUndefined();
      expect(request.user).toBeUndefined();
    });
  });

  describe('ResponseObject', () => {
    it('should have status, json, and send methods', () => {
      const response: ResponseObject = {
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      };

      response.status(200).json({ success: true });
      response.send('OK');

      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith({ success: true });
      expect(response.send).toHaveBeenCalledWith('OK');
    });

    it('should allow chaining methods', () => {
      const response: ResponseObject = {
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      };

      const result = response.status(201).json({ id: '123' });

      expect(result).toBe(response);
    });
  });
});

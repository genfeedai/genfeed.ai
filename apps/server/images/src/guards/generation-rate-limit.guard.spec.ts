import type { ExecutionContext } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { GenerationRateLimitGuard } from './generation-rate-limit.guard';

const createContext = (request: Partial<Request>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request as Request,
    }),
  }) as ExecutionContext;

describe('GenerationRateLimitGuard', () => {
  it('allows the first ten requests for one token', () => {
    const guard = new GenerationRateLimitGuard();
    const context = createContext({
      headers: { authorization: 'Bearer token-a' },
      ip: '10.0.0.1',
    });

    for (let index = 0; index < 10; index += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('rejects the eleventh request in the same window', () => {
    const guard = new GenerationRateLimitGuard();
    const context = createContext({
      headers: { authorization: 'Bearer token-a' },
      ip: '10.0.0.1',
    });

    for (let index = 0; index < 10; index += 1) {
      guard.canActivate(context);
    }

    expect(() => guard.canActivate(context)).toThrow(HttpException);
  });

  it('tracks bearer tokens independently', () => {
    const guard = new GenerationRateLimitGuard();
    const tokenA = createContext({
      headers: { authorization: 'Bearer token-a' },
      ip: '10.0.0.1',
    });
    const tokenB = createContext({
      headers: { authorization: 'Bearer token-b' },
      ip: '10.0.0.1',
    });

    for (let index = 0; index < 10; index += 1) {
      guard.canActivate(tokenA);
    }

    expect(guard.canActivate(tokenB)).toBe(true);
  });

  it('uses the first forwarded IP when no token is present', () => {
    const guard = new GenerationRateLimitGuard();
    const forwardedIp = createContext({
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.2' },
      ip: '10.0.0.1',
    });
    const sameForwardedIp = createContext({
      headers: { 'x-forwarded-for': '203.0.113.10' },
      ip: '10.0.0.9',
    });

    for (let index = 0; index < 10; index += 1) {
      guard.canActivate(forwardedIp);
    }

    expect(() => guard.canActivate(sameForwardedIp)).toThrow(HttpException);
  });

  it('uses HTTP 429 for rate limit rejections', () => {
    const guard = new GenerationRateLimitGuard();
    const context = createContext({
      headers: { authorization: 'Bearer token-a' },
      ip: '10.0.0.1',
    });

    for (let index = 0; index < 10; index += 1) {
      guard.canActivate(context);
    }

    try {
      guard.canActivate(context);
      throw new Error('Expected rate limit exception');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });
});

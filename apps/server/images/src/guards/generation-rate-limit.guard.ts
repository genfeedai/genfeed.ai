import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60000;
const LIMIT = 10;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class GenerationRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = this.getRateLimitKey(request);
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    if (bucket.count >= LIMIT) {
      throw new HttpException(
        'Image generation rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    return true;
  }

  private getRateLimitKey(request: Request): string {
    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.length > 0) {
      return `token:${authHeader}`;
    }

    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      return `ip:${forwardedFor.split(',')[0].trim()}`;
    }

    return `ip:${request.ip ?? 'unknown'}`;
  }
}

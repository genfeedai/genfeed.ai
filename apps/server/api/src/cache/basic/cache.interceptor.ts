import { CacheService } from '@api/services/cache/services/cache.service';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class ClearCacheInterceptor implements NestInterceptor {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly loggerService = new Logger(ClearCacheInterceptor.name);
  constructor(private readonly cacheService: CacheService) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> | Promise<Observable<unknown>> {
    return next.handle().pipe(
      tap(() => {
        this.cacheService
          .flush()
          .then(() => {
            this.loggerService.log(`Cleared cache`);
          })
          .catch((error: unknown) => {
            this.loggerService.error(`${this.constructorName} failed`, error);
          });
      }),
    );
  }
}

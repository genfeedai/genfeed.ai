import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import { ActivitySource } from '@genfeedai/enums';
import type { CreditsConfig } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

type DeferredCreditsConfig = CreditsConfig & {
  maxOverdraftCredits?: number;
};

@Injectable()
export class CreditsInterceptor implements NestInterceptor {
  constructor(
    private creditDeductionQueueService: CreditDeductionQueueService,
    private loggerService: LoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const initialCreditsConfig: DeferredCreditsConfig | undefined =
      request.creditsConfig;

    if (!initialCreditsConfig) {
      return next.handle(); // No credits to deduct
    }

    const user = request.user;
    if (!user) {
      return next.handle();
    }

    const publicMetadata: IClerkPublicMetadata = user.publicMetadata;

    return next.handle().pipe(
      tap({
        error: () => {
          const currentCreditsConfig: DeferredCreditsConfig | undefined =
            request.creditsConfig;

          // Don't deduct credits if the operation failed
          this.loggerService.debug('Operation failed, credits not deducted', {
            amount: currentCreditsConfig?.amount,
            organizationId: publicMetadata.organization,
          });
        },
        next: () => {
          const currentCreditsConfig: DeferredCreditsConfig | undefined =
            request.creditsConfig;

          if (
            !currentCreditsConfig ||
            currentCreditsConfig.amount === undefined ||
            currentCreditsConfig.deferred === true ||
            (currentCreditsConfig.amount ?? 0) <= 0
          ) {
            this.loggerService.debug(
              'Credits deduction skipped: no finalized credits config',
              {
                organizationId: publicMetadata.organization,
              },
            );
            return;
          }

          if (currentCreditsConfig.isByokBypass) {
            void this.creditDeductionQueueService.queueByokUsage({
              amount: currentCreditsConfig.amount || 0,
              description: currentCreditsConfig.description,
              organizationId: publicMetadata.organization,
              source: currentCreditsConfig.source || ActivitySource.SCRIPT,
              type: 'record-byok-usage',
            });
          } else {
            void this.creditDeductionQueueService.queueDeduction({
              amount: currentCreditsConfig.amount || 0,
              description: currentCreditsConfig.description,
              maxOverdraftCredits: currentCreditsConfig.maxOverdraftCredits,
              organizationId: publicMetadata.organization,
              source: currentCreditsConfig.source || ActivitySource.SCRIPT,
              type: 'deduct-credits',
              userId: publicMetadata.user,
            });
          }

          this.loggerService.log('Credit deduction job queued', {
            amount: currentCreditsConfig.amount!,
            description: currentCreditsConfig.description,
            isByokBypass: currentCreditsConfig.isByokBypass,
            userId: user.id,
          });
        },
      }),
    );
  }
}

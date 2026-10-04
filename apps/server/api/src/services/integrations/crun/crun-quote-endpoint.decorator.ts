import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { MemberRole, type ModelCategory } from '@genfeedai/contracts';
import { CrunGenerationQuoteSerializer } from '@genfeedai/serializers';
import {
  applyDecorators,
  HttpCode,
  Post,
  SetMetadata,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

/** Route, roles, guards, rate limit and validation shared by both Crun quote endpoints. */
export function CrunQuoteEndpoint(category: ModelCategory): MethodDecorator {
  return applyDecorators(
    Post('crun-quote'),
    HttpCode(200),
    SetMetadata('roles', [
      'superadmin',
      MemberRole.OWNER,
      MemberRole.ADMIN,
      MemberRole.CREATOR,
    ]),
    ValidateModel({ category }),
    UseGuards(SubscriptionGuard, ModelsGuard),
    RateLimit({ limit: 30, scope: 'organization', windowMs: 60000 }),
    UsePipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ),
  );
}

export function serializeCrunQuote(
  request: RequestWithContext,
  record: unknown,
) {
  return serializeSingle(request, CrunGenerationQuoteSerializer, record);
}

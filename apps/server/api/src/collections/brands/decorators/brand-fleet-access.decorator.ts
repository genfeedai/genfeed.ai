import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

/**
 * Fleet is provisioned by Genfeed staff for a customer, so only a superadmin
 * may set `isFleetEnabled` on a brand. For everyone else the field is dropped
 * from the request body before validation and the write.
 */
@Injectable()
export class BrandFleetFlagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const body = request.body as Record<string, unknown> | undefined;

    if (
      body &&
      'isFleetEnabled' in body &&
      !getIsSuperAdmin(request.user, request)
    ) {
      delete body.isFleetEnabled;
    }

    return next.handle();
  }
}

/** Class-level access for the brands controller: roles plus the Fleet guard. */
export const BrandFleetAccess = () =>
  applyDecorators(
    UseGuards(RolesGuard),
    UseInterceptors(BrandFleetFlagInterceptor),
  );

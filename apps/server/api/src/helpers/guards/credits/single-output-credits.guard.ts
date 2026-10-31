import type { CreditsGuardRequest } from '@api/helpers/guards/credits/credits.guard';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';

/**
 * Pins credit admission to one output for routes that always produce exactly
 * one result. CreditsGuard otherwise reads `outputs` from the raw request body
 * before DTO validation, so a client-supplied value could make the reservation
 * differ from the single-output quote. Register it before CreditsGuard.
 */
@Injectable()
export class SingleOutputCreditsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<CreditsGuardRequest>();
    request.creditsOutputCount = 1;
    return true;
  }
}

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { hashToken } from '@api/auth/shared/pkce.util';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ClaimTrialCardDto } from '@api/services/integrations/stripe/dto/claim-trial-card.dto';
import { CreateTrialCardCheckoutDto } from '@api/services/integrations/stripe/dto/create-trial-card-checkout.dto';
import {
  BillingAccountResolutionError,
  OrganizationBillingAccountService,
} from '@api/services/integrations/stripe/services/organization-billing-account.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { BillingAccountMemberRole } from '@genfeedai/contracts';
import type {
  ITrialClaimResponse,
  ITrialClaimStatusResponse,
} from '@genfeedai/contracts/interfaces/billing';
import { StripeUrlSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

function readRequestOrigin(request: Request): string | undefined {
  const origin = request.headers.origin;
  if (typeof origin !== 'string') {
    return undefined;
  }
  const trimmed = origin.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The 75 trial credits are released against a saved card: no charge is made,
 * and one physical card unlocks the credits for one account. The card is saved
 * through Stripe Checkout in setup mode, then claimed here. Virtual and
 * disposable cards mint fresh fingerprints, so this raises the cost of farming
 * the credits rather than ending it.
 */
@AutoSwagger()
@Controller('services/stripe/trial-card')
@UseGuards(RolesGuard)
export class TrialCardController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly billingAccountService: OrganizationBillingAccountService,
    private readonly billingAccountsService: BillingAccountsService,
    private readonly onboardingCreditGrantsService: OnboardingCreditGrantsService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('status')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60000 })
  async getStatus(
    @CurrentUser() user: User,
  ): Promise<ITrialClaimStatusResponse> {
    return {
      status: await this.onboardingCreditGrantsService.getTrialClaimStatus(
        user.organizationId,
        user.id,
      ),
    };
  }

  @Post('checkout')
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60000 })
  async createCardSetup(
    @CurrentUser() user: User,
    @Body() dto: CreateTrialCardCheckoutDto,
    @Req() request: Request,
  ) {
    const origin = readRequestOrigin(request);
    if (!origin) {
      throw new BadRequestException('Origin is required');
    }
    const returnPath = dto.returnPath ?? '/';
    const stripeCustomerId = await this.resolveStripeCustomerId(user);

    try {
      const session = await this.stripeService.createTrialCardSetupSession({
        cancelUrl: `${origin}${returnPath}`,
        organizationId: user.organizationId,
        stripeCustomerId,
        successUrl: `${origin}${returnPath}${returnPath.includes('?') ? '&' : '?'}trialCard=success&session_id={CHECKOUT_SESSION_ID}`,
      });
      return serializeSingle(request, StripeUrlSerializer, session);
    } catch {
      throw new ServiceUnavailableException(
        'Card setup is temporarily unavailable',
      );
    }
  }

  @Post('claim')
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60000 })
  async claim(
    @CurrentUser() user: User,
    @Body() dto: ClaimTrialCardDto,
    @Req() request: Request,
  ): Promise<ITrialClaimResponse> {
    const stripeCustomerId = await this.resolveStripeCustomerId(user);
    const dbUser = await this.usersService.findOne({ id: user.id });
    if (!dbUser) {
      throw new NotFoundException('User', user.id);
    }

    let fingerprint: string | null;
    try {
      fingerprint = await this.stripeService.getTrialCardFingerprint(
        dto.sessionId,
        stripeCustomerId,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Card verification is temporarily unavailable',
      );
    }
    if (!fingerprint) {
      return { outcome: 'card-not-verified' };
    }

    const outcome = await this.onboardingCreditGrantsService.claimTrialCredits(
      user.organizationId,
      dbUser.id.toString(),
      { cardKey: hashToken(fingerprint), ipAddress: request.ip },
    );
    return { outcome };
  }

  private async resolveStripeCustomerId(user: User): Promise<string> {
    const dbUser = await this.usersService.findOne({ id: user.id });
    if (!dbUser) {
      throw new NotFoundException('User', user.id);
    }
    const organization = await this.organizationsService.findOne({
      id: user.organizationId,
      isDeleted: false,
    });
    if (!organization) {
      throw new NotFoundException('Organization', user.organizationId);
    }
    const email = user.emailAddresses?.[0]?.emailAddress ?? dbUser.email;
    if (!email) {
      throw new BadRequestException('User email is required');
    }

    await this.billingAccountsService.ensureForOrganization({
      label: organization.label,
      organizationId: user.organizationId,
      userId: dbUser.id.toString(),
    });
    const domainAccount =
      await this.billingAccountsService.resolveForOrganization(
        user.organizationId,
      );
    await this.billingAccountsService.requireRole(
      domainAccount.id,
      dbUser.id.toString(),
      BillingAccountMemberRole.ADMINISTRATOR,
    );
    try {
      const billingAccount =
        await this.billingAccountService.resolveOrProvision({
          billingAccountId: domainAccount.id,
          billingEmail: email,
          organizationId: user.organizationId,
          organizationLabel: organization.label,
          userId: dbUser.id.toString(),
        });
      return billingAccount.stripeCustomerId;
    } catch (error: unknown) {
      if (error instanceof BillingAccountResolutionError) {
        this.loggerService.warn('Trial card billing identity unavailable', {
          category: error.category,
          code: error.code,
        });
        throw new ServiceUnavailableException(
          'Billing account is temporarily unavailable',
        );
      }
      throw error;
    }
  }
}

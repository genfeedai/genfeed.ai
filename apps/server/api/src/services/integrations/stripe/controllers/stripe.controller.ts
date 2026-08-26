import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { CreateCheckoutSessionDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import { UsersService } from '@api/collections/users/services/users.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  returnBadRequest,
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  BillingAccountResolutionError,
  OrganizationBillingAccountService,
} from '@api/services/integrations/stripe/services/organization-billing-account.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import { isEEEnabled } from '@genfeedai/config';
import {
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { StripeUrlSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/stripe')
@UseGuards(RolesGuard)
export class StripeController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly stripeService: StripeService,
    @Inject(SUBSCRIPTIONS_SERVICE)
    private readonly subscriptionsService: ISubscriptionsService,
    private readonly usersService: UsersService,
    private readonly loggerService: LoggerService,
    private readonly organizationsService: OrganizationsService,
    private readonly lifecycleEmailService: LifecycleEmailService,
    private readonly billingAccountService: OrganizationBillingAccountService,
  ) {}

  /**
   * An organization owns exactly one Stripe customer. The subscription's
   * `stripeCustomerId` is a derived projection; the org's `customers` row is
   * authoritative. Treating a projection gap as "no Stripe customer" is what
   * duplicated org customers on Stripe.
   */
  private async resolveOrgStripeCustomerId(
    organizationId: string,
    subscription: { stripeCustomerId?: string | null },
  ): Promise<string | null> {
    const account = await this.billingAccountService.resolveExisting(
      organizationId,
      subscription,
    );
    return account.stripeCustomerId;
  }

  @Post('checkout')
  async createCheckoutSession(
    @CurrentUser() user: User,
    @Body() createCheckoutSessionDto: CreateCheckoutSessionDto,
    @Req() request: Request,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { ...createCheckoutSessionDto });

    const origin = request.headers.origin;
    if (!origin) {
      return returnBadRequest({
        message: 'Origin is required',
        success: false,
      });
    }

    try {
      const { stripePriceId, quantity } = createCheckoutSessionDto;
      const { emailAddresses } = user;

      const email = emailAddresses?.[0]?.emailAddress;

      if (!email) {
        return returnBadRequest({
          message: 'User email is required for checkout',
          success: false,
        });
      }

      // Load the current user's DB record by id.
      // Post-Better-Auth cutover, user.id is the Genfeed User.id (JWT sub),
      // not a legacy external auth-provider id.
      const dbUser = await this.usersService.findOne({
        id: user.id,
      });
      if (!dbUser) {
        return returnNotFound('User', user.id);
      }

      let subscription = await this.subscriptionsService.findByOrganizationId(
        user.organizationId,
      );

      const organization = await this.organizationsService.findOne({
        id: user.organizationId,
        isDeleted: false,
      });
      if (!organization) {
        return returnNotFound('Organization', user.organizationId);
      }

      const billingAccount =
        await this.billingAccountService.resolveOrProvision({
          billingEmail: email,
          organizationId: user.organizationId,
          organizationLabel: organization.label,
          stripeCustomerId: subscription?.stripeCustomerId,
          userId: dbUser.id.toString(),
        });

      if (!subscription) {
        subscription = await this.subscriptionsService.createForOrganization(
          organization,
          email,
          dbUser.id.toString(),
        );
      }

      const redirectUrls =
        createCheckoutSessionDto.successUrl &&
        createCheckoutSessionDto.cancelUrl
          ? {
              cancel: createCheckoutSessionDto.cancelUrl,
              success: createCheckoutSessionDto.successUrl,
            }
          : undefined;

      const stripeCustomerId = billingAccount.stripeCustomerId;

      if (subscription.customerId !== billingAccount.customerId) {
        await this.subscriptionsService.patch(subscription.id, {
          customerId: billingAccount.customerId,
        });
      }

      if (!stripeCustomerId) {
        return returnBadRequest({
          message: 'Subscription is missing stripeCustomerId',
          success: false,
        });
      }

      const result = await this.stripeService.createPaymentSession(
        stripeCustomerId,
        stripePriceId,
        origin,
        quantity,
        redirectUrls,
        { organizationId: user.organizationId },
      );

      await this.lifecycleEmailService.recordCheckoutStarted({
        checkoutSessionId: result.id,
        checkoutUrl: result.url,
        organizationId: user.organizationId,
        source: 'organization-checkout',
        userId: dbUser.id.toString(),
      });

      return serializeSingle(request, StripeUrlSerializer, result);
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (error instanceof BillingAccountResolutionError) {
        this.loggerService.warn(`${url} billing identity unavailable`, {
          category: error.category,
          code: error.code,
        });
      }
      return returnBadRequest({
        message: 'Failed to create checkout session',
        success: false,
      });
    }
  }

  @Post('setup-intent')
  async createSetupCheckout(
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    if (!user.organizationId) {
      return returnBadRequest({
        message: 'Organization is required',
        success: false,
      });
    }

    const origin = request.headers.origin;
    if (!origin) {
      return returnBadRequest({
        message: 'Origin is required',
        success: false,
      });
    }

    try {
      const { emailAddresses } = user;
      const email = emailAddresses?.[0]?.emailAddress;

      if (!email) {
        return returnBadRequest({
          message: 'User email is required',
          success: false,
        });
      }

      const dbUser = await this.usersService.findOne({
        id: user.id,
      });
      if (!dbUser) {
        return returnNotFound('User', user.id);
      }

      let subscription = await this.subscriptionsService.findByOrganizationId(
        user.organizationId,
      );

      const organization = await this.organizationsService.findOne({
        id: user.organizationId,
        isDeleted: false,
      });
      if (!organization) {
        return returnNotFound('Organization', user.organizationId);
      }

      const billingAccount =
        await this.billingAccountService.resolveOrProvision({
          billingEmail: email,
          organizationId: user.organizationId,
          organizationLabel: organization.label,
          stripeCustomerId: subscription?.stripeCustomerId,
          userId: dbUser.id.toString(),
        });

      if (!subscription) {
        subscription = await this.subscriptionsService.createForOrganization(
          organization,
          email,
          dbUser.id.toString(),
        );
      }
      if (subscription.customerId !== billingAccount.customerId) {
        await this.subscriptionsService.patch(subscription.id, {
          customerId: billingAccount.customerId,
        });
      }

      const result = await this.stripeService.createSetupCheckoutSession(
        billingAccount.stripeCustomerId,
        `${origin}/agent/onboarding`,
        `${origin}${isEEEnabled() ? '/onboarding/providers' : '/onboarding/brand'}`,
      );

      return serializeSingle(request, StripeUrlSerializer, result);
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      return returnBadRequest({
        message: 'Failed to create setup checkout session',
        success: false,
      });
    }
  }

  /**
   * Stripe's `return_url` must be absolute, so it is always composed from the
   * trusted request origin. A caller-supplied `returnPath` only contributes the
   * path — anything that could escape the origin (scheme, protocol-relative
   * `//host`, backslash) is discarded rather than trusted.
   */
  private resolvePortalReturnUrl(origin: string, returnPath?: string): string {
    const isOriginRelative =
      returnPath?.startsWith('/') === true &&
      !returnPath.startsWith('//') &&
      !returnPath.includes('\\');

    return isOriginRelative ? `${origin}${returnPath}` : origin;
  }

  @Get('portal')
  async getBillingPortalUrl(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Query('returnPath') returnPath?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    if (!user.organizationId) {
      return returnNotFound('Organization', 'user');
    }

    const origin = request.headers.origin;

    if (!origin) {
      return returnBadRequest({
        message: 'Origin is required',
        success: false,
      });
    }

    try {
      // Find organization subscription
      const subscription = await this.subscriptionsService.findByOrganizationId(
        user.organizationId,
      );

      if (!subscription) {
        return returnNotFound('Subscription', user.organizationId);
      }
      const stripeCustomerId = await this.resolveOrgStripeCustomerId(
        user.organizationId,
        subscription,
      );
      if (!stripeCustomerId) {
        return returnBadRequest({
          message: 'Subscription is missing stripeCustomerId',
          success: false,
        });
      }

      const billingUrl = await this.stripeService.getBillingPortalUrl(
        stripeCustomerId,
        this.resolvePortalReturnUrl(origin, returnPath),
      );

      return serializeSingle(request, StripeUrlSerializer, billingUrl);
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      const category =
        error instanceof BillingAccountResolutionError
          ? error.category
          : 'provider_rejected';
      this.loggerService.error(`${url} billing portal unavailable`, {
        category,
      });
      if (
        error instanceof BillingAccountResolutionError &&
        error.code !== 'billing_provider_unavailable'
      ) {
        return returnBadRequest({
          code: error.code,
          message: 'Billing account needs repair before the portal can open',
          success: false,
        });
      }
      throw new ServiceUnavailableException({
        code: 'billing_provider_unavailable',
        message: 'Billing portal is temporarily unavailable',
      });
    }
  }
}

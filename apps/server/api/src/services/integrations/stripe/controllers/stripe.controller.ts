import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { CreateCheckoutSessionDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import { UsersService } from '@api/collections/users/services/users.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  returnBadRequest,
  returnInternalServerError,
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
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
  Req,
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
  ) {}

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

      const publicMetadata = getPublicMetadata(user);
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
        _id: user.id,
        isDeleted: false,
      });
      if (!dbUser) {
        return returnNotFound('User', user.id);
      }

      let subscription = await this.subscriptionsService.findByOrganizationId(
        publicMetadata.organization,
      );

      if (!subscription) {
        const organization = await this.organizationsService.findOne({
          _id: publicMetadata.organization,
          isDeleted: false,
        });

        if (!organization) {
          return returnNotFound('Organization', publicMetadata.organization);
        }

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
      if (!subscription.stripeCustomerId) {
        return returnBadRequest({
          message: 'Subscription is missing stripeCustomerId',
          success: false,
        });
      }

      const result = await this.stripeService.createPaymentSession(
        subscription.stripeCustomerId,
        stripePriceId,
        origin,
        quantity,
        redirectUrls,
      );

      await this.lifecycleEmailService.recordCheckoutStarted({
        checkoutSessionId: result.id,
        checkoutUrl: result.url,
        organizationId: publicMetadata.organization,
        source: 'organization-checkout',
        userId: dbUser.id.toString(),
      });

      return serializeSingle(request, StripeUrlSerializer, result);
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      return returnBadRequest({
        error: (error as Error)?.message,
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

    const publicMetadata = getPublicMetadata(user);

    if (!publicMetadata.organization) {
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
        _id: user.id,
        isDeleted: false,
      });
      if (!dbUser) {
        return returnNotFound('User', user.id);
      }

      let subscription = await this.subscriptionsService.findByOrganizationId(
        publicMetadata.organization,
      );

      if (!subscription) {
        const organization = await this.organizationsService.findOne({
          _id: publicMetadata.organization,
          isDeleted: false,
        });

        if (!organization) {
          return returnNotFound('Organization', publicMetadata.organization);
        }

        subscription = await this.subscriptionsService.createForOrganization(
          organization,
          email,
          dbUser.id.toString(),
        );
      }
      if (!subscription.stripeCustomerId) {
        return returnBadRequest({
          message: 'Subscription is missing stripeCustomerId',
          success: false,
        });
      }

      const result = await this.stripeService.createSetupCheckoutSession(
        subscription.stripeCustomerId,
        `${origin}/agent/onboarding`,
        `${origin}${isEEEnabled() ? '/onboarding/providers' : '/onboarding/brand'}`,
      );

      return serializeSingle(request, StripeUrlSerializer, result);
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      return returnBadRequest({
        error: (error as Error)?.message,
        message: 'Failed to create setup checkout session',
        success: false,
      });
    }
  }

  @Get('portal')
  async getBillingPortalUrl(
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    const publicMetadata = getPublicMetadata(user);

    if (!publicMetadata.organization) {
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
        publicMetadata.organization,
      );

      if (!subscription) {
        return returnNotFound('Subscription', publicMetadata.organization);
      }
      if (!subscription.stripeCustomerId) {
        return returnBadRequest({
          message: 'Subscription is missing stripeCustomerId',
          success: false,
        });
      }

      const billingUrl = await this.stripeService.getBillingPortalUrl(
        subscription.stripeCustomerId,
        origin,
      );

      return serializeSingle(request, StripeUrlSerializer, billingUrl);
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      return returnInternalServerError(
        `Failed to get billing portal URL: ${(error as Error)?.message}`,
      );
    }
  }
}

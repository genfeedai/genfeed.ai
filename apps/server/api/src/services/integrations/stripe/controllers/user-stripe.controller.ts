/**
 * User Stripe Controller
 * Handles user-level Stripe payments for consumer apps (getshareable.app).
 * Users have their own Stripe customer IDs separate from organization billing.
 */
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UserSubscriptionsService } from '@api/collections/user-subscriptions/services/user-subscriptions.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnBadRequest,
  returnInternalServerError,
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import type { User } from '@clerk/backend';
import { OrganizationCategory } from '@genfeedai/enums';
import { StripeUrlSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

interface CreateUserCheckoutDto {
  stripePriceId: string;
  quantity?: number;
  mode?: 'payment' | 'subscription';
}

@AutoSwagger()
@ApiTags('User Stripe')
@Controller('users/stripe')
export class UserStripeController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
    private readonly userSubscriptionsService: UserSubscriptionsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly organizationsService: OrganizationsService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Create checkout session for user credit purchase' })
  @ApiResponse({ description: 'Checkout session created', status: 200 })
  @ApiResponse({ description: 'Bad request', status: 400 })
  async createCheckoutSession(
    @CurrentUser() user: User,
    @Body() createCheckoutDto: CreateUserCheckoutDto,
    @Req() request: Request,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { ...createCheckoutDto });

    const origin = request.headers.origin;
    if (!origin) {
      return returnBadRequest({
        message: 'Origin is required',
        success: false,
      });
    }

    try {
      const {
        stripePriceId,
        quantity = 1,
        mode = 'payment',
      } = createCheckoutDto;
      const { emailAddresses, firstName, lastName } = user;
      const email = emailAddresses?.[0]?.emailAddress;

      if (!email) {
        return returnBadRequest({
          message: 'User email is required for checkout',
          success: false,
        });
      }

      // Find user by clerkId
      const dbUser = await this.usersService.findOne({
        clerkId: user.id,
        isDeleted: false,
      });
      if (!dbUser) {
        return returnNotFound('User', user.id);
      }

      // Get or create user's Stripe customer
      let stripeCustomerId = dbUser.stripeCustomerId;

      if (!stripeCustomerId) {
        const name = [firstName, lastName].filter(Boolean).join(' ');
        const stripeCustomer = await this.stripeService.createUserCustomer(
          dbUser._id.toString(),
          email,
          name || undefined,
        );
        stripeCustomerId = stripeCustomer.id;

        // Update user with Stripe customer ID
        await this.usersService.patch(
          // @ts-expect-error TS2345
          { _id: dbUser._id },
          { stripeCustomerId },
        );
      }

      // Get or create user subscription record
      await this.userSubscriptionsService.getOrCreateSubscription(
        dbUser._id.toString(),
        stripeCustomerId,
      );

      // Create checkout session
      const successUrl = `${origin}/credits/success`;
      const cancelUrl = `${origin}/credits/cancel`;

      const session = await this.stripeService.createUserPaymentSession({
        cancelUrl,
        mode,
        quantity,
        stripeCustomerId,
        stripePriceId,
        successUrl,
        userId: dbUser._id.toString(),
      });

      return serializeSingle(request, StripeUrlSerializer, session);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

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

  @Get('portal')
  @ApiOperation({ summary: 'Get billing portal URL for user' })
  @ApiResponse({ description: 'Portal URL returned', status: 200 })
  @ApiResponse({ description: 'User or subscription not found', status: 404 })
  async getBillingPortalUrl(
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    const origin = request.headers.origin;
    if (!origin) {
      return returnBadRequest({
        message: 'Origin is required',
        success: false,
      });
    }

    try {
      // Find user by clerkId
      const dbUser = await this.usersService.findOne({
        clerkId: user.id,
        isDeleted: false,
      });
      if (!dbUser) {
        return returnNotFound('User', user.id);
      }

      if (!dbUser.stripeCustomerId) {
        return returnNotFound('Stripe Customer', user.id);
      }

      const returnUrl = `${origin}/credits`;
      const billingUrl = await this.stripeService.getUserBillingPortalUrl(
        dbUser.stripeCustomerId,
        returnUrl,
      );

      return serializeSingle(request, StripeUrlSerializer, billingUrl);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      return returnInternalServerError(
        `Failed to get billing portal URL: ${(error as Error)?.message}`,
      );
    }
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Get user subscription status' })
  @ApiResponse({ description: 'Subscription status returned', status: 200 })
  @ApiResponse({ description: 'User not found', status: 404 })
  async getSubscription(@CurrentUser() user: User, @Req() _request: Request) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      // Find user by clerkId
      const dbUser = await this.usersService.findOne({
        clerkId: user.id,
        isDeleted: false,
      });
      if (!dbUser) {
        return returnNotFound('User', user.id);
      }

      // Get user subscription
      const subscription = await this.userSubscriptionsService.findByUser(
        dbUser._id.toString(),
      );

      // Get user's creator org credit balance
      let balance = 0;
      const creatorOrg = await this.organizationsService.findOne({
        category: OrganizationCategory.CREATOR,
        isDeleted: false,
        members: new Types.ObjectId(dbUser._id),
      });

      if (creatorOrg) {
        balance = await this.creditsUtilsService.getOrganizationCreditsBalance(
          creatorOrg._id.toString(),
        );
      }

      return {
        data: {
          credits: {
            balance,
          },
          hasSubscription: !!subscription,
          subscription: subscription
            ? {
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                currentPeriodEnd: subscription.currentPeriodEnd,
                status: subscription.status,
                type: subscription.type,
              }
            : null,
        },
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      return returnInternalServerError(
        `Failed to get subscription: ${(error as Error)?.message}`,
      );
    }
  }
}

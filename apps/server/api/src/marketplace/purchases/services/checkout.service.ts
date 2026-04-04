import { ConfigService } from '@api/config/config.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { ListingsService } from '@api/marketplace/listings/services/listings.service';
import { PurchaseEntity } from '@api/marketplace/purchases/entities/purchase.entity';
import { Purchase } from '@api/marketplace/purchases/schemas/purchase.schema';
import { PurchasesService } from '@api/marketplace/purchases/services/purchases.service';
import { SellersService } from '@api/marketplace/sellers/services/sellers.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { PurchaseStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import Stripe from 'stripe';

@Injectable()
export class CheckoutService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly stripeService: StripeService,
    private readonly listingsService: ListingsService,
    private readonly purchasesService: PurchasesService,
    private readonly sellersService: SellersService,
  ) {}

  /**
   * Create a Stripe Checkout session for a marketplace listing
   */
  @HandleErrors('create checkout session', 'checkout')
  async createCheckoutSession(params: {
    listingId: string;
    buyerId: string;
    organizationId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string; purchase: Purchase }> {
    const { listingId, buyerId, organizationId, successUrl, cancelUrl } =
      params;

    this.loggerService.log(`${this.constructorName} createCheckoutSession`, {
      buyerId,
      listingId,
    });

    // Check if already purchased
    const alreadyPurchased = await this.purchasesService.hasAlreadyPurchased(
      listingId,
      buyerId,
    );
    if (alreadyPurchased) {
      throw new BadRequestException('You already own this item');
    }

    // Get the listing
    const listing = await this.listingsService.getPublishedListing(listingId);
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.pricingTier === 'premium') {
      throw new BadRequestException(
        'Premium listings are not purchasable via checkout.',
      );
    }

    if (listing.price === 0) {
      throw new BadRequestException(
        'This item is free. Use the claim endpoint instead.',
      );
    }

    // Calculate commission
    const { platformFee, sellerEarnings } =
      this.purchasesService.calculateCommission(listing.price);

    // Create pending purchase record
    const purchaseEntity = new PurchaseEntity({
      buyer: new Types.ObjectId(buyerId),
      currency: listing.currency,
      discount: 0,
      isDeleted: false,
      listing: new Types.ObjectId(listingId),
      listingSnapshot: {
        price: listing.price,
        title: listing.title,
        type: listing.type,
        version: listing.version,
      },
      organization: new Types.ObjectId(organizationId),
      platformFee,
      seller: listing.seller,
      sellerEarnings,
      status: PurchaseStatus.PENDING,
      subtotal: listing.price,
      total: listing.price,
    });

    const purchase = await this.purchasesService.create(
      // @ts-expect-error TS2345
      purchaseEntity as unknown as Purchase,
    );

    // Create Stripe Checkout session
    const session = await this.createStripeSession({
      buyerId,
      cancelUrl,
      listing,
      organizationId,
      purchaseId: purchase._id.toString(),
      successUrl,
    });

    // Update purchase with Stripe session ID
    await this.purchasesService.patch(purchase._id.toString(), {
      stripeSessionId: session.id,
    });

    this.loggerService.log(`${this.constructorName} checkout session created`, {
      buyerId,
      listingId,
      purchaseId: purchase._id,
      sessionId: session.id,
    });

    return {
      purchase,
      sessionId: session.id,
      url: session.url || '',
    };
  }

  /**
   * Create Stripe Checkout session.
   * If the seller has completed Stripe Connect onboarding, funds are routed
   * via transfer_data with application_fee_amount for platform commission.
   */
  private async createStripeSession(params: {
    listing: {
      _id: Types.ObjectId;
      title: string;
      price: number;
      currency: string;
      thumbnail?: string;
      shortDescription: string;
      seller: Types.ObjectId;
    };
    purchaseId: string;
    buyerId: string;
    organizationId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    const {
      listing,
      purchaseId,
      buyerId,
      organizationId,
      successUrl,
      cancelUrl,
    } = params;

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      allow_promotion_codes: true,
      cancel_url: `${cancelUrl}?session_id={CHECKOUT_SESSION_ID}`,
      line_items: [
        {
          price_data: {
            currency: listing.currency.toLowerCase(),
            product_data: {
              description: listing.shortDescription,
              images: listing.thumbnail ? [listing.thumbnail] : undefined,
              name: listing.title,
            },
            unit_amount: listing.price, // Price is already in cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        buyerId,
        listingId: listing._id.toString(),
        organizationId,
        purchaseId,
        sellerId: listing.seller.toString(),
        type: 'marketplace',
      },
      mode: 'payment',
      payment_method_types: ['card'],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    };

    // Route funds to seller's Stripe Connect account if onboarding is complete
    const seller = await this.sellersService.findOne({
      _id: listing.seller,
      isDeleted: false,
    });

    if (seller?.stripeAccountId && seller.stripeOnboardingComplete) {
      const { platformFee } = this.purchasesService.calculateCommission(
        listing.price,
      );
      sessionConfig.payment_intent_data = {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: seller.stripeAccountId,
        },
      };
    }

    return this.stripeService.stripe.checkout.sessions.create(sessionConfig);
  }

  /**
   * Get checkout session details
   */
  @HandleErrors('get checkout session', 'checkout')
  getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.stripeService.stripe.checkout.sessions.retrieve(sessionId);
  }

  /**
   * Handle successful checkout (called by webhook)
   */
  @HandleErrors('handle successful checkout', 'checkout')
  async handleSuccessfulCheckout(session: Stripe.Checkout.Session): Promise<{
    purchase: Purchase;
    success: boolean;
  }> {
    const purchaseId = session.metadata?.purchaseId;

    if (!purchaseId) {
      this.loggerService.error(
        `${this.constructorName} no purchaseId in session metadata`,
        { sessionId: session.id },
      );
      return { purchase: null as unknown as Purchase, success: false };
    }

    // Complete the purchase
    const purchase = await this.purchasesService.completePurchase(purchaseId);

    // Update with payment details
    await this.purchasesService.patch(purchaseId, {
      stripePaymentIntentId: session.payment_intent as string,
    });

    this.loggerService.log(
      `${this.constructorName} checkout completed successfully`,
      {
        listingId: session.metadata?.listingId,
        purchaseId,
        sessionId: session.id,
      },
    );

    return { purchase, success: true };
  }

  /**
   * Handle failed checkout
   */
  @HandleErrors('handle failed checkout', 'checkout')
  async handleFailedCheckout(sessionId: string, reason: string): Promise<void> {
    const session = await this.getCheckoutSession(sessionId);
    const purchaseId = session.metadata?.purchaseId;

    if (purchaseId) {
      await this.purchasesService.patch(purchaseId, {
        failureReason: reason,
        status: PurchaseStatus.FAILED,
      });

      this.loggerService.log(
        `${this.constructorName} checkout marked as failed`,
        {
          purchaseId,
          reason,
          sessionId,
        },
      );
    }
  }
}

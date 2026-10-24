vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeSingle: vi.fn(
      (_req: unknown, _serializer: unknown, data: unknown) => data,
    ),
  };
});

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { hashToken } from '@api/auth/shared/pkce.util';
import type { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import type { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import { TrialCardController } from '@api/services/integrations/stripe/controllers/trial-card.controller';
import {
  BillingAccountResolutionError,
  type OrganizationBillingAccountService,
} from '@api/services/integrations/stripe/services/organization-billing-account.service';
import type { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { BillingAccountMemberRole } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';

describe('TrialCardController', () => {
  const stripeService = {
    createTrialCardSetupSession: vi.fn(),
    getTrialCardFingerprint: vi.fn(),
  };
  const usersService = { findOne: vi.fn() };
  const organizationsService = { findOne: vi.fn() };
  const billingAccountService = { resolveOrProvision: vi.fn() };
  const billingAccountsService = {
    ensureForOrganization: vi.fn(),
    requireRole: vi.fn(),
    resolveForOrganization: vi.fn(),
  };
  const grants = { claimTrialCredits: vi.fn(), getTrialClaimStatus: vi.fn() };
  const logger = { warn: vi.fn() };
  const controller = new TrialCardController(
    stripeService as unknown as StripeService,
    usersService as unknown as UsersService,
    organizationsService as unknown as OrganizationsService,
    billingAccountService as unknown as OrganizationBillingAccountService,
    billingAccountsService as unknown as BillingAccountsService,
    grants as unknown as OnboardingCreditGrantsService,
    logger as unknown as LoggerService,
  );
  const user = {
    emailAddresses: [{ emailAddress: 'jane@example.com' }],
    id: 'user-1',
    organizationId: 'org-1',
  } as unknown as User;
  const withOrigin = {
    headers: { origin: 'https://app.genfeed.ai' },
    ip: '203.0.113.7',
  } as unknown as Request;

  beforeEach(() => {
    vi.clearAllMocks();
    usersService.findOne.mockResolvedValue({ email: null, id: 'user-1' });
    organizationsService.findOne.mockResolvedValue({
      id: 'org-1',
      label: 'Acme',
    });
    billingAccountsService.resolveForOrganization.mockResolvedValue({
      id: 'ba-1',
    });
    billingAccountService.resolveOrProvision.mockResolvedValue({
      customerId: 'row-1',
      stripeCustomerId: 'cus_1',
    });
  });

  describe('createCardSetup', () => {
    it('opens a setup session that returns to the page that asked', async () => {
      stripeService.createTrialCardSetupSession.mockResolvedValue({
        id: 'cs_1',
        url: 'https://checkout.stripe.com/setup',
      });

      await controller.createCardSetup(
        user,
        { returnPath: '/settings/credits' },
        withOrigin,
      );

      expect(billingAccountsService.requireRole).toHaveBeenCalledWith(
        'ba-1',
        'user-1',
        BillingAccountMemberRole.ADMINISTRATOR,
      );
      expect(stripeService.createTrialCardSetupSession).toHaveBeenCalledWith({
        cancelUrl: 'https://app.genfeed.ai/settings/credits',
        organizationId: 'org-1',
        stripeCustomerId: 'cus_1',
        successUrl:
          'https://app.genfeed.ai/settings/credits?trialCard=success&session_id={CHECKOUT_SESSION_ID}',
      });
    });

    it('requires an origin to build the return URLs', async () => {
      await expect(
        controller.createCardSetup(user, {}, {
          headers: {},
        } as unknown as Request),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reports an unavailable billing account without leaking the cause', async () => {
      billingAccountService.resolveOrProvision.mockRejectedValue(
        new BillingAccountResolutionError(
          'billing_provider_unavailable',
          'provider_unavailable',
        ),
      );

      await expect(
        controller.createCardSetup(user, {}, withOrigin),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('reports Stripe being down as unavailable', async () => {
      stripeService.createTrialCardSetupSession.mockRejectedValue(
        new Error('stripe down'),
      );

      await expect(
        controller.createCardSetup(user, {}, withOrigin),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('getStatus', () => {
    it('reports whether the user can still unlock the trial credits', async () => {
      grants.getTrialClaimStatus.mockResolvedValue('claimable');

      await expect(controller.getStatus(user)).resolves.toEqual({
        status: 'claimable',
      });
      expect(grants.getTrialClaimStatus).toHaveBeenCalledWith(
        'org-1',
        'user-1',
      );
    });
  });

  describe('claim', () => {
    it('claims the trial credits with the hashed card fingerprint and request IP', async () => {
      stripeService.getTrialCardFingerprint.mockResolvedValue('fp_card');
      grants.claimTrialCredits.mockResolvedValue('granted');

      await expect(
        controller.claim(user, { sessionId: 'cs_1' }, withOrigin),
      ).resolves.toEqual({ outcome: 'granted' });

      expect(stripeService.getTrialCardFingerprint).toHaveBeenCalledWith(
        'cs_1',
        'cus_1',
      );
      expect(grants.claimTrialCredits).toHaveBeenCalledWith('org-1', 'user-1', {
        cardKey: hashToken('fp_card'),
        ipAddress: '203.0.113.7',
      });
    });

    it('never passes the raw fingerprint to the grant', async () => {
      stripeService.getTrialCardFingerprint.mockResolvedValue('fp_card');
      grants.claimTrialCredits.mockResolvedValue('card-already-used');

      await expect(
        controller.claim(user, { sessionId: 'cs_1' }, withOrigin),
      ).resolves.toEqual({ outcome: 'card-already-used' });
      expect(JSON.stringify(grants.claimTrialCredits.mock.calls)).not.toContain(
        'fp_card',
      );
    });

    it('grants nothing when the session is not a finished trial-card setup', async () => {
      stripeService.getTrialCardFingerprint.mockResolvedValue(null);

      await expect(
        controller.claim(user, { sessionId: 'cs_1' }, withOrigin),
      ).resolves.toEqual({ outcome: 'card-not-verified' });
      expect(grants.claimTrialCredits).not.toHaveBeenCalled();
    });

    it('reports Stripe being down as unavailable', async () => {
      stripeService.getTrialCardFingerprint.mockRejectedValue(
        new Error('stripe down'),
      );

      await expect(
        controller.claim(user, { sessionId: 'cs_1' }, withOrigin),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(grants.claimTrialCredits).not.toHaveBeenCalled();
    });
  });
});

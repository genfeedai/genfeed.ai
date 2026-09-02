import type { ActivitySource } from '@genfeedai/contracts';
import { CreditReservationStatus } from '@genfeedai/contracts';
import type {
  IAddCreditsOptions,
  ICreditReservation,
  ICreditsUtilsService,
  ICreditWalletSnapshot,
  ICycleRemainingMetrics,
  IDeductCreditsOptions,
  IOrganizationCreditsWithExpiration,
  IReleaseCreditReservationInput,
  IReserveCreditsInput,
  ISettleCreditReservationInput,
} from '@genfeedai/contracts/interfaces/billing';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OssCreditsUtilsService implements ICreditsUtilsService {
  async checkOrganizationCreditsAvailable(
    _organizationId: string,
    _requiredCredits: number,
  ): Promise<boolean> {
    return true;
  }

  async getOrganizationCreditsBalance(
    _organizationId: string,
  ): Promise<number> {
    return Number.POSITIVE_INFINITY;
  }

  async deductCreditsFromOrganization(
    _organizationId: string,
    _userId: string,
    _creditsToDeduct: number,
    _description: string,
    _source?: ActivitySource,
    _options?: IDeductCreditsOptions,
  ): Promise<void> {
    return undefined;
  }

  async addOrganizationCreditsWithExpiration(
    _organizationId: string,
    _creditsToAdd: number,
    _source: string,
    _description: string,
    _expiresAt: Date,
    _options?: IAddCreditsOptions,
  ): Promise<void> {
    return undefined;
  }

  async refundOrganizationCredits(
    _organizationId: string,
    _creditsToRefund: number,
    _source: string,
    _description: string,
    _expiresAt: Date,
  ): Promise<void> {
    return undefined;
  }

  async resetOrganizationCredits(
    _organizationId: string,
    _newCreditAmount: number,
    _source: string,
    _description: string,
    _options?: IAddCreditsOptions,
  ): Promise<void> {
    return undefined;
  }

  async removeAllOrganizationCredits(
    _organizationId: string,
    _source: string,
    _description: string,
  ): Promise<void> {
    return undefined;
  }

  async getOrganizationCreditsWithExpiration(
    _organizationId: string,
  ): Promise<IOrganizationCreditsWithExpiration> {
    return {
      credits: [],
      total: Number.POSITIVE_INFINITY,
    };
  }

  async getCycleRemainingMetrics(
    _organizationId: string,
    _cycleStartAt: Date,
    _cycleEndAt: Date,
    _currentBalance: number,
  ): Promise<ICycleRemainingMetrics> {
    return {
      cycleTotal: 0,
      remainingPercent: 100,
    };
  }

  async getWalletSnapshot(
    _organizationId: string,
  ): Promise<ICreditWalletSnapshot> {
    return {
      available: Number.POSITIVE_INFINITY,
      billingAccountId: null,
      held: 0,
      id: 'oss',
      organizationId: _organizationId,
      settled: Number.POSITIVE_INFINITY,
      version: 0,
    };
  }

  async reserveCredits(
    input: IReserveCreditsInput,
  ): Promise<ICreditReservation> {
    return {
      actorUserId: input.actorUserId,
      amount: input.amount,
      billingAccountId: 'oss',
      createdAt: new Date().toISOString(),
      expiresAt: (input.expiresAt ?? new Date()).toISOString(),
      id: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      isDeleted: false,
      organizationId: input.organizationId,
      settledAmount: null,
      status: CreditReservationStatus.RESERVED,
      updatedAt: new Date().toISOString(),
      workloadId: input.workloadId ?? null,
      workloadType: input.workloadType ?? null,
    };
  }

  async settleReservation(
    input: ISettleCreditReservationInput,
  ): Promise<ICreditWalletSnapshot> {
    return this.getWalletSnapshot(input.organizationId);
  }

  async releaseReservation(
    input: IReleaseCreditReservationInput,
  ): Promise<ICreditWalletSnapshot> {
    return this.getWalletSnapshot(input.organizationId);
  }
}

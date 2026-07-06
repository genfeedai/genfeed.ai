import type { ActivitySource } from '@genfeedai/enums';
import type {
  IAddCreditsOptions,
  ICreditsUtilsService,
  ICycleRemainingMetrics,
  IDeductCreditsOptions,
  IOrganizationCreditsWithExpiration,
} from '@genfeedai/interfaces/billing';
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
}

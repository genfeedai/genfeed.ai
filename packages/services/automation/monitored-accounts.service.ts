import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { MonitoredAccount } from '@genfeedai/models/automation/monitored-account.model';
import { MonitoredAccountSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class MonitoredAccountsService extends BaseService<MonitoredAccount> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.MONITORED_ACCOUNTS,
      token,
      MonitoredAccount,
      MonitoredAccountSerializer,
    );
  }

  public static getInstance(token: string): MonitoredAccountsService {
    return BaseService.getDataServiceInstance(MonitoredAccountsService, token);
  }

  /**
   * Get all monitored accounts for an organization
   */
  async findAllByOrganization(
    organizationId: string,
    brandId?: string,
  ): Promise<MonitoredAccount[]> {
    return this.findAllPages({
      ...(brandId ? { brandId } : {}),
      organizationId,
    });
  }

  /**
   * Get monitored accounts for a specific bot config
   */
  async findByBotConfig(botConfigId: string): Promise<MonitoredAccount[]> {
    return this.findAllPages({
      botConfigId,
    });
  }

  /**
   * Get active monitored accounts
   */
  async findActive(
    organizationId: string,
    brandId?: string,
  ): Promise<MonitoredAccount[]> {
    return this.findAllPages({
      ...(brandId ? { brandId } : {}),
      isActive: true,
      organizationId,
    });
  }

  /**
   * Validate a Twitter username and fetch details
   */
  async validateTwitterUsername(username: string): Promise<{
    valid: boolean;
    id?: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    followersCount?: number;
    bio?: string;
  }> {
    const response = await this.instance.post<{
      valid: boolean;
      id?: string;
      username?: string;
      displayName?: string;
      avatarUrl?: string;
      followersCount?: number;
      bio?: string;
    }>('validate', { username });
    return response.data;
  }
}

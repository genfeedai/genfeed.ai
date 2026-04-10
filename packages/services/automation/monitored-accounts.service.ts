import { API_ENDPOINTS } from '@genfeedai/constants';
import { MonitoredAccount } from '@genfeedai/models/automation/monitored-account.model';
import { MonitoredAccountSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

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
    return BaseService.getDataServiceInstance(
      MonitoredAccountsService,
      token,
    ) as MonitoredAccountsService;
  }

  /**
   * Get all monitored accounts for an organization
   */
  async findAllByOrganization(
    organizationId: string,
    brandId?: string,
  ): Promise<MonitoredAccount[]> {
    return this.findAll({
      ...(brandId ? { brand: brandId } : {}),
      organization: organizationId,
      pagination: false,
    });
  }

  /**
   * Get monitored accounts for a specific bot config
   */
  async findByBotConfig(botConfigId: string): Promise<MonitoredAccount[]> {
    return this.findAll({
      botConfig: botConfigId,
      pagination: false,
    });
  }

  /**
   * Get active monitored accounts
   */
  async findActive(
    organizationId: string,
    brandId?: string,
  ): Promise<MonitoredAccount[]> {
    return this.findAll({
      ...(brandId ? { brand: brandId } : {}),
      isActive: true,
      organization: organizationId,
      pagination: false,
    });
  }

  /**
   * Toggle the active status of a monitored account
   */
  async toggleActive(id: string): Promise<MonitoredAccount> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/toggle`,
    );
    return new MonitoredAccount(this.extractResource(response.data));
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

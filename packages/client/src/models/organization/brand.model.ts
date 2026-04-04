import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { AssetScope } from '@genfeedai/enums';
import type {
  IAsset,
  IBrand,
  IBrandAgentConfig,
  ICredential,
  ILink,
  IOrganization,
  IUser,
} from '@genfeedai/interfaces';

export class Brand extends BaseEntity implements IBrand {
  public declare user: IUser;
  public declare organization: IOrganization;
  public declare credentials: ICredential[];
  public declare links: ILink[];
  public declare logo?: IAsset;
  public declare banner?: IAsset;
  public declare references?: IAsset[];
  public declare slug: string;
  public declare label: string;
  public declare description: string;
  public declare website?: string;
  public declare location?: string;
  public declare views?: number;
  public declare followers?: number;
  public declare following?: number;
  public declare fontFamily: string;
  public declare primaryColor: string;
  public declare secondaryColor: string;
  public declare backgroundColor: string;
  public declare isSelected: boolean;
  public declare text?: string;
  public declare scope: AssetScope;
  public declare isVerified: boolean;
  public declare isActive: boolean;
  public declare isDefault: boolean;
  public declare isDarkroomEnabled: boolean;
  public declare isHighlighted?: boolean;
  public declare agentConfig?: IBrandAgentConfig;

  constructor(data: Partial<IBrand> = {}) {
    super(data);
  }
}

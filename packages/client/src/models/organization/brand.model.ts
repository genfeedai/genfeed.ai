import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { AssetScope } from '@genfeedai/contracts';
import type {
  IAsset,
  IBrand,
  IBrandAgentConfig,
  ICredential,
  ILink,
  IOrganization,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Brand extends BaseEntity implements IBrand {
  declare public user: IUser;
  declare public organization: IOrganization;
  declare public credentials: ICredential[];
  declare public links: ILink[];
  declare public logo?: IAsset;
  declare public banner?: IAsset;
  declare public references?: IAsset[];
  declare public slug: string;
  declare public label: string;
  declare public description: string;
  declare public website?: string;
  declare public location?: string;
  declare public views?: number;
  declare public followers?: number;
  declare public following?: number;
  declare public fontFamily: string;
  declare public primaryColor: string;
  declare public secondaryColor: string;
  declare public backgroundColor: string;
  declare public isSelected: boolean;
  declare public text?: string;
  declare public scope: AssetScope;
  declare public isVerified: boolean;
  declare public isActive: boolean;
  declare public isDefault: boolean;
  declare public isFleetEnabled: boolean;
  declare public isHighlighted?: boolean;
  declare public agentConfig?: IBrandAgentConfig;

  constructor(data: Partial<IBrand> = {}) {
    super(data);
  }
}

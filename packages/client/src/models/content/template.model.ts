import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { TemplateCategory, TemplatePlatform } from '@genfeedai/contracts';
import type {
  IOrganization,
  ITemplate,
  ITemplateMetadata,
  ITemplatePerformance,
  ITemplateVariable,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Template extends BaseEntity implements ITemplate {
  declare public organization?: string;
  declare public organizationData?: IOrganization | string;
  declare public createdBy?: string;
  declare public user?: IUser | string;
  declare public key?: string;
  declare public purpose: 'content' | 'prompt';
  declare public category?: TemplateCategory;
  declare public label: string;
  declare public description: string;
  declare public content: string;
  declare public variables: ITemplateVariable[];
  declare public categories?: string[];
  declare public industries?: string[];
  declare public platforms?: TemplatePlatform[];
  declare public tags?: string[];
  declare public metadata?: ITemplateMetadata;
  declare public performance?: ITemplatePerformance;
  declare public scope?: string;
  declare public isPremium?: boolean;
  declare public isFeatured?: boolean;
  declare public version?: number;
  declare public isActive?: boolean;

  constructor(data: Partial<ITemplate> = {}) {
    super(data);
  }
}

export { Template as PromptTemplate };

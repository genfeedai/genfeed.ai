import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { TemplateCategory, TemplatePlatform } from '@genfeedai/enums';
import type {
  IOrganization,
  ITemplate,
  ITemplateMetadata,
  ITemplatePerformance,
  ITemplateVariable,
  IUser,
} from '@genfeedai/interfaces';

export class Template extends BaseEntity implements ITemplate {
  public declare organization?: string;
  public declare organizationData?: IOrganization | string;
  public declare createdBy?: string;
  public declare user?: IUser | string;
  public declare key?: string;
  public declare purpose: 'content' | 'prompt';
  public declare category?: TemplateCategory;
  public declare label: string;
  public declare description: string;
  public declare content: string;
  public declare variables: ITemplateVariable[];
  public declare categories?: string[];
  public declare industries?: string[];
  public declare platforms?: TemplatePlatform[];
  public declare tags?: string[];
  public declare metadata?: ITemplateMetadata;
  public declare performance?: ITemplatePerformance;
  public declare scope?: string;
  public declare isPremium?: boolean;
  public declare isFeatured?: boolean;
  public declare version?: number;
  public declare isActive?: boolean;

  constructor(data: Partial<ITemplate> = {}) {
    super(data);
  }
}

export { Template as PromptTemplate };

import type {
  IContentTemplate,
  TemplateCategory,
  TemplateContent,
  TemplateIndustry,
  TemplateMetadata,
  TemplatePerformance,
  TemplateType,
  TemplateVariable,
} from '@genfeedai/interfaces/content/template-ui.interface';

export class Template implements IContentTemplate {
  public id!: string;
  public isDeleted!: boolean;
  public createdAt!: Date;
  public updatedAt!: Date;
  public organizationId!: string;
  public organization?: unknown;
  public createdBy!: string;
  public user?: unknown;
  public name!: string;
  public description!: string;
  public category!: TemplateCategory;
  public industry!: TemplateIndustry[];
  public thumbnail?: string;
  public tags!: string[];
  public variables!: TemplateVariable[];
  public content!: TemplateContent;
  public metadata!: TemplateMetadata;
  public performance!: TemplatePerformance;
  public scope!: boolean;
  public isPremium!: boolean;
  public type!: TemplateType;

  constructor(partial: Partial<IContentTemplate>) {
    Object.assign(this, partial);
  }
}

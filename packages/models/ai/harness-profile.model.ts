import type { IHarnessProfile } from '@genfeedai/interfaces';

export class HarnessProfile implements IHarnessProfile {
  public id!: string;
  public _id?: string;
  public organization?: string;
  public organizationId?: string;
  public createdBy?: string;
  public createdById?: string;
  public brandId?: string;
  public profileType: 'harness' = 'harness';
  public label!: string;
  public description?: string;
  public scope: IHarnessProfile['scope'] = 'brand';
  public status: IHarnessProfile['status'] = 'active';
  public isDefault = false;
  public platforms: string[] = [];
  public handles: Record<string, string> = {};
  public audience: string[] = [];
  public thesis: IHarnessProfile['thesis'] = {};
  public voice: IHarnessProfile['voice'] = {};
  public structure: IHarnessProfile['structure'] = {};
  public examples: IHarnessProfile['examples'] = {};
  public guardrails: string[] = [];
  public metadata?: Record<string, unknown>;
  public isDeleted = false;
  public createdAt!: string;
  public updatedAt!: string;

  constructor(partial: Partial<IHarnessProfile> = {}) {
    Object.assign(this, partial);
  }
}

import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IMetadata, IPrompt, ITag } from '@genfeedai/interfaces';

export class Metadata extends BaseEntity implements IMetadata {
  public declare label: string;
  public declare description?: string;
  public declare model?: string;
  public declare result?: string;
  public declare extension?: string;
  public declare language?: string;
  public declare duration?: number;
  public declare width?: number;
  public declare height?: number;
  public declare size?: number;
  public declare style?: string;
  public declare hasAudio?: boolean;
  public declare shortId?: string;
  public declare prompt?: IPrompt;
  public declare tags?: ITag[];
  public declare url?: string;

  constructor(data: Partial<IMetadata> = {}) {
    super(data);
  }
}

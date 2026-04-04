import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { KnowledgeBaseScope, KnowledgeBaseStatus } from '@genfeedai/enums';
import type { KnowledgeBase as KnowledgeBaseInterface } from '@genfeedai/interfaces';

export class KnowledgeBase
  extends BaseEntity
  implements KnowledgeBaseInterface
{
  public declare label: string;
  public declare description?: string;
  public declare status: KnowledgeBaseStatus;
  public declare scope: KnowledgeBaseScope;
  public declare organizationId?: string;
  public declare brandId?: string;
  public declare userId?: string;
  public declare branding?: KnowledgeBaseInterface['branding'];
  public declare sources?: KnowledgeBaseInterface['sources'];
  public declare fontFamily?: string;
  public declare defaultVideoModel?: string;
  public declare defaultImageModel?: string;
  public declare defaultImageToVideoModel?: string;
  public declare defaultMusicModel?: string;
  public declare lastAnalyzedAt?: string;
  public declare isActive: boolean;

  constructor(data: Partial<KnowledgeBaseInterface> = {}) {
    super(data);
  }
}

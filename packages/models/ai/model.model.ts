import { Model as BaseModel } from '@genfeedai/client/models';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';

export class Model extends BaseModel {
  public get categoryBadgeClass(): string {
    switch (this.category) {
      case ModelCategory.IMAGE:
        return 'bg-violet-500/15 text-violet-400 border-violet-500/30';
      case ModelCategory.VIDEO:
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case ModelCategory.MUSIC:
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      default:
        return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
    }
  }

  public get providerBadgeClass(): string {
    switch (this.provider) {
      case ModelProvider.REPLICATE:
        // Neutral slate instead of alarming red
        return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
      case ModelProvider.FAL:
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
    }
  }
}

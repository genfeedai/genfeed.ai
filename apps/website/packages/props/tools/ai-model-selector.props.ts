import type { BenchmarkData } from '@public/benchmark/benchmark-loader';
import type { PublicModelCatalogItem } from '@public/models/models-loader';

export interface AiModelSelectorProps {
  benchmark?: BenchmarkData | null;
  models: PublicModelCatalogItem[] | null;
}

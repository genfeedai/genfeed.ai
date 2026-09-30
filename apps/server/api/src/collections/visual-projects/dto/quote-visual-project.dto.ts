import { Allow } from 'class-validator';
export class QuoteVisualProjectDto {
  @Allow() declare readonly operation: 'create' | 'revise' | 'export' | 'retry';
  @Allow() declare readonly projectId?: string;
  @Allow() declare readonly input: Record<string, unknown>;
}

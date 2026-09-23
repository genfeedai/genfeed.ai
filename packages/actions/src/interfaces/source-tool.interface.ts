import type { ToolParameterSchema } from './tool-definition.interface';

export interface SourceTool {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  creditCost: number;
  requiredRole: 'user' | 'admin' | 'superadmin';
}

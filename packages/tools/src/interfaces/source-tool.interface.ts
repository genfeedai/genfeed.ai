export interface SourceTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  creditCost: number;
  requiredRole: 'user' | 'admin' | 'superadmin';
}

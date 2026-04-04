import {
  getNodeDefinition,
  validateConnection,
} from '@api/collections/workflows/registry/node-registry';

export interface ValidationError {
  nodeId?: string;
  edgeId?: string;
  message: string;
}

export interface WorkflowVisualNode {
  id: string;
  type: string;
  data?: {
    label?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowValidationInput {
  nodes?: WorkflowVisualNode[];
  edges?: WorkflowEdge[];
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Centralized workflow validator.
 * Consolidates validation logic for nodes, edges, and connectivity.
 */
export class WorkflowValidator {
  private readonly nodes: WorkflowVisualNode[];
  private readonly edges: WorkflowEdge[];
  private readonly errors: ValidationError[] = [];

  constructor(workflow: WorkflowValidationInput) {
    this.nodes = workflow.nodes || [];
    this.edges = workflow.edges || [];
  }

  /**
   * Run all validations and return the result.
   */
  validate(): WorkflowValidationResult {
    this.validateNodes();
    this.validateEdges();
    this.validateConnectivity();

    return {
      errors: this.errors,
      valid: this.errors.length === 0,
    };
  }

  /**
   * Validate that all nodes exist in the registry.
   */
  validateNodes(): ValidationError[] {
    const nodeErrors: ValidationError[] = [];

    for (const node of this.nodes) {
      const definition = getNodeDefinition(node.type);
      if (!definition) {
        const error = {
          message: `Unknown node type: ${node.type}`,
          nodeId: node.id,
        };
        nodeErrors.push(error);
        this.errors.push(error);
      }
    }

    return nodeErrors;
  }

  /**
   * Validate that edges connect valid ports.
   */
  validateEdges(): ValidationError[] {
    const edgeErrors: ValidationError[] = [];

    for (const edge of this.edges) {
      const sourceNode = this.nodes.find((n) => n.id === edge.source);
      const targetNode = this.nodes.find((n) => n.id === edge.target);

      if (!sourceNode) {
        const error = {
          edgeId: edge.id,
          message: `Source node not found: ${edge.source}`,
        };
        edgeErrors.push(error);
        this.errors.push(error);
        continue;
      }

      if (!targetNode) {
        const error = {
          edgeId: edge.id,
          message: `Target node not found: ${edge.target}`,
        };
        edgeErrors.push(error);
        this.errors.push(error);
        continue;
      }

      const valid = validateConnection(
        sourceNode.type,
        edge.sourceHandle || 'default',
        targetNode.type,
        edge.targetHandle || 'default',
      );

      if (!valid) {
        const error = {
          edgeId: edge.id,
          message: `Invalid connection between ${sourceNode.type} and ${targetNode.type}`,
        };
        edgeErrors.push(error);
        this.errors.push(error);
      }
    }

    return edgeErrors;
  }

  /**
   * Check for disconnected nodes (nodes with inputs that have no incoming connections).
   */
  validateConnectivity(): ValidationError[] {
    const connectivityErrors: ValidationError[] = [];
    const connectedTargets = new Set(this.edges.map((e) => e.target));

    for (const node of this.nodes) {
      const definition = getNodeDefinition(node.type);
      if (!definition) {
        continue;
      }

      const hasInputs = Object.keys(definition.inputs).length > 0;
      const isInputNode = definition.category === 'input';

      if (hasInputs && !isInputNode && !connectedTargets.has(node.id)) {
        const error = {
          message: `Node has no incoming connections: ${node.data?.label || node.type}`,
          nodeId: node.id,
        };
        connectivityErrors.push(error);
        this.errors.push(error);
      }
    }

    return connectivityErrors;
  }

  /**
   * Static factory method for quick validation.
   */
  static validate(workflow: WorkflowValidationInput): WorkflowValidationResult {
    const validator = new WorkflowValidator(workflow);
    return validator.validate();
  }
}

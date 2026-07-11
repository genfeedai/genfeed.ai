import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from '@workflow-engine/types';

export interface ValidationOptions {
  validateConfigs?: boolean;
  checkDisconnected?: boolean;
  requiredNodeTypes?: string[];
  maxNodes?: number;
}

const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
  checkDisconnected: true,
  maxNodes: 100,
  validateConfigs: true,
};

export function validateWorkflow(
  workflow: ExecutableWorkflow,
  options: ValidationOptions = {},
): ValidationResult {
  const opts = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!workflow.id) {
    errors.push({
      code: 'MISSING_ID',
      message: 'Workflow ID is required',
    });
  }

  if (!workflow.organizationId) {
    errors.push({
      code: 'MISSING_ORG',
      message: 'Organization ID is required',
    });
  }

  if (!workflow.nodes || workflow.nodes.length === 0) {
    errors.push({
      code: 'NO_NODES',
      message: 'Workflow must have at least one node',
    });
  }

  if (opts.maxNodes && workflow.nodes.length > opts.maxNodes) {
    errors.push({
      code: 'TOO_MANY_NODES',
      message: `Workflow has ${workflow.nodes.length} nodes, maximum allowed is ${opts.maxNodes}`,
    });
  }

  const nodeIds = new Set<string>();
  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push({
        code: 'DUPLICATE_NODE_ID',
        message: `Duplicate node ID: ${node.id}`,
        nodeId: node.id,
      });
    }
    nodeIds.add(node.id);

    if (!node.type) {
      errors.push({
        code: 'MISSING_NODE_TYPE',
        message: `Node ${node.id} is missing type`,
        nodeId: node.id,
      });
    }

    if (!node.label) {
      warnings.push({
        code: 'MISSING_NODE_LABEL',
        message: `Node ${node.id} is missing label`,
        nodeId: node.id,
      });
    }
  }

  const edgeIds = new Set<string>();
  for (const edge of workflow.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push({
        code: 'DUPLICATE_EDGE_ID',
        message: `Duplicate edge ID: ${edge.id}`,
      });
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.source)) {
      errors.push({
        code: 'INVALID_EDGE_SOURCE',
        message: `Edge ${edge.id} references non-existent source node: ${edge.source}`,
      });
    }

    if (!nodeIds.has(edge.target)) {
      errors.push({
        code: 'INVALID_EDGE_TARGET',
        message: `Edge ${edge.id} references non-existent target node: ${edge.target}`,
      });
    }

    if (edge.source === edge.target) {
      errors.push({
        code: 'SELF_LOOP',
        message: `Edge ${edge.id} creates a self-loop on node ${edge.source}`,
      });
    }
  }

  const hasCycle = detectCycle(workflow.nodes, workflow.edges);
  if (hasCycle) {
    errors.push({
      code: 'CYCLE_DETECTED',
      message: 'Workflow contains a cycle, which is not allowed',
    });
  }

  if (opts.checkDisconnected && workflow.nodes.length > 1) {
    const connectedNodes = findConnectedNodes(workflow.nodes, workflow.edges);
    for (const node of workflow.nodes) {
      if (!connectedNodes.has(node.id)) {
        warnings.push({
          code: 'DISCONNECTED_NODE',
          message: `Node ${node.id} is not connected to any other node`,
          nodeId: node.id,
        });
      }
    }
  }

  if (opts.requiredNodeTypes && opts.requiredNodeTypes.length > 0) {
    const presentTypes = new Set(workflow.nodes.map((n) => n.type));
    for (const requiredType of opts.requiredNodeTypes) {
      if (!presentTypes.has(requiredType)) {
        errors.push({
          code: 'MISSING_REQUIRED_TYPE',
          message: `Workflow must contain at least one ${requiredType} node`,
        });
      }
    }
  }

  return {
    errors,
    isValid: errors.length === 0,
    warnings,
  };
}

function detectCycle(
  nodes: ExecutableNode[],
  edges: ExecutableEdge[],
): boolean {
  const adjList = new Map<string, string[]>();

  for (const node of nodes) {
    adjList.set(node.id, []);
  }

  for (const edge of edges) {
    const targets = adjList.get(edge.source) ?? [];
    targets.push(edge.target);
    adjList.set(edge.source, targets);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recStack.add(nodeId);

    for (const neighbor of adjList.get(nodeId) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) {
          return true;
        }
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) {
        return true;
      }
    }
  }

  return false;
}

function findConnectedNodes(
  _nodes: ExecutableNode[],
  edges: ExecutableEdge[],
): Set<string> {
  const connected = new Set<string>();

  for (const edge of edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }

  return connected;
}

export function validateNodeConfig(
  node: ExecutableNode,
  schema: Record<string, { required?: boolean; type?: string }>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = node.config[field];

    if (
      rules.required &&
      (value === undefined || value === null || value === '')
    ) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        field,
        message: `Node ${node.id} is missing required field: ${field}`,
        nodeId: node.id,
      });
    }

    if (value !== undefined && rules.type) {
      const actualType = typeof value;
      if (actualType !== rules.type) {
        errors.push({
          code: 'INVALID_FIELD_TYPE',
          field,
          message: `Node ${node.id} field ${field} should be ${rules.type}, got ${actualType}`,
          nodeId: node.id,
        });
      }
    }
  }

  return errors;
}

export function hasInputNodes(workflow: ExecutableWorkflow): boolean {
  const targetNodes = new Set(workflow.edges.map((e) => e.target));
  return workflow.nodes.some((n) => !targetNodes.has(n.id));
}

export function hasOutputNodes(workflow: ExecutableWorkflow): boolean {
  const sourceNodes = new Set(workflow.edges.map((e) => e.source));
  return workflow.nodes.some((n) => !sourceNodes.has(n.id));
}

export function getInputNodes(workflow: ExecutableWorkflow): ExecutableNode[] {
  const targetNodes = new Set(workflow.edges.map((e) => e.target));
  return workflow.nodes.filter((n) => !targetNodes.has(n.id));
}

export function getOutputNodes(workflow: ExecutableWorkflow): ExecutableNode[] {
  const sourceNodes = new Set(workflow.edges.map((e) => e.source));
  return workflow.nodes.filter((n) => !sourceNodes.has(n.id));
}

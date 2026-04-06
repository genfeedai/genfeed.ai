import type { HandleType, NodeType } from '@genfeedai/types';
import { CONNECTION_RULES, NODE_DEFINITIONS } from '@genfeedai/types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Simplified node shape for validating raw AI-generated JSON.
 * NOT the same as WorkflowNode from @genfeedai/types (which is a full React Flow Node).
 * Raw JSON has `type: string` (any string, may be invalid) and `data: Record<string, unknown>`.
 */
interface ValidationNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

/**
 * Simplified edge shape for validating raw AI-generated JSON.
 * NOT the same as WorkflowEdge from @genfeedai/types (which is a full React Flow Edge).
 * Raw JSON has required sourceHandle/targetHandle (not optional like React Flow).
 */
interface ValidationEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}

interface GeneratedWorkflow {
  name: string;
  description: string;
  nodes: ValidationNode[];
  edges: ValidationEdge[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// VALID NODE TYPES (from NODE_DEFINITIONS registry)
// =============================================================================

const VALID_NODE_TYPES = new Set<string>(Object.keys(NODE_DEFINITIONS));

function getHandleDefinitions(
  nodeType: string,
  direction: 'inputs' | 'outputs',
) {
  const def = NODE_DEFINITIONS[nodeType as NodeType];
  if (!def) return [];
  return def[direction];
}

function getHandleType(
  nodeType: string,
  handleId: string,
  direction: 'inputs' | 'outputs',
): HandleType | null {
  const handles = getHandleDefinitions(nodeType, direction);
  const handle = handles.find((h) => h.id === handleId);
  return handle ? handle.type : null;
}

// =============================================================================
// JSON PARSING (3-strategy extraction)
// =============================================================================

export function parseJSONFromResponse(text: string): GeneratedWorkflow | null {
  const trimmed = text.trim();

  // Strategy 1: Direct parse
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }

  // Strategy 2: Markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // Strategy 3: Regex — find largest JSON object containing "nodes" and "edges"
  const objectMatch = trimmed.match(/\{[\s\S]*"nodes"[\s\S]*"edges"[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      // fall through
    }
  }

  return null;
}

// =============================================================================
// VALIDATION
// =============================================================================

export function validateWorkflowJSON(
  workflow: GeneratedWorkflow,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Structure checks ---
  if (!workflow.name || typeof workflow.name !== 'string') {
    errors.push('Missing or invalid workflow name');
  }
  if (!Array.isArray(workflow.nodes)) {
    errors.push('nodes must be an array');
    return { errors, valid: false, warnings };
  }
  if (!Array.isArray(workflow.edges)) {
    errors.push('edges must be an array');
    return { errors, valid: false, warnings };
  }

  // --- Node checks ---
  const nodeIds = new Set<string>();
  for (const node of workflow.nodes) {
    // Duplicate ID
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);

    // Missing fields
    if (!node.id) errors.push('Node missing id');
    if (!node.type) errors.push(`Node ${node.id} missing type`);
    if (
      !node.position ||
      typeof node.position.x !== 'number' ||
      typeof node.position.y !== 'number'
    ) {
      errors.push(`Node ${node.id} missing or invalid position`);
    }
    if (!node.data || typeof node.data !== 'object') {
      errors.push(`Node ${node.id} missing data`);
    }

    // Invalid type
    if (node.type && !VALID_NODE_TYPES.has(node.type)) {
      errors.push(`Node ${node.id} has invalid type: ${node.type}`);
    }
  }

  // --- Edge checks ---
  const edgeIds = new Set<string>();
  for (const edge of workflow.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push(`Duplicate edge id: ${edge.id}`);
    }
    edgeIds.add(edge.id);

    if (!edge.source || !nodeIds.has(edge.source)) {
      errors.push(
        `Edge ${edge.id} references non-existent source: ${edge.source}`,
      );
    }
    if (!edge.target || !nodeIds.has(edge.target)) {
      errors.push(
        `Edge ${edge.id} references non-existent target: ${edge.target}`,
      );
    }
    if (!edge.sourceHandle) {
      errors.push(`Edge ${edge.id} missing sourceHandle`);
    }
    if (!edge.targetHandle) {
      errors.push(`Edge ${edge.id} missing targetHandle`);
    }

    // Handle type matching
    if (edge.source && edge.target && edge.sourceHandle && edge.targetHandle) {
      const sourceNode = workflow.nodes.find((n) => n.id === edge.source);
      const targetNode = workflow.nodes.find((n) => n.id === edge.target);
      if (sourceNode && targetNode) {
        const sourceType = getHandleType(
          sourceNode.type,
          edge.sourceHandle,
          'outputs',
        );
        const targetType = getHandleType(
          targetNode.type,
          edge.targetHandle,
          'inputs',
        );
        if (sourceType && targetType) {
          const allowed = CONNECTION_RULES[sourceType];
          if (!allowed?.includes(targetType)) {
            errors.push(
              `Edge ${edge.id}: incompatible types ${sourceType} → ${targetType} (${sourceNode.type}.${edge.sourceHandle} → ${targetNode.type}.${edge.targetHandle})`,
            );
          }
        } else {
          if (!sourceType) {
            warnings.push(
              `Edge ${edge.id}: unknown source handle "${edge.sourceHandle}" on ${sourceNode.type}`,
            );
          }
          if (!targetType) {
            warnings.push(
              `Edge ${edge.id}: unknown target handle "${edge.targetHandle}" on ${targetNode.type}`,
            );
          }
        }
      }
    }
  }

  return { errors, valid: errors.length === 0, warnings };
}

// =============================================================================
// REPAIR
// =============================================================================

let repairCounter = 0;

function generateRepairId(prefix: string): string {
  repairCounter += 1;
  return `${prefix}-repair-${repairCounter}`;
}

export function repairWorkflowJSON(
  workflow: GeneratedWorkflow,
): GeneratedWorkflow {
  repairCounter = 0;
  const repaired = structuredClone(workflow);

  // --- Fix name ---
  if (!repaired.name || typeof repaired.name !== 'string') {
    repaired.name = 'Generated Workflow';
  }
  if (!repaired.description || typeof repaired.description !== 'string') {
    repaired.description = '';
  }

  // --- Ensure arrays ---
  if (!Array.isArray(repaired.nodes)) repaired.nodes = [];
  if (!Array.isArray(repaired.edges)) repaired.edges = [];

  // --- Fix nodes ---
  const seenNodeIds = new Set<string>();
  for (const node of repaired.nodes) {
    // Fix missing ID
    if (!node.id || seenNodeIds.has(node.id)) {
      node.id = generateRepairId('node');
    }
    seenNodeIds.add(node.id);

    // Fix missing position
    if (
      !node.position ||
      typeof node.position.x !== 'number' ||
      typeof node.position.y !== 'number'
    ) {
      node.position = { x: 100, y: 200 };
    }

    // Fix missing data — merge with defaults
    if (!node.data || typeof node.data !== 'object') {
      node.data = {};
    }
    const def = NODE_DEFINITIONS[node.type as NodeType];
    if (def) {
      node.data = { ...def.defaultData, ...node.data };
    }
  }

  // Remove nodes with still-invalid types
  repaired.nodes = repaired.nodes.filter((n) => VALID_NODE_TYPES.has(n.type));

  // --- Fix edges ---
  const validNodeIds = new Set(repaired.nodes.map((n) => n.id));
  const seenEdgeIds = new Set<string>();

  repaired.edges = repaired.edges.filter((edge) => {
    // Fix missing ID
    if (!edge.id || seenEdgeIds.has(edge.id)) {
      edge.id = generateRepairId('edge');
    }
    seenEdgeIds.add(edge.id);

    // Remove edges referencing non-existent nodes
    if (!edge.source || !validNodeIds.has(edge.source)) return false;
    if (!edge.target || !validNodeIds.has(edge.target)) return false;

    // Remove edges with missing handles
    if (!edge.sourceHandle || !edge.targetHandle) return false;

    // Check handle type compatibility — remove incompatible edges
    const sourceNode = repaired.nodes.find((n) => n.id === edge.source);
    const targetNode = repaired.nodes.find((n) => n.id === edge.target);
    if (sourceNode && targetNode) {
      const sourceType = getHandleType(
        sourceNode.type,
        edge.sourceHandle,
        'outputs',
      );
      const targetType = getHandleType(
        targetNode.type,
        edge.targetHandle,
        'inputs',
      );
      if (sourceType && targetType) {
        const allowed = CONNECTION_RULES[sourceType];
        if (!allowed?.includes(targetType)) return false;
      }
    }

    return true;
  });

  return repaired;
}

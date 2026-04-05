/**
 * Propagation helpers for downstream output routing in the workflow graph.
 *
 * Data flow pipeline:
 *   getNodeOutput → computeDownstreamUpdates → hasStateChanged → applyNodeUpdates
 *
 * Key invariants:
 * - Cycle prevention via BFS visited set
 * - Gallery dedup via Set-based image merging
 * - Passthrough semantics: nodes with existing output re-enqueue for further propagation
 * - Change detection avoids unnecessary Zustand state updates
 * - `outputImages` array is checked BEFORE `outputImage` (multi-output nodes use the array)
 */

import type { WorkflowEdge, WorkflowNode } from '@genfeedai/types';

/**
 * Extract the primary output value from a node's data, following the priority chain.
 *
 * Priority order:
 * 1. `outputImages` (array → first element)
 * 2. `outputImage`
 * 3. `outputVideo`
 * 4. `outputText`
 * 5. `outputAudio`
 * 6. `prompt`
 * 7. `extractedTweet`
 * 8. `image`
 * 9. `video`
 * 10. `audio`
 */
export function getNodeOutput(node: WorkflowNode): string | null {
  const data = node.data as Record<string, unknown>;
  // outputImages array before outputImage — multi-output nodes store results in array
  const outputImages = data.outputImages as string[] | undefined;
  if (outputImages?.length) return outputImages[0];

  const output =
    data.outputImage ??
    data.outputVideo ??
    data.outputText ??
    data.outputAudio ??
    data.prompt ??
    data.extractedTweet ??
    data.image ??
    data.video ??
    data.audio ??
    null;
  if (output === null) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length > 0) return String(output[0]);
  return null;
}

/**
 * Classify a node type into its media output category.
 *
 * @returns The media type ('text' | 'image' | 'video' | 'audio') or null for unknown types.
 */
export function getOutputType(sourceType: string): 'text' | 'image' | 'video' | 'audio' | null {
  if (['prompt', 'llm', 'tweetParser', 'transcribe'].includes(sourceType)) {
    return 'text';
  }
  if (
    ['imageGen', 'image', 'imageInput', 'upscale', 'resize', 'reframe', 'imageGridSplit'].includes(
      sourceType
    )
  ) {
    return 'image';
  }
  if (
    [
      'videoGen',
      'video',
      'videoInput',
      'animation',
      'videoStitch',
      'lipSync',
      'voiceChange',
      'motionControl',
      'videoTrim',
      'videoFrameExtract',
      'subtitle',
    ].includes(sourceType)
  ) {
    return 'video';
  }
  if (['textToSpeech', 'audio', 'audioInput'].includes(sourceType)) {
    return 'audio';
  }
  return null;
}

/**
 * Map a source node's output to the correct input field(s) on a target node.
 *
 * Uses `getOutputType` to classify the source, then applies type-aware routing rules.
 *
 * @returns An object with the input field(s) to set, or null if incompatible.
 */
export function mapOutputToInput(
  output: string,
  sourceType: string,
  targetType: string
): Record<string, unknown> | null {
  const outputType = getOutputType(sourceType);

  // Handle download node
  if (targetType === 'download') {
    if (outputType === 'video') {
      return { inputImage: null, inputType: 'video', inputVideo: output };
    }
    if (outputType === 'image') {
      return { inputImage: output, inputType: 'image', inputVideo: null };
    }
    return null;
  }

  if (outputType === 'text') {
    if (['textToSpeech', 'subtitle'].includes(targetType)) {
      return { inputText: output };
    }
    if (['imageGen', 'videoGen', 'llm', 'motionControl'].includes(targetType)) {
      return { inputPrompt: output };
    }
  }

  if (outputType === 'image') {
    if (['upscale', 'reframe'].includes(targetType)) {
      return { inputImage: output, inputType: 'image', inputVideo: null };
    }
    if (
      ['videoGen', 'lipSync', 'voiceChange', 'motionControl', 'resize', 'animation'].includes(
        targetType
      )
    ) {
      return { inputImage: output };
    }
    if (targetType === 'imageGen') {
      return { inputImages: [output] };
    }
  }

  if (outputType === 'video') {
    if (['upscale', 'reframe'].includes(targetType)) {
      return { inputImage: null, inputType: 'video', inputVideo: output };
    }
    if (
      [
        'lipSync',
        'voiceChange',
        'resize',
        'videoStitch',
        'videoTrim',
        'videoFrameExtract',
        'subtitle',
        'transcribe',
      ].includes(targetType)
    ) {
      return { inputVideo: output };
    }
  }

  if (outputType === 'audio') {
    if (['lipSync', 'voiceChange', 'transcribe'].includes(targetType)) {
      return { inputAudio: output };
    }
  }

  return null;
}

/**
 * Collect images for a gallery node, deduplicating across existing gallery images,
 * pending update images (from other edges in the same BFS pass), and new source images.
 *
 * @param sourceData - The source node's data record
 * @param currentOutput - The current BFS output string
 * @param existingGalleryImages - Images already in the gallery node's data
 * @param pendingUpdateImages - Images accumulated from earlier edges in this propagation
 * @returns An update object with deduplicated `images` array, or null if no images to add.
 */
export function collectGalleryUpdate(
  sourceData: Record<string, unknown>,
  currentOutput: string,
  existingGalleryImages: string[],
  pendingUpdateImages: string[]
): Record<string, unknown> | null {
  const allImages: string[] = [];

  const outputImagesArr = sourceData.outputImages as string[] | undefined;
  if (outputImagesArr?.length) {
    allImages.push(...outputImagesArr);
  } else if (typeof currentOutput === 'string') {
    allImages.push(currentOutput);
  }

  if (allImages.length === 0) return null;

  return {
    images: [...new Set([...existingGalleryImages, ...pendingUpdateImages, ...allImages])],
  };
}

/**
 * Compute all downstream node updates via BFS traversal from a source node.
 *
 * Pure function — reads `nodes` and `edges` as snapshot parameters, never touches the store.
 *
 * @returns A Map of nodeId → partial data updates to apply.
 */
export function computeDownstreamUpdates(
  sourceNodeId: string,
  initialOutput: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Map<string, Record<string, unknown>> {
  const updates: Map<string, Record<string, unknown>> = new Map();
  const visited = new Set<string>();
  const queue: Array<{ nodeId: string; output: string }> = [
    { nodeId: sourceNodeId, output: initialOutput },
  ];

  // --- BFS traversal ---
  while (queue.length > 0) {
    const current = queue.shift()!;

    // --- Cycle prevention ---
    if (visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);

    const currentNode = nodes.find((n) => n.id === current.nodeId);
    if (!currentNode) continue;

    const downstreamEdges = edges.filter((e) => e.source === current.nodeId);

    for (const edge of downstreamEdges) {
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (!targetNode) continue;

      // --- Gallery aggregation (outputGallery special case) ---
      if (targetNode.type === 'outputGallery') {
        const sourceData = currentNode.data as Record<string, unknown>;
        const existing = updates.get(edge.target) ?? {};
        const pendingImages = (existing.images as string[]) ?? [];
        const targetData = targetNode.data as Record<string, unknown>;
        const galleryExisting = (targetData.images as string[]) ?? [];

        const galleryUpdate = collectGalleryUpdate(
          sourceData,
          current.output,
          galleryExisting,
          pendingImages
        );

        if (galleryUpdate) {
          updates.set(edge.target, { ...existing, ...galleryUpdate });
        }
        continue;
      }

      // --- Type-aware routing ---
      const inputUpdate = mapOutputToInput(current.output, currentNode.type, targetNode.type);
      if (inputUpdate) {
        const existing = updates.get(edge.target) ?? {};
        updates.set(edge.target, { ...existing, ...inputUpdate });

        // --- Passthrough: re-enqueue if target already has output ---
        const targetOutput = getNodeOutput(targetNode);
        if (targetOutput && !visited.has(edge.target)) {
          queue.push({ nodeId: edge.target, output: targetOutput });
        }
      }
    }
  }

  return updates;
}

/**
 * Check whether any of the computed updates differ from the current node data.
 *
 * Uses element-wise array comparison for arrays and strict equality for primitives.
 * Short-circuits on the first detected change.
 */
export function hasStateChanged(
  updates: Map<string, Record<string, unknown>>,
  nodes: WorkflowNode[]
): boolean {
  for (const [nodeId, update] of updates) {
    const existingNode = nodes.find((n) => n.id === nodeId);
    if (!existingNode) continue;
    const existingData = existingNode.data as Record<string, unknown>;
    for (const [key, value] of Object.entries(update)) {
      const prev = existingData[key];
      if (Array.isArray(prev) && Array.isArray(value)) {
        if (prev.length !== value.length || prev.some((v, i) => v !== value[i])) {
          return true;
        }
      } else if (prev !== value) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Apply computed updates to the nodes array immutably.
 *
 * Nodes without updates are returned by reference (no new object allocation).
 */
export function applyNodeUpdates(
  nodes: WorkflowNode[],
  updates: Map<string, Record<string, unknown>>
): WorkflowNode[] {
  return nodes.map((n) => {
    const update = updates.get(n.id);
    if (update) {
      return { ...n, data: { ...n.data, ...update } };
    }
    return n;
  });
}

/**
 * Propagate existing outputs to downstream nodes after loading a workflow.
 * Uses `getNodeOutput` to check for any output value, ensuring the same
 * priority chain is used everywhere (outputImages, outputImage, etc.).
 *
 * Used by both `loadWorkflow` and `loadWorkflowById` in the persistence slice.
 */
export function propagateExistingOutputs(
  nodes: WorkflowNode[],
  propagateFn: (nodeId: string) => void
): void {
  for (const node of nodes) {
    if (getNodeOutput(node) !== null) {
      propagateFn(node.id);
    }
  }
}

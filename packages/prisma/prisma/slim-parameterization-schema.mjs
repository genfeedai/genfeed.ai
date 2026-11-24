// Shrinks the query parameterization schema Prisma writes into the generated client.
//
// Prisma 7 turns every query into a plan keyed by its shape, with the values
// pulled out as parameters, so the query compiler runs once per shape. For that
// it ships a graph of every model's input and output types: 29,458 input nodes
// and 559,421 edges for this schema, in `class.ts` as a 6 MB string. The client
// deserializes the whole graph into JavaScript objects in its constructor and
// keeps them for the life of the process: 83 to 137 MB of live heap in every
// server, from the first second (#11147). The garbage collector marks that heap
// on every full collection, and the marking is what stalls requests (#10110).
// Prisma 8.1.0-dev.12 deserializes it the same way.
//
// A field the graph does not know is left as a literal in the query, and the
// plan is then keyed by the value. That is safe for reads, but not for every
// write: with the write roots cut, the connected breakout acceptance suites
// (outliers, PostgreSQL) failed in CI on a held response whose evidence rows had
// been written without their parameter types. So every root of every model
// stays, and what is cut is the depth below it: a root keeps its own arguments
// and the where-input and the filters of its scalar fields (`{ in: [...] }`).
// The where-inputs of related models and the nested relation writes, which are
// most of the graph, are the part that is dropped.
//
// This file lives in prisma/ because the image builds copy only this directory
// and prisma.config.mjs before they install, and prisma/generate-client.mjs,
// which runs it after `prisma generate`, lives here too.
import { readFileSync, writeFileSync } from 'node:fs';

/** Levels of nested input and output nodes kept below each root. */
const READ_DEPTH = 2;

const ROOT_PATTERN = /^[A-Za-z]+\./u;
const STRINGS_PATTERN = /strings: JSON\.parse\(("(?:[^"\\]|\\.)*")\),/u;
const GRAPH_PATTERN = /graph: "([A-Za-z0-9_-]*)"/u;

/** How many nested levels of a root's types the graph keeps; undefined drops it. */
export function keptDepth(rootName) {
  return ROOT_PATTERN.test(rootName) ? READ_DEPTH : undefined;
}

/**
 * @param {string} encoded base64url graph
 * @param {string[]} strings
 */
export function decodeGraph(encoded, strings) {
  const buffer = Buffer.from(encoded, 'base64url');
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  let position = 0;
  const varint = () => {
    let value = 0;
    let shift = 0;
    let byte;
    do {
      byte = view.getUint8(position++);
      value |= (byte & 127) << shift;
      shift += 7;
    } while (byte >= 128);
    return value;
  };
  const optional = () => {
    const value = varint();
    return value === 0 ? undefined : value - 1;
  };
  const byteValue = () => view.getUint8(position++);
  const short = () => {
    const value = view.getUint16(position, true);
    position += 2;
    return value;
  };

  const inputCount = varint();
  const outputCount = varint();
  const rootCount = varint();
  const inputNodes = [];
  for (let node = 0; node < inputCount; node++) {
    const edges = [];
    for (let count = varint(); count > 0; count--) {
      const name = varint();
      const scalarMask = short();
      const childNodeId = optional();
      const enumNameIndex = optional();
      edges.push({
        childNodeId,
        enumNameIndex,
        flags: byteValue(),
        name,
        scalarMask,
      });
    }
    inputNodes.push(edges);
  }
  const outputNodes = [];
  for (let node = 0; node < outputCount; node++) {
    const edges = [];
    for (let count = varint(); count > 0; count--) {
      edges.push({
        name: varint(),
        argsNodeId: optional(),
        outputNodeId: optional(),
      });
    }
    outputNodes.push(edges);
  }
  const roots = [];
  for (let root = 0; root < rootCount; root++) {
    roots.push({
      name: varint(),
      argsNodeId: optional(),
      outputNodeId: optional(),
    });
  }
  if (position !== buffer.length) {
    throw new Error(
      `parameterization graph has ${buffer.length - position} unread bytes: the Prisma graph format changed`,
    );
  }
  return { inputNodes, outputNodes, roots, strings };
}

/** @param {ReturnType<typeof decodeGraph>} graph */
export function encodeGraph(graph) {
  const bytes = [];
  const varint = (input) => {
    let value = input;
    do {
      let byte = value & 127;
      value >>>= 7;
      if (value) byte |= 128;
      bytes.push(byte);
    } while (value);
  };
  const optional = (value) => varint(value === undefined ? 0 : value + 1);

  varint(graph.inputNodes.length);
  varint(graph.outputNodes.length);
  varint(graph.roots.length);
  for (const edges of graph.inputNodes) {
    varint(edges.length);
    for (const edge of edges) {
      varint(edge.name);
      bytes.push(edge.scalarMask & 255, (edge.scalarMask >> 8) & 255);
      optional(edge.childNodeId);
      optional(edge.enumNameIndex);
      bytes.push(edge.flags);
    }
  }
  for (const edges of graph.outputNodes) {
    varint(edges.length);
    for (const edge of edges) {
      varint(edge.name);
      optional(edge.argsNodeId);
      optional(edge.outputNodeId);
    }
  }
  for (const root of graph.roots) {
    varint(root.name);
    optional(root.argsNodeId);
    optional(root.outputNodeId);
  }
  return Buffer.from(bytes).toString('base64url');
}

/**
 * Keeps the roots `depthOf` names, and the nodes within that many levels below
 * each. An edge whose child node is cut keeps its flags and loses its child, so
 * the runtime leaves that value as a literal. Nodes and strings are renumbered.
 *
 * @param {ReturnType<typeof decodeGraph>} graph
 * @param {(rootName: string) => number | undefined} depthOf
 */
export function pruneGraph(graph, depthOf) {
  const inputDepth = new Map();
  const outputDepth = new Map();
  const pending = [];
  const roots = [];
  for (const root of graph.roots) {
    const depth = depthOf(graph.strings[root.name]);
    if (depth === undefined) continue;
    roots.push(root);
    if (root.argsNodeId !== undefined)
      pending.push(['input', root.argsNodeId, depth]);
    if (root.outputNodeId !== undefined)
      pending.push(['output', root.outputNodeId, depth]);
  }
  while (pending.length > 0) {
    const [kind, id, depth] = pending.pop();
    const seen = kind === 'input' ? inputDepth : outputDepth;
    if ((seen.get(id) ?? -1) >= depth) continue;
    seen.set(id, depth);
    if (depth === 0) continue;
    if (kind === 'input') {
      for (const edge of graph.inputNodes[id]) {
        if (edge.childNodeId === undefined) continue;
        // Below the root's own arguments, follow only the filters of scalar
        // fields (`{ in: [...] }`), not the where-inputs of related models,
        // which is where most of the graph is.
        const isDeep = depth < READ_DEPTH;
        if (isDeep && edge.scalarMask === 0 && edge.enumNameIndex === undefined)
          continue;
        pending.push(['input', edge.childNodeId, depth - 1]);
      }
    } else {
      for (const edge of graph.outputNodes[id]) {
        if (edge.argsNodeId !== undefined)
          pending.push(['input', edge.argsNodeId, depth - 1]);
        if (edge.outputNodeId !== undefined)
          pending.push(['output', edge.outputNodeId, depth - 1]);
      }
    }
  }

  const renumber = (ids) =>
    new Map([...ids].sort((a, b) => a - b).map((id, index) => [id, index]));
  const inputIds = renumber(inputDepth.keys());
  const outputIds = renumber(outputDepth.keys());
  const strings = [];
  const stringIds = new Map();
  const string = (index) => {
    if (index === undefined) return undefined;
    let id = stringIds.get(index);
    if (id === undefined) {
      id = strings.length;
      strings.push(graph.strings[index]);
      stringIds.set(index, id);
    }
    return id;
  };

  const inputNodes = [...inputIds.keys()].map((id) =>
    graph.inputNodes[id].map((edge) => ({
      childNodeId: inputIds.get(edge.childNodeId),
      enumNameIndex: string(edge.enumNameIndex),
      flags: edge.flags,
      name: string(edge.name),
      scalarMask: edge.scalarMask,
    })),
  );
  const outputNodes = [...outputIds.keys()].map((id) =>
    graph.outputNodes[id].map((edge) => ({
      argsNodeId: inputIds.get(edge.argsNodeId),
      name: string(edge.name),
      outputNodeId: outputIds.get(edge.outputNodeId),
    })),
  );
  return {
    inputNodes,
    outputNodes,
    roots: roots.map((root) => ({
      argsNodeId: inputIds.get(root.argsNodeId),
      name: string(root.name),
      outputNodeId: outputIds.get(root.outputNodeId),
    })),
    strings,
  };
}

/**
 * Rewrites the schema inside the text of the generated `internal/class.ts`.
 * Throws when the file is not laid out as expected, so a Prisma upgrade that
 * changes the generated shape fails the generate step instead of silently
 * shipping the whole graph again.
 *
 * @param {string} source
 * @returns {{ source: string, before: number, after: number }} edge counts
 */
export function slimClassSource(source) {
  const stringsMatch = STRINGS_PATTERN.exec(source);
  const graphMatch = GRAPH_PATTERN.exec(source);
  if (!stringsMatch || !graphMatch || graphMatch[1] === '') {
    throw new Error(
      'generated client has no parameterization graph in the expected layout; update prisma/slim-parameterization-schema.mjs for this Prisma version',
    );
  }
  const strings = JSON.parse(JSON.parse(stringsMatch[1]));
  const full = decodeGraph(graphMatch[1], strings);
  const slim = pruneGraph(full, keptDepth);
  const countEdges = (graph) =>
    graph.inputNodes.reduce((total, edges) => total + edges.length, 0);
  return {
    after: countEdges(slim),
    before: countEdges(full),
    source: source
      .replace(
        STRINGS_PATTERN,
        () =>
          `strings: JSON.parse(${JSON.stringify(JSON.stringify(slim.strings))}),`,
      )
      .replace(GRAPH_PATTERN, () => `graph: "${encodeGraph(slim)}"`),
  };
}

/**
 * Slims the generated client in place. Running it again on a slim client
 * changes nothing.
 *
 * @param {string} packageRoot
 */
export function slimGeneratedClient(packageRoot) {
  const file = `${packageRoot}/generated/prisma/client/internal/class.ts`;
  const result = slimClassSource(readFileSync(file, 'utf8'));
  writeFileSync(file, result.source);
  return result;
}

import { isProxy } from 'node:util/types';

export function matchBrandLiteralBlocks(
  text: string,
  literals: readonly string[],
):
  | number[]
  | 'factual_coverage_unverified'
  | 'factual_coverage_ambiguous'
  | 'factual_coverage_work_limit'
  | 'no_visible_text' {
  function invalid(): never {
    throw new TypeError('brand_validation_invalid_literal_match_input');
  }
  if (typeof text !== 'string') invalid();
  if (isProxy(literals)) invalid();
  if (
    !Array.isArray(literals) ||
    Object.getPrototypeOf(literals) !== Array.prototype
  )
    invalid();
  const lengthDescriptor = Object.getOwnPropertyDescriptor(literals, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor)) invalid();
  const length: unknown = lengthDescriptor.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0)
    invalid();
  if (text.length > 100000 || length > 128)
    return 'factual_coverage_work_limit';
  const captured: string[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(literals, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid();
    const value: unknown = descriptor.value;
    if (typeof value !== 'string') invalid();
    if (value.length > 4000) return 'factual_coverage_work_limit';
    captured.push(value);
  }
  let used = 0;
  function charge(amount: number): boolean {
    if (amount > 4000000 - used) return false;
    used += amount;
    return true;
  }
  if (!charge(text.length)) return 'factual_coverage_work_limit';
  const normalizedText = text.replaceAll('\r\n', '\n').normalize('NFC');
  if (normalizedText.length > 100000 || !charge(normalizedText.length))
    return 'factual_coverage_work_limit';
  const actual = normalizedText.trim();
  const prepared: string[] = [];
  for (const raw of captured) {
    if (!charge(raw.length)) return 'factual_coverage_work_limit';
    const normalized = raw.replaceAll('\r\n', '\n').normalize('NFC');
    if (normalized.length > 4000 || !charge(normalized.length))
      return 'factual_coverage_work_limit';
    const literal = normalized.trim();
    if (literal.length === 0) invalid();
    prepared.push(literal);
  }
  if (actual.length === 0) return 'no_visible_text';
  const n = actual.length;
  const ways = new Uint8Array(n + 1);
  const separatorEnds = new Int32Array(n + 1).fill(-1);
  const predecessorPositions = new Int32Array(n + 1).fill(-1);
  const predecessorLiteralIndexes = new Int32Array(n + 1).fill(-1);
  ways[0] = 1;
  const lineFeeds: number[] = [];
  function flush(endpoint: number): boolean {
    for (let index = 0; index < lineFeeds.length - 1; index++) {
      if (!charge(1)) return false;
      separatorEnds[lineFeeds[index]] = endpoint;
    }
    lineFeeds.length = 0;
    return true;
  }
  for (let index = 0; index < n; index++) {
    if (!charge(1)) return 'factual_coverage_work_limit';
    const unit = actual.charCodeAt(index);
    if (unit === 10) lineFeeds.push(index);
    else if (unit !== 32 && unit !== 9 && lineFeeds.length > 0 && !flush(index))
      return 'factual_coverage_work_limit';
  }
  if (lineFeeds.length > 0 && !flush(n)) return 'factual_coverage_work_limit';
  for (let position = 0; position < n; position++) {
    if (ways[position] === 0) continue;
    for (let literalIndex = 0; literalIndex < prepared.length; literalIndex++) {
      if (!charge(1)) return 'factual_coverage_work_limit';
      const literal = prepared[literalIndex];
      if (literal.length > n - position) continue;
      let equal = true;
      for (let index = 0; index < literal.length; index++) {
        if (!charge(1)) return 'factual_coverage_work_limit';
        if (actual.charCodeAt(position + index) !== literal.charCodeAt(index)) {
          equal = false;
          break;
        }
      }
      if (!equal) continue;
      const end = position + literal.length;
      const target = end === n ? n : separatorEnds[end];
      if (target <= position || (end !== n && target >= n)) continue;
      if (!charge(1)) return 'factual_coverage_work_limit';
      ways[target] = Math.min(2, ways[target] + ways[position]);
      if (ways[target] === 1) {
        predecessorPositions[target] = position;
        predecessorLiteralIndexes[target] = literalIndex;
      } else {
        predecessorPositions[target] = -1;
        predecessorLiteralIndexes[target] = -1;
      }
      if (ways[n] === 2) return 'factual_coverage_ambiguous';
    }
  }
  if (ways[n] === 0) return 'factual_coverage_unverified';
  const sequence: number[] = [];
  for (
    let position = n;
    position > 0;
    position = predecessorPositions[position]
  ) {
    if (!charge(1)) return 'factual_coverage_work_limit';
    sequence.push(predecessorLiteralIndexes[position]);
  }
  sequence.reverse();
  return sequence;
}

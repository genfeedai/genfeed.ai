import { isArrayBuffer, isUint8Array } from 'node:util/types';
import type { BrandArtifactValidationMaterialV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

function invalid(): never {
  throw new TypeError('brand_validation_invalid_input');
}
function assertShape(value: unknown, keys: readonly string[]): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.getOwnPropertySymbols(value).length
  )
    invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.keys(descriptors).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(descriptors, key))
  )
    invalid();
  for (const descriptor of Object.values(descriptors))
    if (!descriptor.enumerable || !('value' in descriptor)) invalid();
}
function assertArray(value: unknown): void {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length
  )
    invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== value.length + 1) invalid();
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid();
  }
}
export function assertBrandValidationMetadata(value: unknown): void {
  let visited = 0;
  let units = 0;
  const ancestors = new Set<object>();
  function walk(entry: unknown, depth: number, optional = false): void {
    if (depth > 16 || ++visited > 32768) invalid();
    if (typeof entry === 'string') {
      units += entry.length;
      if (units > 500000) invalid();
      return;
    }
    if (
      entry === null ||
      typeof entry === 'boolean' ||
      (typeof entry === 'number' && Number.isFinite(entry)) ||
      (optional && entry === undefined)
    )
      return;
    if (!entry || typeof entry !== 'object' || ancestors.has(entry)) invalid();
    const array = Array.isArray(entry);
    const prototype = Object.getPrototypeOf(entry);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      invalid();
    const keys = Reflect.ownKeys(entry);
    if (keys.length > 1024 || keys.some((key) => typeof key !== 'string'))
      invalid();
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    if (array) {
      const length = descriptors.length;
      if (
        !length ||
        !('value' in length) ||
        length.enumerable ||
        !Number.isSafeInteger(length.value) ||
        length.value < 0 ||
        keys.length !== length.value + 1
      )
        invalid();
      for (let index = 0; index < length.value; index++)
        if (!Object.hasOwn(descriptors, String(index))) invalid();
    }
    ancestors.add(entry);
    try {
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (array && key === 'length') continue;
        units += key.length;
        if (
          units > 500000 ||
          ['__proto__', 'constructor', 'prototype'].includes(key) ||
          !descriptor.enumerable ||
          !('value' in descriptor)
        )
          invalid();
        if (
          array &&
          (!/^(0|[1-9]\d*)$/.test(key) ||
            Number(key) >= descriptors.length.value)
        )
          invalid();
        walk(descriptor.value, depth + 1, !array);
      }
    } finally {
      ancestors.delete(entry);
    }
  }
  try {
    walk(value, 0);
  } catch {
    invalid();
  }
}
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const viewBuffer = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'buffer',
)?.get;
const viewOffset = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteOffset',
)?.get;
const viewBytes = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength',
)?.get;
const viewLength = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'length',
)?.get;
const backingBytes = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength',
)?.get;
const backingResizable = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'resizable',
)?.get;
function captureBrandValidationByteView(bytes: Uint8Array): Buffer {
  if (
    !isUint8Array(bytes) ||
    ![Uint8Array.prototype, Buffer.prototype].includes(
      Object.getPrototypeOf(bytes),
    )
  )
    invalid();
  for (const key of ['buffer', 'byteOffset', 'byteLength', 'length'])
    if (Object.getOwnPropertyDescriptor(bytes, key)) invalid();
  if (!viewBuffer || !viewOffset || !viewBytes || !viewLength || !backingBytes)
    invalid();
  const backing: unknown = viewBuffer.call(bytes);
  const offset: unknown = viewOffset.call(bytes);
  const length: unknown = viewLength.call(bytes);
  const byteLength: unknown = viewBytes.call(bytes);
  if (
    !isArrayBuffer(backing) ||
    Object.getPrototypeOf(backing) !== ArrayBuffer.prototype
  )
    invalid();
  for (const key of ['byteLength', 'resizable', 'maxByteLength', 'detached'])
    if (Object.getOwnPropertyDescriptor(backing, key)) invalid();
  const backingLength: unknown = backingBytes.call(backing);
  const resizable: unknown = backingResizable?.call(backing);
  if (
    resizable === true ||
    typeof backingLength !== 'number' ||
    !Number.isSafeInteger(backingLength) ||
    typeof offset !== 'number' ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    typeof byteLength !== 'number' ||
    !Number.isSafeInteger(byteLength) ||
    byteLength <= 0 ||
    typeof length !== 'number' ||
    !Number.isSafeInteger(length) ||
    length !== byteLength ||
    byteLength > backingLength - offset
  )
    invalid();
  return Buffer.from(backing, offset, byteLength);
}
export function copyBrandValidationMaterial(
  material: BrandArtifactValidationMaterialV1,
): BrandArtifactValidationMaterialV1 {
  try {
    assertShape(material, [
      'artifactKind',
      'artifactId',
      'artifactVersion',
      'textBytes',
      'parts',
      'references',
    ]);
    if (
      typeof material.artifactKind !== 'string' ||
      typeof material.artifactId !== 'string' ||
      typeof material.artifactVersion !== 'string'
    )
      invalid();
    assertArray(material.parts);
    assertArray(material.references);
    if (material.parts.length > 8 || material.references.length > 8) invalid();
    const captured = new Map<Uint8Array, Buffer>();
    function capture(bytes: Uint8Array): number {
      const alias = captureBrandValidationByteView(bytes);
      captured.set(bytes, alias);
      return alias.byteLength;
    }
    function owned(bytes: Uint8Array): Buffer {
      const alias = captured.get(bytes);
      if (!alias) invalid();
      return Buffer.from(alias);
    }
    let artifactBytes =
      material.textBytes === null ? 0 : capture(material.textBytes);
    let referenceBytes = 0;
    for (const part of material.parts) {
      assertShape(part, ['partId', 'partVersion', 'bytes']);
      if (
        typeof part.partId !== 'string' ||
        typeof part.partVersion !== 'string'
      )
        invalid();
      artifactBytes += capture(part.bytes);
      if (artifactBytes > 20971520) invalid();
    }
    for (const reference of material.references) {
      assertShape(reference, ['assetReferenceId', 'assetId', 'bytes']);
      if (
        typeof reference.assetReferenceId !== 'string' ||
        typeof reference.assetId !== 'string'
      )
        invalid();
      referenceBytes += capture(reference.bytes);
      if (referenceBytes > 20971520) invalid();
    }
    if (artifactBytes > 20971520) invalid();
    return {
      artifactKind: material.artifactKind,
      artifactId: material.artifactId,
      artifactVersion: material.artifactVersion,
      textBytes: material.textBytes === null ? null : owned(material.textBytes),
      parts: material.parts.map((part) => ({
        partId: part.partId,
        partVersion: part.partVersion,
        bytes: owned(part.bytes),
      })),
      references: material.references.map((reference) => ({
        assetReferenceId: reference.assetReferenceId,
        assetId: reference.assetId,
        bytes: owned(reference.bytes),
      })),
    };
  } catch {
    invalid();
  }
}

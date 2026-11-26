/**
 * What a reusable Library element is (#7374). Values match Prisma
 * `LibraryElementType`. Characters are `Persona` rows, not elements.
 * @see packages/prisma/prisma/schema.prisma `enum LibraryElementType`
 */
export enum LibraryElementType {
  LOCATION = 'LOCATION',
  STYLE = 'STYLE',
  PROP = 'PROP',
}

/** Every kind the References list shows: the three element types and characters. */
export type LibraryElementKind = 'CHARACTER' | `${LibraryElementType}`;

export const LIBRARY_ELEMENT_KINDS: readonly LibraryElementKind[] = [
  'CHARACTER',
  LibraryElementType.LOCATION,
  LibraryElementType.STYLE,
  LibraryElementType.PROP,
];

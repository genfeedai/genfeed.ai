import type {
  AnonymisationContext,
  PreparedTerm,
  ResidualCategory,
} from './golden-set.types';

export const prepareTerms = (
  _context: AnonymisationContext,
): PreparedTerm[] => [];

export const anonymiseText = (
  text: string,
  _context: AnonymisationContext,
): string => text;

export const findResidualIdentifiers = (
  _text: string,
  _context: AnonymisationContext,
): ResidualCategory[] => [];

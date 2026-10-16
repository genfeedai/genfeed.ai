/**
 * Most reference images one character can hold. Position 0 is the primary
 * reference; generation sends the references in order, capped again by each
 * model's own reference limit.
 */
export const MAX_CHARACTER_REFERENCES = 14;

/** Most assets one reference-usage lookup may ask about. */
export const MAX_CHARACTER_REFERENCE_USAGE_LOOKUP = 100;

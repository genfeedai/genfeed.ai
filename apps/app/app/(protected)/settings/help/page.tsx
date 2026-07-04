// Help ("Help & Community") is a static list of documentation and social links
// with no org/brand data, so it is served in the personal Settings scope too.
// Re-exports the canonical help page (mirrors how personal /settings re-exports
// the personal page).
export {
  default,
  generateMetadata,
} from '../../[orgSlug]/~/settings/(pages)/help/page';

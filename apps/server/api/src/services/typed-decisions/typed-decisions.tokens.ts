/**
 * DI token for the bound typed-decision provider. The provider is an
 * interface, so it cannot be its own token; every injection site uses
 * `@Inject(TYPED_DECISION_PROVIDER)` with an `import type` of the contract.
 */
export const TYPED_DECISION_PROVIDER = Symbol('TYPED_DECISION_PROVIDER');

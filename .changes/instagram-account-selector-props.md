packages: @genfeedai/props @genfeedai/client @genfeedai/serializers @genfeedai/services

Add `InstagramAccountSelectorProps` for the Instagram OAuth account-selection
picker, extend the OAuth callback and generic modal prop surfaces, and add
the `needsAccountSelection` credential field this picker reads.

- `props`: new `./auth/instagram-account-selector.props` export
  (`credentialId`, `onConnected`, optional `onBack`/`onError`).
- `./auth/oauth-platform-form.props`: `VerifyResult` gains a `selecting`
  status variant carrying `credentialId`, for the account-selection step.
- `./modals/modal.props`: `ModalBrandInstagramProps` removed — the unwired,
  unused `ModalBrandInstagram` modal was deleted in favor of the new
  standalone selector component.
- `@genfeedai/client`'s `./src/models/organization/credential.model`:
  `BaseCredential` gains an optional `needsAccountSelection: boolean` field,
  mirroring the new `ICredential` contract field.
- `@genfeedai/serializers`'s
  `./src/attributes/organizations/credential.attributes`: the credential
  serializer now derives and exposes `needsAccountSelection` — true when a
  provider token was persisted but never resolved to a specific account
  (unconnected, no `externalId`) — computed server-side instead of left for
  callers to infer from `isConnected` alone.
- `@genfeedai/services`'s `./external/services.service`: new
  `postSelectAccount(credentialId, externalId)` method, posting to the new
  `POST /services/instagram/:credentialId/select-account` endpoint.

Existing consumers of `VerifyResult`, `modal.props`, `BaseCredential`, the
credential serializer, and `ServicesService` keep compiling; nothing else in
any of these surfaces changed shape.

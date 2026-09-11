packages: @genfeedai/props

Add `InstagramAccountSelectorProps` for the Instagram OAuth account-selection
picker, and extend the OAuth callback and generic modal prop surfaces.

- `props`: new `./auth/instagram-account-selector.props` export
  (`credentialId`, `onConnected`, optional `onBack`/`onError`).
- `./auth/oauth-platform-form.props`: `VerifyResult` gains a `selecting`
  status variant carrying `credentialId`, for the account-selection step.
- `./modals/modal.props`: `ModalBrandInstagramProps` removed — the unwired,
  unused `ModalBrandInstagram` modal was deleted in favor of the new
  standalone selector component.

Existing consumers of `VerifyResult` and `modal.props` keep compiling;
nothing else in either surface changed shape.

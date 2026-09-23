packages: @genfeedai/helpers

Forward a landing-page referral code onto app sign-up links (#4970).
`appendSignupAttributionParams` takes an optional third argument, the referral
code. A valid code is written as `ref` only when the URL does not already
have one. Invalid codes are dropped.

`ref` is not part of `ISignupAttribution` or `SIGNUP_ATTRIBUTION_QUERY_PARAMS`.
New exports: `SIGNUP_REFERRAL_QUERY_PARAM`, `normalizeSignupReferralCode`,
and `readSignupReferralCode`. Existing two-argument callers keep working.

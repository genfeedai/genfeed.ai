packages: @genfeedai/client @genfeedai/helpers

Signup attribution: `UserModel` carries the attribution fields recorded at
signup, and `@genfeedai/helpers` adds
`./src/onboarding/signup-attribution.helper` for normalizing a landing path,
referrer domain and UTM values. Additive — no existing export changed shape.

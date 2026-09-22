packages: @genfeedai/client @genfeedai/helpers @genfeedai/props @genfeedai/serializers @genfeedai/services

Record where each new user came from (#4955). Additive: `UserModel` and the
user serializer attributes carry the attribution recorded at signup,
`@genfeedai/helpers` adds `./src/onboarding/signup-attribution.helper` for
normalizing a landing path, referrer domain and UTM values, the auth callback
props carry it through the callback URL, and the users service records it. No
existing export changed shape.

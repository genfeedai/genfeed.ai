packages: @genfeedai/config @genfeedai/libs

Add optional CloudFront signing configuration for media URLs: a key-pair id, a
private key and a signed-URL TTL, with matching `ConfigService` getters
(`cdnSigningKeyPairId`, `cdnSigningPrivateKey`, `cdnSignedUrlTtlSeconds`,
`isCdnSigningEnabled`). All three are optional; leaving the key pair unset keeps
media URLs unsigned, which is the self-hosted default.

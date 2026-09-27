packages: @genfeedai/services

Export `getRequestOrganizationHeaders()` from `core/interceptor.service`. Raw
`fetch` tenant clients use it to send `x-genfeed-organization-id` under the same
rule as the axios interceptor, so the API fails closed on organization drift.

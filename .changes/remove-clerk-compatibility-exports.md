packages: @genfeedai/auth-client

Remove the unused Clerk-shaped React exports `useUser`, `useOrganization`, `useOrganizationList`, `SignIn`, `SignUp`, and `SignInButton` from `@genfeedai/auth-client/react`.

Use the first-party `useAuth` identity hook or `authClient.useSession()` for session data. Resolve organization data through the existing application organization hooks, and use the application sign-in/sign-up routes instead of placeholder components. No production repository consumers imported the removed exports.

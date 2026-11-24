# Authentication

**Most is pre-configured.** Works with Firebase Auth or Supabase Auth. Add env vars and config. Framework handles providers, callbacks, sessions.

---

## Standard Use

**Environment:**
```bash
# .env
VITE_AUTH_PARTNERS=password,emailLink,google,github,facebook
```

**Firebase:** Enable providers in Firebase Console > Authentication > Sign-in method
**Supabase:** Enable providers in Supabase Dashboard > Authentication > Providers

---

## Auth Config

All auth behavior is configured in `src/config/app.ts` under the `auth` key. The framework provides sensible defaults.

```typescript
// src/config/app.ts
export const appConfig: AppConfig = {
  auth: {
    // Where to redirect when auth is required but user is not logged in.
    // null (default) = show AuthGuardFallback in-place (no redirect, best UX).
    // string = redirect to that route (e.g. '/signin').
    authRoute: null,

    // Where to redirect when user has wrong role (default: '/404').
    roleRoute: '/404',

    // Where to redirect when user has wrong subscription tier (default: '/404').
    tierRoute: '/404',

    // Path to a dedicated login page. If set, AuthHeader links to it.
    // If undefined (default), auth providers show in the header dropdown.
    loginPath: undefined,

    // Path to password reset callback page (default: '/auth/reset-password').
    // Framework auto-handles this route.
    resetPasswordPath: '/auth/reset-password',

    // Path to profile page (default: '/profile').
    profilePath: '/profile',

    // Custom menu items in the authenticated user dropdown.
    authMenuItems: [
      { path: '/dashboard', label: 'Dashboard' },
    ],
  },
};
```

### Auth Route Behavior

| `authRoute` value | Behavior when unauthenticated user hits protected route |
|---|---|
| `null` (default) | `AuthGuardFallback` renders in-place - sign-in form on the protected page itself. User stays in context. Best UX. |
| `'/'` | Redirect to homepage. |
| `'/signin'` | Redirect to custom sign-in page. App must define this route. |

After successful sign-in, the user is redirected back to the original page they requested (via `dndev.auth.returnTo` in sessionStorage, handled by `AuthReturnTo`).

### Role & Tier Routes

`roleRoute` and `tierRoute` control where users land when they have insufficient permissions. Default is `/404` - the user sees a not-found page rather than being told a resource exists they can't access.

---

## Protected Routes

Define auth requirements in page `meta`:

```tsx
// Basic protection - any authenticated user
export const meta: PageMeta = {
  namespace: NAMESPACE,
  auth: { required: true },
};

// Role-based access
export const meta: PageMeta = {
  namespace: NAMESPACE,
  auth: { required: true, role: 'admin' },
};

// Tier-based access
export const meta: PageMeta = {
  namespace: NAMESPACE,
  auth: { required: true, tier: 'pro' },
};
```

**SEO note:** Auth-guarded routes are crawlable (robots.txt never blocks a page) and carry `<meta name="robots" content="noindex">` by default; they are never in the sitemap or llms.txt. `seo: { noindex: false }` in the PageMeta opts one back in. See ui `SEO.md` (Robots).

### Next + Supabase cookie session (generated proxy)

With `createBrowserClient` (session in cookies), `dndev` generates `src/proxy.next.ts`. On every page request (not `api`, `_next`, files):

- **No auth cookie** (`sb-<ref>-auth-token`, `hasSupabaseSessionCookie`): signed out, nothing verified or written; `auth` pages redirect to `authRoute` (no `authRoute`: rendered per request, the page's `AuthGuard` decides), every other page is served from the cache (see "Cached pages" below).
- **Auth cookie:** `refreshSupabaseSession` (`@donotdev/supabase/server`) verifies each authenticated page request and refreshes an expired token as needed: `getUser()` against Auth for documents (network latency), local `getClaims()` (JWKS, asymmetric signing keys) for RSC soft navigations and prefetches. Redirects use the verified result only: `auth` pages send a signed-out visitor to `authRoute` (`?returnTo=`), `signedInRedirect` pages send a signed-in one to their target. Auth rejection / refresh failure = signed out. Supabase unreachable = unknown, no redirect.
- Signed in or unknown: the page renders per request (internal rewrite to `src/app/dndev-session/…`, `src/app/[lang]/dndev-session/…` with 2+ languages; a direct request to that path is a 404).
- **`auth` pages have no cached copy:** they are generated only in the per-request tree, and every visitor who is not redirected gets them per request. They read the request on the server, query string included (`useSearchParams`), with no `<Suspense>`. Forwarded render cookies bind identity and subscription to the verified user, not the incoming cookie's user object. On outage, unverified auth cookies are removed from the render request, not the browser. Refreshed browser cookies are applied to responses; personal auth must never be globally cached.

**Cached pages.** The generated `src/app/(site)` layout renders `ClientLayout` without request data: every page is static, served from the cache and re-rendered at most hourly (`revalidate = 3600`, ISR; `appConfig.revalidate` sets another lifetime in seconds, or `false` to keep pages until the next deploy), one entry per URL (page and language). Dynamic pages: an entity page (`/produits/:slug`, entity declared in its PageMeta `entity: productEntity`, in the sitemap) is prerendered at build once per published record, the sitemap's records read with the public (anonymous) reader, so a first visit is a cache hit; a record published later, and any other dynamic page, renders on its first request, then is cached (`appConfig.prerenderRecords: false`: every URL on its first request). The build then reads the database: missing `NEXT_PUBLIC_SUPABASE_*` or a failed read fails it. Guests, crawlers and LLMs get it; so does every visitor of an app whose session the server cannot read (Firebase, localStorage session: no per-request tree, no proxy needed for it). The layout puts no Suspense boundary around the page, and the framework never adds one at layout level: it would show every static page only after the first paint (Lighthouse). A cached page that reads the query string (`useSearchParams`, `useLocation().search`) wraps that read in its own `<Suspense>`, which renders that part in the browser, and `next build` fails without one; use `useRoutePath()` when only the path is needed. `auth` pages of a cookie-session app are per request (see above) and need none. The framework generates the root layout (`src/app/layout.next.tsx`, `src/app/[lang]/layout.next.tsx` with 2+ languages) and the 404 pages; it renders the app's HTML shell `src/app/AppDocument.tsx` (cli `app-next` template) with the page's `<html lang>`. Both trees sit under it, so sign-in and sign-out stay client-side navigations. An `AppDocument` that renders `ClientLayout`, imports `next/headers` or exports `dynamic`, or an app-owned root layout / root `not-found`, fails the build.

Needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLIC_KEY` (the proxy throws without them). Without a proxy, a cookie whose access token expired reads as "unknown": the first paint waits for the provider instead of showing a user the browser may no longer have.

**Query cache follows the identity.** When the signed-in user changes (sign-in, sign-out, other user, or the provider settling on another user than the server snapshot), every cached query is reset before the new identity renders (`syncQueryCacheIdentity`, called by the auth store). The provider confirming the server's user keeps the hydrated cache. Next.js: the client router cache follows too. `NextJsStoresInitializer` calls `router.refresh()` on every such change (`onQueryCacheIdentityChange`, synchronously, before the caller's next `navigate`), so payloads and proxy redirects cached under the previous session (e.g. `/` → its `signedInRedirect` target) are never replayed after sign-out. Platform caches outside React Query subscribe the same way; auth itself stays router-agnostic.

---

## Components

### AuthGuard

Wraps route content. Checks auth state and either renders children, redirects, or shows fallback.

```tsx
import { AuthGuard } from '@donotdev/ui';

// Automatic - framework wraps routes based on page meta.auth
// Manual usage:
<AuthGuard auth={{ required: true }}>
  <ProtectedContent />
</AuthGuard>
```

**Behavior flow:**
1. Auth initializing → show spinner
2. Auth resolved, user authorized → render children
3. Auth resolved, user not authorized:
   - `authRoute` is null → render `AuthGuardFallback` in-place
   - `authRoute` is set → redirect to that route
4. Auth slow (>5s) → show slow-loading warning with refresh button

### AuthGuardFallback

Shows sign-in options directly on the protected route. No redirect needed.

```tsx
import { AuthGuardFallback } from '@donotdev/ui';

// Automatic when authRoute is null (default).
// Manual usage:
<AuthGuardFallback
  title="Custom title"
  description="Custom description"
  showBackButton={true}
  onBack={() => navigate('/')}
/>
```

### AuthReturnTo

Mounted in RootLayout. After OAuth callback, redirects user back to the page they originally requested. No configuration needed.

---

## Hooks

```tsx
import { useAuth } from '@donotdev/auth';
import { MultipleAuthProviders, AuthPartnerButton } from '@donotdev/auth';
import { AuthHeader, AuthMenu } from '@donotdev/ui';

// Hook
const user = useAuth('user');
const signIn = useAuth('signInWithEmail');
const signOut = useAuth('signOut');

// Components
<MultipleAuthProviders layout="vertical" emailMode="signin" />
<AuthPartnerButton partnerId="google" method="popup" />
```

**Pre-configured:** `AuthHeader` in layout (null if auth disabled), OAuth callbacks, session management, account linking.

### Admin: list users

`useAuthUsers()` lists every auth account for admin pages (emails, confirmation, sign-in dates), read from the auth backend itself: no user table, no copy.

```tsx
import { useAuthUsers } from '@donotdev/auth';

const { users, loading, error, reload } = useAuthUsers();
// users: AuthUserSummary[] = { id, email, emailConfirmedAt, createdAt, lastSignInAt, displayName }
```

Loads once auth is ready, through `useAuth('listUsers')` (throws `UNIMPLEMENTED` on a provider without it). Deploy the admin-only server function; non-admin callers are refused, surfaced as `error`:

| Backend | Deploy |
|---------|--------|
| Supabase | `supabase/functions/list-auth-users/index.ts`: `import { createListAuthUsers } from '@donotdev/functions/supabase'; Deno.serve(createListAuthUsers());` |
| Firebase | `functions/src/index.ts`: `import { listAuthUsers as frameworkListAuthUsers } from '@donotdev/functions/firebase'; export const listAuthUsers = frameworkListAuthUsers();` |

Firebase records no confirmation time: a verified Firebase address carries the account creation time as `emailConfirmedAt`.

---

## Email Sign-Up Confirmation

`useEmailSignUp` (the flow behind `EmailPasswordForm` and the `Auth*Field` pieces) ends a sign-up that needs confirmation in one of two ways (`confirmation` option). `useEmailSignIn` takes the same option for an address that was never confirmed:

| `confirmation` | Sign-up | Sign-in of an unconfirmed address | Provider |
|---|---|---|---|
| `'toast'` (default) | Toast "Check your email" with Resend; the link in the email confirms | Form error with "Resend verification email" | All |
| `'code'` | No toast. `onSuccess({ awaitingConfirmation: true, email })`: show the code step | A fresh code is sent (`sendEmailVerification`), then `onCodeSent(email)`: show the code step. A rate-limited resend (a code went out moments ago) still calls `onCodeSent`: that code stays valid; other resend errors are the form error | Implements `verifyEmailCode` (Supabase) |

**Sign-up, whole flow, app fields and steps included: `EmailSignUpFlow`.** Account (email, password, the app's `fields`) → 6-digit emailed code → the app's `steps` → `onDone(user)`. The flow renders each step's title, description and "Step n of N" (i18n `auth:signUpFlow.*`, `auth:codeConfirmation.intro`); the host (sheet, page) renders nothing per step. No toast: every error and "new code sent" is inline.

```tsx
import { AuthNameField, EmailSignUpFlow } from '@donotdev/auth';

<EmailSignUpFlow
  fields={<AuthNameField info={t('nameHelp')} />} // inside the form, after the password
  metadata={{ locale: i18n.language }} // user_metadata (name / consent added for you)
  steps={[{ id: 'company', title: t('company.title'), description: t('company.lead'),
    render: ({ user, next, back }) => <CompanyStep user={user} onSaved={next} /> }]}
  onStepChange={(step) => setShowLoginLink(step === 'account')} // optional
  onDone={close}
/>
```

| Prop | Why |
|---|---|
| `fields` | App fields in the account form, read at submit like the framework ones (`AuthNameField`, `AuthConsentField`, a privacy link) |
| `metadata` | App sign-up metadata (e.g. `locale` = the confirmation email's language) |
| `steps` | App steps after the code: `{ id, title, description?, render({ user, next, back? }) }`; `back` is absent on the first (the account exists by then); ids must be unique, not `account` / `code` |
| `onStepChange` | The host reacts to the step (`'account'`, `'code'`, an app step id), the first one included |
| `onDone` | Signed in and the last step done: close the host |

Fixed behaviour (no props):
- **Password:** minimum length (8) + breached-password check, no composition rules (NIST SP 800-63B-4 §3.1.1.2: composition rules SHALL NOT be imposed; blocklist check SHALL). Code length 6 (Supabase default `mailer_otp_length`), resend countdown 60 s, anti-enumeration as below.
- **"Change address"** goes back to the account form with every input as typed (the form stays mounted, hidden, until signed in).
- **Host closes / reload:** the step and the address awaiting its code (never the password) are kept in `sessionStorage` (`dndev.auth.signUp`, via `safeSessionStorage`): reopening resumes the code step (the resend countdown restarts at 60 s). A stored app step resumes only when signed in. Cleared on "Change address", sign-out, `onDone`.
- **Signed in at mount** (e.g. a sign-up left after the code): the stored app step, else the first; no app steps: `onDone` at once.
- **Transition:** the entering step fades in, sliding from the end side (forward) or the start side (back), RTL mirrored (`dndev-animate-step-*`, `--dur-normal`, `--ease-in-out`); no slide under reduced motion.
- **Focus:** each change scrolls the step to the top and focuses its title; the code step focuses the code input. Touch devices: the submit tap focuses a hidden input (inside the tap, so iOS opens the keyboard), the code input takes the focus over when the code step shows: no extra tap. A submit that stays on the account step gives the focus to the invalid field, else back where it was. (Device verification on iOS Safari: pending.)
- **Needs:** a provider with `verifyEmailCode` (Supabase) and a confirmation template with the code (`{{ .Token }}`). Other password rules: compose the pieces below. CAPTCHA: built in, see [CAPTCHA (Turnstile)](#captcha-turnstile).

**Whole flow, no app code:** `<EmailPasswordForm confirmation="code" onSuccess={close} />` (sign-up or unconfirmed sign-in → code step → signed in → `onSuccess`; "Change address" goes back to the form).

**Composed (sheet, own fields):**

```tsx
import { AuthCodeStep, AuthEmailField, AuthForm, AuthFormAlerts, AuthNameField,
  AuthPasswordField, AuthSubmitButton, useEmailSignUp } from '@donotdev/auth';

const [email, setEmail] = useState<string | null>(null);
const flow = useEmailSignUp({
  confirmation: 'code',
  passwordComposition: false, // optional: length only (default true)
  onSuccess: (outcome) => (outcome.awaitingConfirmation ? setEmail(outcome.email) : next()),
});

if (email) return <AuthCodeStep email={email} onSuccess={next} onChangeEmail={() => setEmail(null)} />;
return (
  <AuthForm flow={flow}>
    <AuthNameField info={t('nameHelp')} />
    <AuthEmailField />
    <AuthPasswordField />
    <AuthFormAlerts />
    <AuthSubmitButton />
  </AuthForm>
);
```

- **`AuthNameField`** (`name="displayName"`, `label`, `info`, `placeholder`, `defaultValue`): the name the user wants in emails. Never required, never validated. Filled: sign-up stores it trimmed as metadata `full_name` (the provider's `displayName`); empty: nothing.
- **`AuthCodeStep`** (`email`, `length?`, `onSuccess?`, `onChangeEmail?`): "Enter the code sent to {email}", `AuthCodeField`, Resend with countdown, "A new code has been sent." inline after a resend (the code input has focus again), and "Change address" when `onChangeEmail` is given. No toast. Lower level: `useEmailCodeConfirmation(...)` + `<AuthCodeField confirmation={...} />` (`confirmation.resent`, `confirmation.error`).
- **Anti-enumeration:** a new address, an unconfirmed one and an already confirmed one end on the same screen (`awaitingConfirmation: true`). Supabase sends no email to an already confirmed address, so in code mode the flow sends that address a password-reset email instead (`sendPasswordResetEmail`, fire-and-forget; word the recovery template to also cover "you already have an account"). Its failure is logged, never shown.
- **Code step:** `length` (default 6) must match the provider (Supabase `mailer_otp_length`); the confirmation email template must contain the code (`{{ .Token }}`). `resendCooldownSeconds` (default 60) counts down from mount; Resend uses `sendEmailVerification(email)`; its outcome is inline (`resent` / `error`), never a toast. Wrong / expired codes and rate limits get translated messages (`errors.invalid_code`, `errors.code_expired`, `errors.rate_limit`). Success signs the user in.
- **`passwordComposition: false`:** only the minimum length applies (no uppercase / lowercase / digit / special rules, no requirements checklist); the breached-password check stays.
- **Password reset without toast:** `usePasswordResetRequest({ toast: false })` shows no toast; render the "check your inbox" message from `flow.sent` (true after a request, until the next submit). Default `toast: true` is unchanged.
- **Same validation in app forms:** `validateEmail(t, email)`, `isEmail`, `newPasswordError(password, minLength, t, composition)`, `DEFAULT_PASSWORD_MIN_LENGTH` and the `AuthT` type are exported: an app form validates exactly like the flows.

---

## CAPTCHA (Turnstile)

Supabase Auth only (Cloudflare Turnstile). Framework-owned: no prop, no app code. The switch is the public env var `TURNSTILE_SITE_KEY`; without it there is no script, no widget and no token.

**What the framework does** (source: `@donotdev/core` `captcha.ts`, `@donotdev/auth` `emailAuth/captcha.tsx`, `@donotdev/supabase` `client/auth.ts`):
- **Widget:** `AuthSubmitButton` renders it just above the button, so every `AuthForm` has it (`EmailPasswordForm`, `EmailSignUpFlow`, app compositions); `AuthCodeField` above Resend; `EmailLinkForm` above its submit. Theme `auto`, the app language, full width, `interaction-only`: hidden unless Cloudflare asks the visitor to interact (Managed widget: a checkbox for suspicious visitors; Invisible widget: never shown). It renders when the form mounts, so a token is usually ready at submit; Cloudflare refreshes an expired one.
- **Tokens:** each gated call takes one fresh single-use token from the most recently mounted widget, which then resets for the next call (sign-up then the existing-account reset email = two tokens). No token yet: the call waits (submit button busy) up to 60 s. A gated call with no widget mounted (toast Resend, direct `useAuth` call) gets a one-off widget at the bottom of the page.
- **Gated calls** (send `captchaToken`): sign-up, password sign-in and re-authentication, magic link / OTP, resend of the confirmation code or email, password-reset request. Not gated: code confirmation (`verifyOtp`), OAuth, password update, token refresh.
- **Errors:** inline form error `errors.captcha_failed` (script blocked, widget error, timeout, or the server refused the token: GoTrue code `captcha_failed`); the password-reset request shows it too (other reset errors stay hidden, anti-enumeration).
- **CSP:** the header policy allows `https://challenges.cloudflare.com` in `script-src` and `frame-src` for every `@donotdev/supabase` app.
- **Firebase:** unaffected (App Check with reCAPTCHA, `RECAPTCHA_SITE_KEY`). **Expo:** no Turnstile; do not enable CAPTCHA on a Supabase project an Expo app signs in to.

**Enable (in this order):**
1. Cloudflare dashboard > Turnstile > Add widget: mode **Managed** (or Invisible), hostnames = every domain that serves the auth forms (production, `localhost` for dev, preview domains: a hostname not listed fails every gated call). Note the site key and the secret key.
2. Set the site key in every app on the project (Supabase CAPTCHA is project-wide: the shop and the admin alike): `VITE_TURNSTILE_SITE_KEY` (Vite) / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Next), in `.env` and in the host's env; deploy. The widget runs, tokens are sent; the server ignores them until step 3.
3. Last: turn it on in Supabase. Dashboard: Authentication > Bot and Abuse Protection > Enable CAPTCHA protection, provider Turnstile, the secret key. Or the Management API: `PATCH https://api.supabase.com/v1/projects/<ref>/config/auth` with `{ "security_captcha_enabled": true, "security_captcha_provider": "turnstile", "security_captcha_secret": "<secret>" }`. Enabling it before step 2 is live breaks every sign-up, sign-in and reset. Scripts that call Supabase Auth directly with the public key (e2e fixtures, workers) need a token too, or the service-role key.

**Test keys** (Cloudflare, any hostname): site `1x00000000000000000000AA` visible, always passes; `3x00000000000000000000FF` visible, forces the interactive challenge; `2x00000000000000000000AB` visible, always fails; `1x00000000000000000000BB` invisible, passes. Secret `1x0000000000000000000000000000000AA` always passes.

---

## User Roles

**Role hierarchy:** `guest (0) < user (1) < admin (2) < super (3)`

**Default:** All authenticated users are `'user'` role.

**Setting admin/super roles:**

**Firebase** - Set customClaims:
```typescript
import { getFirebaseAdminAuth } from '@donotdev/firebase/server';

const auth = getFirebaseAdminAuth();
await auth.setCustomUserClaims(userId, {
  role: 'admin',  // or 'super'
  isAdmin: true   // legacy support
});
```

**Supabase** - Set trusted app metadata (never editable `user_metadata`):
```sql
-- In Supabase Dashboard > SQL Editor
UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}' WHERE id = '<user-id>';
```

**Using CLI:**
```bash
dndev make-admin <userId>
```

**Session sync:** After a server-side role or subscription change, explicitly refresh the affected browser's configured auth provider (see below), or sign out and in. A setter cannot remotely force another user's browser to refresh.

**Used by:** CRUD access control, protected routes, field visibility filtering.

## Access Subscriptions (Auth-Owned)

Auth owns `SubscriptionClaimsSchema`, `SubscriptionClaims`, `UserSubscription`, statuses and defaults in core. Billing is a separate producer of access updates, not a prerequisite for access. Persist only the canonical nested `customClaims.subscription` (Supabase: `app_metadata.subscription`); do not mirror a flat `tier`.

Required fields: `tier: string`, `status: string`, `subscriptionEnd: ISO timestamp | null`, `updatedAt: ISO timestamp`. Optional: `features: string[]`, `isDefault: boolean`. `subscriptionId` / `customerId` (optional, nullable) and `cancelAtPeriodEnd` (optional boolean) are deprecated billing compatibility projections, not requirements for a generic grant. `createDefaultSubscriptionClaims(userId)` retains its deprecated argument for compatibility but leaves payment identifiers null; an auth UID is not a billing customer ID.

### Server grant / revoke (Supabase)

Server-only example; the caller must authenticate and authorize the acting server request for the target `uid` **before** calling this helper. Possessing a server secret is not caller authorization. Never expose the secret or this operation as an unguarded client endpoint.

```typescript
import * as v from 'valibot';
import { SubscriptionClaimsSchema } from '@donotdev/core/server';
import {
  createServerClient,
  SupabaseServerAuthAdapter,
} from '@donotdev/supabase/server';

async function writeAccess(
  url: string,
  serverSecret: string,
  uid: string,
  tier: 'pro' | 'free',
): Promise<void> {
  const auth = new SupabaseServerAuthAdapter(createServerClient(url, serverSecret));
  await auth.setCustomClaims(uid, {
    subscription: v.parse(SubscriptionClaimsSchema, {
      tier,
      status: 'active',
      subscriptionEnd: null,
      updatedAt: new Date().toISOString(),
    }),
  });
}
```

Grant with `pro`; revoke with a complete `free` object using the same path, without fabricated billing IDs. Supabase merges top-level app metadata, preserving unrelated keys but replacing the supplied subscription object. Omitting `subscription` does not remove it; `{ subscription: null }` explicitly clears its value and resolves to baseline free. Prefer the complete free object for an explicit persisted revocation. Self-service claims setters do not permit subscription writes.

### Browser session sync

After the server write succeeds, in the **affected user's browser**:

```typescript
import { getProvider } from '@donotdev/core';

const token = await getProvider('auth').refreshToken();
if (token === null) throw new Error('Auth refresh failed');
```

`refreshToken()` throws on provider error (e.g. Supabase `refresh_token_not_found`, wrapped with the original reason) and returns `null` only when the auth state changed during the refresh (sign-out, account switch) or no session exists. `refreshToken()` is an existing provider method, not a `useAuth` selector. On success it applies canonical user/subscription state before resolving; `useAuth('userSubscription')`, `useAuth('userTier')`, guards and capabilities then observe it. Other users' browsers require their own refresh; the server setter does not push session updates.

### Access semantics and trust

- `resolveUserSubscription(userId, claims)` takes the nested subscription object, not the claims envelope. Absent/null means deterministic free baseline; malformed present claims fail rather than retain earlier access. No flat-tier migration fallback.
- Tier guards and provider `hasTier()` compare the raw declared tier hierarchically (`free < pro < ai` by default), **without checking status or expiry**. Unknown/unconfigured tiers deny access. `isActive` means only `status === 'active'`; `subscriptionEnd` is not automatically enforced. Changing status alone does not revoke tier access: lower/remove the tier.
- Existing status strings, including legacy/custom statuses, remain accepted. This introduces no trial, grace or expiry policy.
- Supabase authorization claims/roles come only from `app_metadata`; `user_metadata` is editable profile data (name/avatar), never authorization. A signed-in user with no explicit application role has baseline role `user`.
- SSR `AuthSessionSnapshot.userSubscription` is display-only request context (optional for older providers). During initialization, `useAuth` reads request-local identity, subscription and capabilities; never write a request identity into the singleton auth store. Protected server actions must reauthorize using fresh trusted auth.
- Proxy `getUser()` supplies current trusted metadata for document renders; RSC soft navigations and prefetches (GET/HEAD) get a user built from the access token's claims only (`getClaims()`: metadata as of the token's issue, no `email_confirmed_at`, a revoked session valid until the token expires). Staleness bound: a profile change shows up on soft navigations within one access-token lifetime (default 3600 s), or on the next document load. Neither promises JWT/session revocation everywhere. Direct RLS using `auth.jwt()` may still see old claims until token refresh/expiry. Immediate revocation requires authoritative server/database policy at the protected operation, not a guard or client refresh alone.
- Claim updates are not a transactional grant/revoke API. Firebase merges a read snapshot before replacing claims; Supabase accepts key patches but provides no compare-and-set contract. Coordinate concurrent authorization writers per user when ordering matters. A browser refresh cannot repair a server-side lost update.

### Redirect URLs (Supabase only)

After OAuth (Google, GitHub, etc.), Supabase redirects the user back to your app. You must tell Supabase which URLs are allowed.

**Supabase Dashboard > Authentication > URL Configuration:**

| Setting | Value |
|---------|-------|
| **Site URL** | Your **production** URL (e.g., `https://myapp.vercel.app`) |
| **Redirect URLs** | All URLs where auth should work (see below) |

**Add to Redirect URLs:**
- `http://localhost:5173` - local Vite dev
- `http://localhost:3000` - local Next.js dev
- `https://myapp.vercel.app` - production
- `https://*-yourteam.vercel.app` - Vercel preview deploys

> **Site URL must be production.** It's the fallback when no redirect URL matches. If it's `localhost:3000`, your deployed app redirects to localhost after OAuth.

---

## Security Context

Wire `DndevSecurity` into the auth provider for rate limiting, audit logging, and signup consent tracking.

```typescript
// src/bootstrap.ts (or wherever auth is initialized)
import { DndevSecurity } from '@donotdev/security/server';

const security = new DndevSecurity({ /* config */ });
auth.setSecurity(security);
```

**What it enables:**

| Feature | Without setSecurity | With setSecurity |
|---------|-------------------|-----------------|
| Password reset rate limiting | No protection | Per-email throttle (prevents flooding) |
| Brute-force lockout | Default (5 attempts / 15 min) | Configurable via security config |
| GDPR signup consent audit | Silently skipped | `auth.signup.consent` event emitted |
| Login/logout audit trail | No events | Full audit events |

### Signup Consent (GDPR)

When `EmailPasswordForm` renders a ToS/Privacy checkbox, the framework automatically passes a `SignUpMetadata` object to the auth provider on signup:

```typescript
// Automatically sent by EmailPasswordForm when tosAccepted is true
{
  gdpr_consent_at: '2026-04-01T12:00:00.000Z', // ISO-8601 timestamp
  gdpr_tos_version: '1.0',                       // optional, if configured
}
```

**Supabase:** Stored durably in `raw_user_meta_data` on the auth.users row AND emitted as audit event.

**Firebase:** Emitted as `auth.signup.consent` audit event (no client-side user metadata storage). For durable consent records, wire a server-side listener or callable function to persist to Firestore.

### ToS/Privacy Links

Configure in `appConfig.footer.legalLinks`:

```typescript
export const appConfig: AppConfig = {
  footer: {
    legalLinks: {
      terms: '/legal/terms',      // or false to disable
      privacy: '/legal/privacy',  // or false to disable
    },
  },
};
```

`EmailPasswordForm` auto-detects these. Falls back to `/legal/terms` and `/legal/privacy` if not set.

---

**Add env vars, get auth. Framework handles the rest.**

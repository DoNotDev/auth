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

**SEO note:** Auth-guarded routes are still indexed by default. Add `noindex: true` to page meta if the route should be hidden from search engines.

### Next + Supabase cookie session (generated proxy)

With `createBrowserClient` (session in cookies), `dndev` generates `src/proxy.next.ts`. On every page request (not `api`, `_next`, files):

- **No auth cookie** (`sb-<ref>-auth-token`, `hasSupabaseSessionCookie`): signed out, nothing verified or written; `auth` pages redirect to `authRoute` (no `authRoute`: rendered per request, the page's `AuthGuard` decides), every other page is served from the cache (see "Cached pages" below).
- **Auth cookie:** `refreshSupabaseSession` (`@donotdev/supabase/server`) calls `getUser()` against Auth on each authenticated page request, adding network latency; it refreshes an expired token as needed. Redirects use the verified result only: `auth` pages send a signed-out visitor to `authRoute` (`?returnTo=`), `signedInRedirect` pages send a signed-in one to their target. Auth rejection / refresh failure = signed out. Supabase unreachable = unknown, no redirect.
- Signed in or unknown: the page renders per request (internal rewrite to `src/app/dndev-session/…`, `src/app/[lang]/dndev-session/…` with 2+ languages; a direct request to that path is a 404).
- **`auth` pages have no cached copy:** they are generated only in the per-request tree, and every visitor who is not redirected gets them per request. They read the request on the server, query string included (`useSearchParams`), with no `<Suspense>`. Forwarded render cookies bind identity and subscription to the verified user, not the incoming cookie's user object. On outage, unverified auth cookies are removed from the render request, not the browser. Refreshed browser cookies are applied to responses; personal auth must never be globally cached.

**Cached pages.** The generated `src/app/(site)` layout renders `ClientLayout` without request data: every page is static, served from the cache and re-rendered at most hourly (`revalidate = 3600`, ISR; `appConfig.revalidate` sets another lifetime in seconds, or `false` to keep pages until the next deploy), one entry per URL (page and language). Guests, crawlers and LLMs get it; so does every visitor of an app whose session the server cannot read (Firebase, localStorage session: no per-request tree, no proxy needed for it). The layout puts no Suspense boundary around the page, and the framework never adds one at layout level: it would show every static page only after the first paint (Lighthouse). A cached page that reads the query string (`useSearchParams`, `useLocation().search`) wraps that read in its own `<Suspense>`, which renders that part in the browser, and `next build` fails without one; use `useRoutePath()` when only the path is needed. `auth` pages of a cookie-session app are per request (see above) and need none. The framework generates the root layout (`src/app/layout.next.tsx`, `src/app/[lang]/layout.next.tsx` with 2+ languages) and the 404 pages; it renders the app's HTML shell `src/app/AppDocument.tsx` (cli `app-next` template) with the page's `<html lang>`. Both trees sit under it, so sign-in and sign-out stay client-side navigations. An `AppDocument` that renders `ClientLayout`, imports `next/headers` or exports `dynamic`, or an app-owned root layout / root `not-found`, fails the build.

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

`refreshToken()` is an existing provider method, not a `useAuth` selector. On success it applies canonical user/subscription state before resolving; `useAuth('userSubscription')`, `useAuth('userTier')`, guards and capabilities then observe it. Other users' browsers require their own refresh; the server setter does not push session updates.

### Access semantics and trust

- `resolveUserSubscription(userId, claims)` takes the nested subscription object, not the claims envelope. Absent/null means deterministic free baseline; malformed present claims fail rather than retain earlier access. No flat-tier migration fallback.
- Tier guards and provider `hasTier()` compare the raw declared tier hierarchically (`free < pro < ai` by default), **without checking status or expiry**. Unknown/unconfigured tiers deny access. `isActive` means only `status === 'active'`; `subscriptionEnd` is not automatically enforced. Changing status alone does not revoke tier access: lower/remove the tier.
- Existing status strings, including legacy/custom statuses, remain accepted. This introduces no trial, grace or expiry policy.
- Supabase authorization claims/roles come only from `app_metadata`; `user_metadata` is editable profile data (name/avatar), never authorization. A signed-in user with no explicit application role has baseline role `user`.
- SSR `AuthSessionSnapshot.userSubscription` is display-only request context (optional for older providers). During initialization, `useAuth` reads request-local identity, subscription and capabilities; never write a request identity into the singleton auth store. Protected server actions must reauthorize using fresh trusted auth.
- Proxy `getUser()` supplies current trusted metadata for page rendering; it does **not** promise JWT/session revocation everywhere. Direct RLS using `auth.jwt()` may still see old claims until token refresh/expiry. Immediate revocation requires authoritative server/database policy at the protected operation, not a guard or client refresh alone.
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

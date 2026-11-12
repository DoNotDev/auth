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

- **No auth cookie** (`sb-<ref>-auth-token`, `hasSupabaseSessionCookie`): signed out, nothing verified or written; `auth` pages redirect to `authRoute`, every other page is served from the cache (see "Cached pages" below).
- **Auth cookie:** verifies the Supabase session and refreshes an expired one (`refreshSupabaseSession`, `@donotdev/supabase/server`, the @supabase/ssr `getClaims()` pattern), then redirects on the verified result only: `auth` pages send a signed-out visitor to `authRoute` (`?returnTo=`), `signedInRedirect` pages send a signed-in one to their target. Refresh failed / session revoked = signed out; Supabase unreachable = no redirect (the page's guards decide).
- Signed in or unknown: the page renders per request with the refreshed cookies (internal rewrite to `src/app/dndev-session/…`, `src/app/[lang]/dndev-session/…` with 2+ languages; a direct request to that path is a 404). The refreshed cookies are written on every response.

**Cached pages.** The generated `src/app/(site)` layout renders `ClientLayout` without request data: every page is static, served from the cache and re-rendered at most hourly (`revalidate = 3600`, ISR), one entry per URL (page and language). Guests, crawlers and LLMs get it; so does every visitor of an app whose session the server cannot read (Firebase, localStorage session: no per-request tree, no proxy needed for it). A page that reads the query string (`useSearchParams`, `useLocation().search`) renders that page in the browser; use `useRoutePath()` when only the path is needed. The framework generates the root layout (`src/app/layout.next.tsx`, `src/app/[lang]/layout.next.tsx` with 2+ languages) and the 404 pages; it renders the app's HTML shell `src/app/AppDocument.tsx` (cli `app-next` template) with the page's `<html lang>`. Both trees sit under it, so sign-in and sign-out stay client-side navigations. An `AppDocument` that renders `ClientLayout`, imports `next/headers` or exports `dynamic`, or an app-owned root layout / root `not-found`, fails the build.

Needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLIC_KEY` (the proxy throws without them). Without a proxy, a cookie whose access token expired reads as "unknown": the first paint waits for the provider instead of showing a user the browser may no longer have.

**Query cache follows the identity.** When the signed-in user changes (sign-in, sign-out, other user, or the provider settling on another user than the server snapshot), every cached query is reset before the new identity renders (`syncQueryCacheIdentity`, called by the auth store). The provider confirming the server's user keeps the hydrated cache.

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

**Supabase** - Set user metadata:
```sql
-- In Supabase Dashboard > SQL Editor
UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}' WHERE id = '<user-id>';
```

**Using CLI:**
```bash
dndev make-admin <userId>
```

**Note:** User must sign out and sign in again for role changes to take effect.

**Used by:** CRUD access control, protected routes, field visibility filtering.

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

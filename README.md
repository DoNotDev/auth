# DoNotDev Auth

Complete authentication solution with property-based API for optimal performance.

## Quick Start

```typescript
import { useAuth } from '@donotdev/auth';

function LoginForm() {
  // State (reactive) - re-renders when values change
  const loading = useAuth('loading');
  const error = useAuth('error');

  // Method (stable) - never re-renders
  const signIn = useAuth('signInWithEmail');

  const handleSubmit = async (email: string, password: string) => {
    try {
      await signIn(email, password);
    } catch (err) {
      // Error already in store and shown via toast
    }
  };

  if (loading) return <Spinner />;
  if (error) return <Alert>{error.message}</Alert>;

  return <form onSubmit={handleSubmit}>...</form>;
}
```

## The Golden Rule

```typescript
// Want state that re-renders? Use useAuth('propertyName')
const user = useAuth('user');

// Want a method that never re-renders? Use useAuth('methodName')
const signIn = useAuth('signInWithEmail');
```

TypeScript autocomplete shows you everything available.

## Available Properties

### State (Reactive - Re-renders on Change)

- **`user`** - Current authenticated user
- **`loading`** - Loading state
- **`error`** - Error state
- **`userProfile`** - User profile (role, displayName)
- **`userSubscription`** - Subscription (tier, features)
- **`emailVerification`** - Email verification status
- **`initialized`** - Whether auth system is ready

### Methods (Stable - Never Re-renders)

**Authentication:**

- **`signInWithEmail(email, password)`** - Sign in
- **`createUserWithEmail(email, password)`** - Create account
- **`signInWithPartner(partnerId, method?)`** - OAuth sign in
- **`signOut()`** - Sign out
- **`sendPasswordResetEmail(email)`** - Reset password
- **`sendEmailVerification()`** - Verify email

**Security (Firebase-verified):**

- **`hasRole(role)`** - Check role (async, verified)
- **`hasTier(tier)`** - Check tier (async, verified)
- **`hasFeature(feature)`** - Check feature (async, verified)

### Computed (Reactive - Re-renders When Dependencies Change)

- **`isAuthenticated`** - Whether user is signed in
- **`userRole`** - User's role (cached)
- **`userTier`** - User's tier (cached)

## Common Patterns

### Protected Route

```typescript
function ProfilePage() {
  const user = useAuth('user');

  if (!user) return <Navigate to="/login" />;

  return <div>Welcome, {user.email}!</div>;
}
```

### Role-Based Access

```typescript
function AdminPanel() {
  const userRole = useAuth('userRole');  // Cached
  const hasRole = useAuth('hasRole');    // Verified

  // For display
  if (userRole !== 'admin') {
    return <AccessDenied />;
  }

  // For security operations
  const handleDelete = async () => {
    const isAdmin = await hasRole('admin');
    if (!isAdmin) throw new Error('Unauthorized');
    // ... proceed
  };

  return <AdminDashboard />;
}
```

### Avoiding Infinite Loops

```typescript
// ✅ Good - prevents loops
function Component() {
  const user = useAuth('user');
  const signIn = useAuth('signInWithEmail');
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!user && !attempted) {
      setAttempted(true); // Guard
      signIn('auto@example.com', 'password');
    }
  }, [user, attempted, signIn]);
}
```

## Performance Tips

1. **Only subscribe to what you need** - Each `useAuth('property')` creates a separate subscription
2. **Methods are free** - Methods never cause re-renders
3. **Computed values are optimized** - Only re-render when dependencies change

## Error Handling

All async methods throw DoNotDevError with user-friendly messages:

```typescript
const signIn = useAuth('signInWithEmail');

try {
  await signIn(email, password);
} catch (error) {
  // Error is DoNotDevError
  // Also automatically set in error state
  console.error(error.message);
}
```

---

# Architecture

## 4-Layer Architecture

```
useAuth (Entry Point - React binding)
    ↓
FirebaseAuth (Complete orchestrator: Firebase + errors + store + partner state)
    ↓
SDK (Firebase wrapper)
    ↓
Firebase Auth SDK
```

**Philosophy:** Simple, honest, and complete. Each layer has one clear responsibility.

---

## What Production Apps Actually Do

### Firebase's Automatic Persistence (Google's Apps)

**Firebase SDK handles everything automatically:**

- Stores auth state in **IndexedDB** (primary)
- Falls back to **localStorage** if IndexedDB unavailable
- Auto-refreshes tokens in background
- Restores user on page reload

```typescript
// YOU DO NOTHING - Firebase handles it
firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    // User restored from IndexedDB automatically
    // Tokens refreshed automatically
  }
});
```

**Google's own apps (Gmail, Drive, YouTube) do this:**

1. Firebase SDK persists user in IndexedDB ✅
2. sessionStorage for OAuth state/PKCE verifiers ✅
3. React state/Zustand for UI only ✅

### Auth0

**Storage Strategy:**

- Auth tokens: **IndexedDB** via Auth0 SDK
- OAuth state: **sessionStorage** (PKCE verifiers)
- UI state: **Zustand/Redux** (in-memory only)

```typescript
// Auth0 SDK handles persistence
const { user, isLoading } = useAuth0();

// sessionStorage for OAuth flow
sessionStorage.setItem('auth0.state', state);
```

### Supabase

**Storage Strategy:**

- Auth tokens: **localStorage** via Supabase SDK
- OAuth state: **sessionStorage** (PKCE verifiers)
- UI state: **Zustand/Redux** (in-memory only)

```typescript
// Supabase SDK handles persistence
const {
  data: { user },
} = await supabase.auth.getUser();

// sessionStorage for OAuth PKCE
sessionStorage.setItem('supabase.auth.pkce_verifier', verifier);
```

### Clerk

**Storage Strategy:**

- Session tokens: **IndexedDB** via Clerk SDK
- OAuth state: **sessionStorage**
- UI state: **React state/Zustand** (in-memory only)

```typescript
// Clerk SDK handles persistence
const { user, isLoaded } = useUser();

// sessionStorage for redirect context
sessionStorage.setItem('clerk_redirect', returnUrl);
```

### NextAuth.js

**Storage Strategy:**

- Session: **HTTP-only cookies** (server-side)
- CSRF token: **localStorage**
- OAuth state: **sessionStorage**
- UI state: **Zustand/Redux** (in-memory only)

```typescript
// NextAuth handles persistence via cookies
const { data: session } = useSession();

// sessionStorage for OAuth state
sessionStorage.setItem('nextauth.state', state);
```

### Common Pattern Across All Production Apps

**Every major auth provider uses the same 3-tier approach:**

1. **SDK Persistence (Automatic)**
   - User auth state
   - Tokens
   - IndexedDB or localStorage
   - YOU DO NOTHING

2. **sessionStorage (Manual)**
   - OAuth redirect state
   - Account linking context
   - PKCE verifiers
   - Return URLs

3. **State Management (Manual)**
   - Loading states
   - Error messages
   - UI-specific state
   - In-memory only (Zustand/Redux/React)

**Why Zustand Without Persist?**

- Firebase already persists user (IndexedDB)
- Duplicating storage = conflicts + bugs
- Zustand persist = localStorage (same as Firebase fallback)
- UI state doesn't need persistence (transient)

**Why Not Zustand for OAuth Redirects?**

- Zustand without persist = in-memory only
- Page reload destroys all Zustand state
- sessionStorage survives page reloads
- This is why every auth provider uses sessionStorage

---

## Layer Responsibilities

### Layer 1: SDK (`@donotdev/firebase/sdk.ts`)

**Singleton** wrapper around Firebase Auth SDK with TypeScript types.

- Pure Firebase method wrappers
- Initialized by FirebaseAuth
- **No business logic**

```typescript
const sdk = getFirebaseSDK();
await sdk.initialize();
const user = await sdk.signInWithEmailAndPassword(email, password);
```

### Layer 2: FirebaseAuth (`FirebaseAuth.ts`)

**Singleton** complete business logic orchestrator.

- All Firebase operations (via SDK)
- Smart recovery (network retry, rate limiting, account linking)
- Error wrapping with `handleError()`
- Store updates via domain methods
- Partner state management
- Security checks (roles, tiers, features)
- Toast notifications

```typescript
const auth = getFirebaseAuth();
auth.setStore(authStore);
await auth.initialize();

// Smart recovery + error handling + store updates all handled internally
const result = await auth.signInWithEmail(email, password);
```

**Smart Recovery:**

- User not found → Auto-signup
- Network issues → Retry with backoff
- Rate limiting → Exponential backoff
- Account exists → Intelligent linking
- User cancelled → Return null

### Layer 3: authStore (`AuthStore.ts`)

**Zustand store** (in-memory only, no persist).

- Pure state storage - **no business logic**
- Domain methods for updates
- **No persistence** - Firebase handles user persistence automatically
- UI state only (loading, errors, partner states)

```typescript
// Domain methods pattern
setAuthenticated: (user, subscription, profile) => set({...}),
setUnauthenticated: () => set({...}),
setPartnerState: (partnerId, state, error?) => set({...}),
clearAllPartnerStates: () => set({...}),
setAuthLoading: (loading) => set({...}),
setAuthError: (error) => set({...}),
clearAuthError: () => set({...}),
setEmailVerificationStatus: (status, error?) => set({...}),
```

### Layer 4: useAuth (`useAuth.ts`)

**React hook** - single entry point.

- Lazy loads FirebaseAuth + authStore
- Connects FirebaseAuth to store
- Returns store state + FirebaseAuth methods

```typescript
const { user, loading, signInWithEmail, hasRole } = useAuth();
// user, loading = from store (fast, sync)
// signInWithEmail = calls FirebaseAuth (async)
// hasRole = security check (async, Firebase-verified)
```

---

## Initialization Chain

```typescript
// 1. Component calls useAuth()
useAuth()

// 2. Lazy loads and connects (first call only)
→ import FirebaseAuth
→ import authStore
→ firebaseAuth.setStore(store)
→ store.setAuthService(firebaseAuth)

// 3. FirebaseAuth initializes
→ firebaseAuth.initialize()
  → SDK.initialize()
    → Firebase SDK ready
```

---

## Error Handling Pattern

**Single Point of Wrapping:** Errors are wrapped once in SmartRecovery, then propagated up.

```typescript
// FirebaseSmartRecovery.ts - wraps errors
try {
  return await retryWithBackoff(operation, deps);
} catch (retryError) {
  throw handleError(retryError, {
    userMessage: 'Network connection failed. Please check your internet.',
    showNotification: true,
  });
}

// FirebaseAuth.ts - updates partner state and re-throws
try {
  return await handleSmartRecovery(error, operation, context, deps);
} catch (wrappedError) {
  // Error already wrapped by SmartRecovery
  this.storeState.setPartnerState('password', PARTNER_STATE.ERROR);
  throw wrappedError; // No double wrapping
}

// Component - catches wrapped error
try {
  await signInWithEmail(email, password);
} catch (error) {
  // DoNotDevError with user message already shown via toast
  console.error(error);
}
```

**Key Points:**

- `handleSmartRecovery` wraps all unrecoverable errors before throwing
- `FirebaseAuth` focuses on orchestration (partner state management)
- No double wrapping - `handleError()` called once
- User-friendly messages mapped from Firebase error codes

---

## Account Linking (Firebase 12.3)

**FirebaseAuth's internal concern** - other layers unaware.

### Linking Scenarios

All handled automatically by FirebaseAuth + SmartRecovery:

1. **OAuth → Password:** Shows password form, links after sign-in
2. **OAuth → EmailLink:** Shows email link form, links after sign-in
3. **OAuth → OAuth:** Triggers existing provider, Firebase auto-links
4. **Password → OAuth:** Triggers OAuth flow, links after sign-in
5. **EmailLink → OAuth:** Triggers OAuth flow, links after sign-in

### Storage Pattern

**SessionStorage = Only for Cross-Page-Load Data**

Used only when:

- OAuth redirect (user leaves app, comes back)
- Account linking context (survives page reload)

```typescript
// FirebaseAuth only
if (typeof window !== 'undefined') {
  sessionStorage.setItem('accountLinkingInfo', JSON.stringify(info));
}
```

**Zustand Persistence + Firebase = Handle Everything Else**

---

## Domain Methods Pattern

**Services never call `setState` - only domain methods:**

```typescript
// ❌ WRONG
this.store.setState({ user, authenticated: true });

// ✅ CORRECT
this.store.getState().setAuthenticated(user, subscription, profile);
this.store.getState().clearAllPartnerStates();
this.store.getState().setPartnerState(partnerId, PARTNER_STATE.LOADING);
```

---

## Constants Over Magic Strings

```typescript
// authStore.ts
export const PARTNER_STATE = {
  IDLE: 'idle',
  LOADING: 'loading',
  ERROR: 'error',
  AUTHENTICATED: 'authenticated',
} as const;

export type PartnerState = (typeof PARTNER_STATE)[keyof typeof PARTNER_STATE];

// Usage
setPartnerState(partnerId, PARTNER_STATE.LOADING);
```

---

## Partner State Management

**Tracked per partner** for granular UI feedback:

```typescript
// FirebaseAuth manages partner state
this.storeState.setPartnerState('google', PARTNER_STATE.LOADING);

try {
  const result = await this.sdk.signInWithPopup(provider);
  // Success - cleared by onAuthStateChanged
} catch (error) {
  this.storeState.setPartnerState('google', PARTNER_STATE.ERROR);
  throw error;
}

// Component uses partner state
const googleState = getPartnerState('google');
if (googleState === PARTNER_STATE.LOADING) {
  return <Spinner />;
}
```

**Partner State Flow:**

- Start: `LOADING`
- Success: cleared by `onAuthStateChanged` → `clearAllPartnerStates()`
- User cancelled: `IDLE`
- Error: `ERROR`

---

## Security vs Display Data

**Display Data (Sync - from Store):**

```typescript
const { user, userProfile, userSubscription, loading } = useAuth();
// Fast, cached, for UI rendering only
```

**Security Operations (Async - from FirebaseAuth → Firebase):**

```typescript
const { hasRole, hasTier, hasFeature } = useAuth();
const isAdmin = await hasRole('admin'); // Real-time Firebase verification
```

**Rule:** Display = store. Security = FirebaseAuth.

**Security Methods:**

- Force refresh Firebase ID token
- Get latest custom claims from server
- Update store with verified data
- Return boolean result

---

## Type Safety with AUTH_PARTNERS Schema

Email/password stays in AUTH_PARTNERS for user configuration simplicity:

```typescript
export const AUTH_PARTNERS = {
  google: { id: 'google', firebaseProviderId: 'google.com', ... },
  github: { id: 'github', firebaseProviderId: 'github.com', ... },
  password: { id: 'password', name: 'Email & Password', enabled: true, ... },
  emailLink: { id: 'emailLink', name: 'Email Link', enabled: true, ... },
} as const;

export type AuthPartnerId = keyof typeof AUTH_PARTNERS;
```

**Special handling in code** - type-safe, no `as any`:

```typescript
// Components check for email authentication methods
if (partnerId === 'password') {
  return <EmailPasswordForm />;
}
if (partnerId === 'emailLink') {
  return <EmailLinkForm />;
}

// OAuth partners
const config = AUTH_PARTNERS[partnerId]; // Type-safe
const provider = this.sdk.createOAuthProvider(config.firebaseProviderId);
```

---

## Logging Pattern

```typescript
// @donotdev/utils/logger.ts
export const logger = {
  debug: (...args: any[]) => import.meta.env.DEV && console.log(...args),
  info: console.log,
  warn: console.warn,
  error: console.error,
};

// Usage
logger.debug('[FirebaseAuth] Processing redirect'); // DEV only
logger.error('[FirebaseAuth] Sign in failed', error);
```

---

## File Naming Convention

```
FirebaseAuth.ts  // Singleton classes = PascalCase
AuthStore.ts     // Zustand store = PascalCase
useAuth.ts       // React hooks = camelCase
```

---

## Smart Recovery Strategies

### Network Issues (Linear Backoff)

```
Attempt 1: 1s delay
Attempt 2: 2s delay
Attempt 3: 3s delay
```

### Rate Limiting (Exponential Backoff)

```
Attempt 1: 2s delay
Attempt 2: 4s delay
Attempt 3: 8s delay
```

### Internal Errors (Simple Retry)

```
Attempt 1: 2s delay
Attempt 2: 2s delay
```

### Account Linking

Delegates to `FirebaseAccountLinking.ts` with proper context.

### User Cancellation

Returns `null` (not an error).

---

## Toast Notifications

**Two sources:**

1. **FirebaseAuth** - Operation success

   ```typescript
   toast('success', 'Signed in successfully!');
   ```

2. **handleError** - Operation failure
   ```typescript
   throw handleError(error, {
     userMessage: 'Sign in failed',
     showNotification: true,
   });
   ```

---

## Usage Examples

### Basic Authentication

```typescript
const { user, loading, signInWithEmail } = useAuth();

if (loading) return <Spinner />;

if (user) {
  return <div>Welcome {user.email}</div>;
}

const handleSignIn = async () => {
  try {
    await signInWithEmail(email, password);
    // Success toast shown automatically
  } catch (error) {
    // Error toast shown automatically
    console.error(error);
  }
};
```

### OAuth with Partner State

```typescript
const { signInWithPartner, getPartnerState } = useAuth();

const googleState = getPartnerState('google');

const handleGoogleSignIn = async () => {
  try {
    await signInWithPartner('google', 'popup');
  } catch (error) {
    console.error(error);
  }
};

return (
  <button onClick={handleGoogleSignIn} disabled={googleState === PARTNER_STATE.LOADING}>
    {googleState === PARTNER_STATE.LOADING ? 'Signing in...' : 'Sign in with Google'}
  </button>
);
```

### Security Checks

```typescript
const { hasRole, hasTier } = useAuth();

// Check role (Firebase-verified)
const isAdmin = await hasRole('admin');
if (isAdmin) {
  // Show admin panel
}

// Check subscription tier (Firebase-verified)
const isPro = await hasTier('pro');
if (isPro) {
  // Show premium features
}
```

### Display vs Security

```typescript
const { user, userSubscription, hasTier } = useAuth();

// Display (sync, fast, cached)
const tierDisplay = userSubscription?.tier || 'free';

// Security check (async, Firebase-verified, authoritative)
const canAccessFeature = async () => {
  return await hasTier('pro');
};
```

---

## Key Architectural Decisions

### Why Drop AuthService?

1. **Not truly provider-agnostic** - FirebaseAuth is already Firebase-specific
2. **Thin wrapper** - Just called FirebaseAuth and wrapped errors
3. **Artificial separation** - Added complexity without value
4. **Honest architecture** - Building a Firebase solution, not a generic one

### Why FirebaseAuth Knows About Store?

1. **Complete orchestrator** - Handles Firebase ops + store updates together
2. **Clean separation** - React (useAuth) ≠ Business Logic (FirebaseAuth) ≠ SDK
3. **Cohesive responsibility** - Firebase state changes → store updates (same concern)

### Why Single Error Wrapping Point?

1. **DRY** - `handleError()` called once in SmartRecovery
2. **Consistency** - All errors have same format (DoNotDevError)
3. **Better messages** - Firebase errors mapped to user-friendly text
4. **Simpler debugging** - One place to look for error handling

---

## Migration from 5-Layer Architecture

If migrating from the old 5-layer architecture (with AuthService):

1. **Delete** `AuthService.ts`
2. **Update** `FirebaseAuth.ts` to include:
   - `setStore()` method
   - Store updates via domain methods
   - Partner state management
   - Security methods (hasRole, hasTier, hasFeature)
3. **Update** `FirebaseSmartRecovery.ts` to wrap errors with `handleError()`
4. **Update** `useAuth.ts` to call FirebaseAuth directly (skip AuthService)

---

## Critical Rules

1. **Never manually persist user data** - Firebase handles this automatically in IndexedDB
2. **Never use localStorage/sessionStorage for user auth** - Firebase uses IndexedDB for this
3. **Use sessionStorage ONLY for cross-page-load UI state** (OAuth redirects, account linking)
4. **Zustand = in-memory UI state only** (no persist middleware)
5. **Never call setState directly** - only use domain methods
6. **Never double-wrap errors** - `handleError()` called once in SmartRecovery
7. **Always use AUTH_PARTNERS schema** - no hardcoded provider strings
8. **Display from store, security from Firebase** - never mix concerns
9. **Partner state per provider** - granular UI feedback
10. **Smart recovery shows toasts** - user feedback during recovery
11. **Clear partner states on success** - `onAuthStateChanged` handles cleanup

---

## File Structure

```
packages/features/auth/src/
├── FirebaseAuth.ts              # Complete orchestrator
├── FirebaseSmartRecovery.ts     # Error recovery + wrapping
├── FirebaseAccountLinking.ts    # Account linking logic
├── AuthStore.ts                 # Zustand store
├── useAuth.ts                   # React hook entry point
├── constants.ts                 # PARTNER_STATE, etc.
└── types/                       # TypeScript types
```

---

## Summary

**4-Layer Architecture = Simple, Honest, Complete**

- **useAuth:** React binding (lazy load, connect, expose)
- **FirebaseAuth:** Complete orchestrator (ops + errors + store + state)
- **SDK:** Firebase wrapper (pure Firebase methods)
- **Firebase SDK:** The actual Firebase library

Each layer has **one clear responsibility**. No artificial separation. No double error handling. No complexity for hypothetical futures.

**Storage Strategy = Three-Tier System**

1. **Firebase SDK (Automatic):** User auth in IndexedDB - you do nothing
2. **sessionStorage (Manual):** OAuth redirects and account linking - survives page reload
3. **Zustand (No Persist):** UI state only - in-memory, doesn't need persistence

This is the architecture that works. This is what every production auth provider does.

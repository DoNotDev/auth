// packages/features/auth/src/AuthStore.ts

/**
 * @fileoverview Auth Store
 * @description Zustand store for auth state. Single source of truth with unified FeatureStatus.
 * Uses status enum ('initializing' | 'ready' | 'degraded' | 'error') for lifecycle management.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import {
  createDoNotDevStore,
  FEATURE_STATUS,
  syncQueryCacheIdentity,
  type AuthPartnerId,
  type AuthState,
  type AuthActions,
  type FeatureStatus,
} from '@donotdev/core';

import {
  PARTNER_STATE,
  type PartnerState,
  type EmailVerificationStatus,
} from './constants';

const initialState: AuthState = {
  user: null,
  authenticated: false,
  userId: null,
  loading: false,
  error: null,
  userProfile: null,
  userSubscription: null,
  partnerStates: {} as Record<AuthPartnerId, PartnerState>,
  partnerError: null,
  authService: null,
  emailVerification: {
    status: 'pending',
  },
  passwordResetPending: false,
  // Unified status - single source of truth
  status: FEATURE_STATUS.INITIALIZING,
};

/**
 * Strict value equality for plain JSON-like data (primitives, arrays, plain objects).
 * Key order is irrelevant; an `undefined`-valued key differs from a missing key.
 */
function isEqualData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => isEqualData(v, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return (
    ka.length === kb.length &&
    ka.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(b, k) &&
        isEqualData(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k]
        )
    )
  );
}

export const useAuthStore = createDoNotDevStore<AuthState & AuthActions>({
  name: 'auth-store',

  createStore: (set, get) => ({
    ...initialState,

    /**
     * Set unified feature status - single source of truth for auth lifecycle
     *
     * **Status transitions:**
     * - `initializing`: Auth is loading/initializing (show loader)
     * - `ready`: Auth fully operational (check user state, redirect if needed)
     * - `degraded`: Auth unavailable (protected routes redirect with error)
     * - `error`: Auth encountered error (protected routes redirect with error)
     *
     * @param status - New feature status
     */
    setStatus: (status: FeatureStatus) => {
      set({ status });
    },

    // Partner management
    // Set partner state with automatic error management
    setPartnerState: (partnerId, state, error) => {
      set((prev) => ({
        partnerStates: {
          ...prev.partnerStates,
          [partnerId]: state,
        },
        // Auto-manage error: set when state is 'error', clear otherwise
        partnerError:
          state === 'error' && error
            ? { partnerId, error }
            : prev.partnerError?.partnerId === partnerId
              ? null
              : prev.partnerError,
      }));
    },

    // Get partner state (with default)
    getPartnerState: (partnerId) => {
      return get().partnerStates[partnerId] || PARTNER_STATE.IDLE;
    },

    /**
     * Clear all partner states to idle
     * Called on successful auth or sign out
     */
    clearAllPartnerStates: () =>
      set((prev) => ({
        partnerStates: Object.keys(prev.partnerStates).reduce(
          (acc, key) => {
            acc[key as AuthPartnerId] = PARTNER_STATE.IDLE;
            return acc;
          },
          {} as Record<AuthPartnerId, PartnerState>
        ),
        partnerError: null,
      })),

    // ===================================================================
    // Domain Methods - AuthService uses these instead of setState
    // ===================================================================

    /**
     * Set authenticated state with all user data
     * Called by AuthService when user signs in. A different user than the one the
     * query cache was filled under resets the cache first (syncQueryCacheIdentity).
     *
     * A same-user update with unchanged data is a no-op: the stored `user`,
     * `userSubscription` and `userProfile` keep their references and subscribers are
     * not notified. Providers re-emit the session with fresh equal objects (e.g.
     * Supabase SIGNED_IN on every tab return) and would otherwise re-render every
     * `useAuth('user')` / `useAuth('can')` consumer. Changed data (e.g. new claims
     * after a token refresh) still updates the store.
     */
    setAuthenticated: (user, subscription, profile) => {
      syncQueryCacheIdentity(user.id);
      const prev = get();
      const next = {
        user: isEqualData(prev.user, user) ? prev.user : user,
        authenticated: true,
        userId: user.id,
        loading: false,
        error: null,
        status: FEATURE_STATUS.READY,
        userSubscription: isEqualData(prev.userSubscription, subscription)
          ? prev.userSubscription
          : subscription,
        userProfile: isEqualData(prev.userProfile, profile)
          ? prev.userProfile
          : profile,
      };
      const unchanged = (Object.keys(next) as (keyof typeof next)[]).every((k) =>
        Object.is(prev[k], next[k])
      );
      if (unchanged) return;
      set(next);
    },

    /**
     * Set unauthenticated state
     * Called by AuthService when user signs out. Resets the query cache first when it
     * was filled under a user (syncQueryCacheIdentity).
     */
    setUnauthenticated: () => {
      syncQueryCacheIdentity(null);
      set({
        user: null,
        authenticated: false,
        userId: null,
        loading: false,
        error: null,
        status: FEATURE_STATUS.READY,
        userSubscription: null,
        userProfile: null,
      });
    },

    /**
     * Set loading state
     * Used during auth operations
     */
    setAuthLoading: (loading) => {
      set({ loading });
    },

    /**
     * Set error state
     * Used when auth operations fail
     */
    setAuthError: (error) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: AuthState.error (AuthError) intersects DoNotDevStore.error (string) in core — unsatisfiable without a cast
      set({ error: error as any, loading: false });
    },

    /**
     * Clear error state
     * Used when user retries after error
     */
    clearAuthError: () => {
      set({ error: null });
    },

    // Custom claims support (sync - for display only)
    getCustomClaim: (claim: string) => {
      const state = get();
      return state.getCustomClaimLocal(claim);
    },

    getCustomClaims: () => {
      const state = get();
      return state.getCustomClaimsLocal();
    },

    // Service reference for real data access
    setAuthService: (authService) => set({ authService }),

    // Local fallback methods (sync - from cached data)
    getCustomClaimLocal: (claim: string) => {
      const state = get();
      // Try to get from userProfile.claims first, then userProfile directly, then user
      const profile = state.userProfile;
      if (
        profile?.claims &&
        typeof profile.claims === 'object' &&
        claim in (profile.claims as Record<string, unknown>)
      ) {
        return (profile.claims as Record<string, unknown>)[claim];
      }
      if (profile && typeof profile === 'object' && claim in profile) {
        return (profile as Record<string, unknown>)[claim];
      }
      if (state.user && typeof state.user === 'object' && claim in state.user) {
        return (state.user as Record<string, unknown>)[claim];
      }
      return null;
    },

    getCustomClaimsLocal: () => {
      const state = get();
      const claims: Record<string, unknown> = {};

      // Only merge actual claims — never spread entire user/profile objects
      if (state.userProfile?.claims) {
        Object.assign(claims, state.userProfile.claims);
      }

      // Return frozen copy to prevent external mutation of store state
      return Object.freeze({ ...claims });
    },

    // Password reset
    setPasswordResetPending: (pending: boolean) =>
      set({ passwordResetPending: pending }),

    // Email verification actions
    setEmailVerificationStatus: (
      status: EmailVerificationStatus,
      error?: string
    ) => set({ emailVerification: { status, error } }),

    // User data management
    setUserProfile: (profile) => set({ userProfile: profile }),
    setUserSubscription: (subscription) =>
      set({ userSubscription: subscription }),

    // State management
    setLoading: (loading) => set({ loading }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: same AuthState.error × DoNotDevStore.error conflict as setAuthError
    setError: (error) => set({ error: error as any }),
    clearError: () => set({ error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: initialState.error (AuthError) hits the same AuthState × DoNotDevStore error-type conflict
    reset: () => set(initialState as any),
  }),

  // Auth doesn't need persistence - session-based
});

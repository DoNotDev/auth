'use client';
// packages/features/auth/src/useAuth.ts

/**
 * @fileoverview useAuth Hook - Property-Based Access to Auth State and Methods
 * @description React hook for property-based access to authentication state and methods. Provides reactive state access and stable method access. Lazy loads FirebaseAuth and connects it to the auth store.
 * Uses unified FeatureStatus enum for lifecycle management.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useEffect, useCallback, useRef } from 'react';

import type {
  AuthPartnerId,
  AuthProvider,
  AuthResult,
  PageAuth,
  AuthAPI,
  CanAPI,
} from '@donotdev/core';
import {
  DEGRADED_AUTH_API,
  FEATURE_STATUS,
  handleError,
  hasProvider,
  getProvider,
  isClient,
  USER_ROLES,
  SUBSCRIPTION_TIERS,
  hasRoleAccess,
  hasTierAccess,
  getGlobalSingleton,
} from '@donotdev/core';
import { useAuthStore } from './AuthStore';
import { getAuthMethod, type AuthMethod } from './constants';

// globalThis-backed auth state - survives Vite chunk splits and HMR
const _a: {
  instance: AuthProvider | null;
  initializing: boolean;
  errorNotified: boolean;
} = getGlobalSingleton('auth-provider', () => ({
  instance: null,
  initializing: false,
  errorNotified: false,
}));

/**
 * Stable capability-based access control object factory
 * Created once, methods always use current store state
 */
function createCanAPI(): CanAPI {
  const hasPermission = (permission: string): boolean => {
    const state = useAuthStore.getState();
    // Admin+ bypasses all permission checks (uses role hierarchy)
    if (hasRoleAccess(state.user?.role, USER_ROLES.ADMIN)) return true;
    // Check permissions array in userProfile
    const permissions = (state.userProfile as any)?.permissions as
      | string[]
      | undefined;
    if (!permissions) return false;
    return permissions.includes(permission);
  };

  return {
    // Route-level access control (replaces canAccess)
    // Uses role hierarchy: admin can access user/guest routes, user can access guest routes
    navigate: (authConfig: PageAuth | false): boolean => {
      const state = useAuthStore.getState();

      if (authConfig === false) return true;

      if (authConfig === true) {
        if (!state.user) return false;
        return true;
      }

      if (authConfig.required && !state.user) return false;

      if (
        authConfig.role &&
        !hasRoleAccess(state.user?.role, authConfig.role)
      ) {
        return false;
      }

      if (
        authConfig.tier &&
        !hasTierAccess(state.userSubscription?.tier, authConfig.tier)
      ) {
        return false;
      }

      if (
        authConfig.validate &&
        state.userSubscription &&
        state.user?.role &&
        !authConfig.validate(state.user.role, state.userSubscription.tier)
      ) {
        return false;
      }

      return true;
    },
    // Resource-level access control
    view: (resource: string) => hasPermission(`${resource}:view`),
    edit: (resource: string) => hasPermission(`${resource}:edit`),
    delete: (resource: string) => hasPermission(`${resource}:delete`),
    create: (resource: string) => hasPermission(`${resource}:create`),
    has: (permission: string) => hasPermission(permission),
    perform: (action: string, context?: Record<string, any>) => {
      const state = useAuthStore.getState();
      // Admin+ bypasses all checks (uses role hierarchy)
      if (hasRoleAccess(state.user?.role, USER_ROLES.ADMIN)) return true;
      // Check for action permission
      if (!hasPermission(action)) return false;
      // If context provided, check against userProfile capabilities
      if (context) {
        const capabilities = (state.userProfile as any)?.capabilities as
          | Record<string, any>
          | undefined;
        if (capabilities?.[action]) {
          const limit = capabilities[action];
          // Example: { amount: 5000 } vs capability limit
          for (const [key, value] of Object.entries(context)) {
            if (typeof limit[key] === 'number' && typeof value === 'number') {
              if (value > limit[key]) return false;
            }
          }
        }
      }
      return true;
    },
  };
}

// Safe at module level: createCanAPI() only creates closures — getState() is called
// at invocation time (inside navigate/view/edit/etc.), not at factory time.
// Zustand stores self-initialize and are available in any JS runtime (SSR/edge included).
const stableCan = createCanAPI();

/**
 * Auth API type - complete interface for useAuth
 *
 * This interface defines all properties available through useAuth('propertyName').
 * Properties are categorized by their behavior:
 * - **State** (reactive): Re-renders when value changes
 * - **Methods** (stable): Never re-renders, always same reference
 * - **Computed** (derived): Re-renders when dependencies change
 *
 * @example
 * ```typescript
 * // State (reactive) - re-renders when user changes
 * const user = useAuth('user');
 *
 * // Method (stable) - never re-renders
 * const signIn = useAuth('signInWithEmail');
 *
 * // Computed (derived) - re-renders when user state changes
 * const isAuthenticated = useAuth('isAuthenticated');
 * ```
 *
 * Note: AuthAPI is imported from @donotdev/core for type consistency across the framework.
 */

// Store keys (state that comes from Zustand store)
const STORE_KEYS: Set<keyof AuthAPI> = new Set([
  'user',
  'loading',
  'error',
  'status',
  'userProfile',
  'userSubscription',
  'emailVerification',
  'passwordResetPending',
  'partnerError',
  'getPartnerState',
  'setPartnerState',
]);

/**
 * React hook for authentication with property-based access
 *
 * Single entry point for all authentication operations.
 * Lazy loads FirebaseAuth on first call and connects to store.
 * Uses unified FeatureStatus enum for lifecycle management.
 *
 * **Property-based access (clean and simple):**
 * ```typescript
 * // ✅ State from store (reactive, re-renders on change)
 * const user = useAuth('user');
 * const status = useAuth('status'); // 'initializing' | 'ready' | 'degraded' | 'error'
 * const loading = useAuth('loading');
 * const error = useAuth('error');
 *
 * // ✅ Methods from instance (stable, never re-renders)
 * const signIn = useAuth('signInWithEmail');
 * const signOut = useAuth('signOut');
 * ```
 *
 * **How it works:**
 * - Store properties (user, status, loading, etc.) → Subscribe via Zustand (reactive)
 * - Methods (signInWithEmail, etc.) → Get from FirebaseAuth instance (stable)
 *
 * **Status-based behavior:**
 * - `initializing`: Auth is loading (returns degraded API until ready)
 * - `ready`: Auth fully operational (returns real API)
 * - `degraded`: Auth unavailable (returns degraded API)
 * - `error`: Auth encountered error (returns degraded API)
 *
 * **Error Handling:**
 * All async methods throw DoNotDevError (already wrapped by FirebaseAuth/SmartRecovery).
 *
 * @template K - The property key from AuthAPI
 * @param key - Property name to access
 * @returns The value of the specified property
 *
 * @example
 * ```typescript
 * // Get status (re-renders when status changes)
 * const status = useAuth('status');
 * if (status === 'initializing') return <Spinner overlay />;
 * if (status === 'degraded') return <Error>Auth unavailable</Error>;
 *
 * // Get user (re-renders when user changes)
 * const user = useAuth('user');
 * if (!user) return <LoginButton />;
 *
 * // Get sign-in method (stable, never re-renders)
 * const signIn = useAuth('signInWithEmail');
 * await signIn(email, password);
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function useAuth<K extends keyof AuthAPI>(key: K): AuthAPI[K] {
  // ✅ ALL HOOKS MUST BE CALLED UNCONDITIONALLY (Rules of Hooks)
  const authUnsubRef = useRef<(() => void) | null>(null);

  // ✅ Initialize auth when conditions are met (with race condition guard)
  useEffect(() => {
    if (!isClient()) return;

    const { status } = useAuthStore.getState();
    // Already working - don't reinitialize
    if (status === FEATURE_STATUS.READY) return;

    // Race condition guard
    if (_a.initializing) return;
    _a.initializing = true;

    const initAuth = async () => {
      try {
        // Provider registry takes priority — if configured, use it
        if (hasProvider('auth')) {
          _a.instance = getProvider('auth');
        } else {
          // Legacy path: dynamic import of FirebaseAuth
          const { getFirebaseAuth } = await import('@donotdev/firebase');
          _a.instance = getFirebaseAuth();
        }

        if (!_a.instance) return;

        // setStore/setAuthService only if the provider supports it (FirebaseAuth-specific)
        if ('setStore' in _a.instance) {
          (
            _a.instance as {
              setStore: (s: ReturnType<typeof useAuthStore.getState>) => void;
            }
          ).setStore(useAuthStore.getState());
        }
        useAuthStore.getState().setAuthService(_a.instance);

        await _a.instance.initialize();

        // onAuthStateChanged triggers handleAuthStateChange in provider
        // which calls store.setAuthenticated/setUnauthenticated → sets status to READY.
        // Capture unsubscribe and clear on cleanup to avoid listener leak on unmount/remount.
        authUnsubRef.current = _a.instance.onAuthStateChanged(() => {});

        _a.errorNotified = false;
      } catch (error) {
        useAuthStore.getState().setStatus(FEATURE_STATUS.DEGRADED);
        // Silent degradation - don't show toast for init failures
        // Toast only for user-initiated actions
        if (!_a.errorNotified) {
          handleError(error, {
            userMessage: 'Authentication initialization failed',
            context: { operation: 'useAuth.initialize' },
            severity: 'warning',
            showNotification: false,
          });
          _a.errorNotified = true;
        }
      } finally {
        _a.initializing = false;
      }
    };

    initAuth();
    return () => {
      authUnsubRef.current?.();
      authUnsubRef.current = null;
      // Reset initialization guard so React strict mode double-mount (or re-mount
      // after unmount) can re-initialize auth correctly.
      _a.initializing = false;
    };
  }, []);

  // ==========================================================================
  // Service Methods (Async - FirebaseAuth)
  // ✅ ALL useCallback hooks MUST be called unconditionally (Rules of Hooks)
  // ==========================================================================

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!isClient() || !_a.instance) return null;
      return _a.instance.signInWithEmail(email, password);
    },
    []
  );

  const createUserWithEmail = useCallback(
    async (
      email: string,
      password: string,
      metadata?: import('@donotdev/core').SignUpMetadata
    ) => {
      if (!isClient() || !_a.instance) return null;
      return _a.instance.createUserWithEmail(email, password, metadata);
    },
    []
  );

  const signInWithPartner = useCallback(
    async (partnerId: AuthPartnerId, method?: AuthMethod) => {
      if (!isClient() || !_a.instance) return null;
      const authMethod = getAuthMethod(method);
      return _a.instance.signInWithPartner(partnerId, authMethod);
    },
    []
  );

  const linkWithPartner = useCallback(
    async (partnerId: AuthPartnerId, method?: AuthMethod) => {
      if (!isClient() || !_a.instance) return null;
      // Use getAuthMethod for consistent dev/prod behavior (popup in dev, redirect in prod)
      const authMethod = getAuthMethod(method);
      return _a.instance.linkWithPartner(partnerId, authMethod);
    },
    []
  );

  const signInWithGoogleCredential = useCallback(
    async (credential: string): Promise<AuthResult | null> => {
      if (!isClient() || !_a.instance) return null;
      return _a.instance.signInWithGoogleCredential(credential);
    },
    []
  );

  const signOut = useCallback(async () => {
    if (!isClient() || !_a.instance) return;
    return _a.instance.signOut();
  }, []);

  const sendPasswordResetEmail = useCallback(async (email: string) => {
    if (!isClient() || !_a.instance) return;
    return _a.instance.sendPasswordResetEmail(email);
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!isClient() || !_a.instance) return;
    return _a.instance.updatePassword(newPassword);
  }, []);

  const verifyPasswordResetCode = useCallback(
    async (code: string): Promise<string | null> => {
      if (!isClient() || !_a.instance?.verifyPasswordResetCode) return null;
      return _a.instance.verifyPasswordResetCode(code);
    },
    []
  );

  const confirmPasswordReset = useCallback(
    async (code: string, newPassword: string) => {
      if (!isClient() || !_a.instance?.confirmPasswordReset) return;
      return _a.instance.confirmPasswordReset(code, newPassword);
    },
    []
  );

  const sendEmailVerification = useCallback(async () => {
    if (!isClient() || !_a.instance) return;
    return _a.instance.sendEmailVerification();
  }, []);

  const sendSignInLinkToEmail = useCallback(
    async (
      email: string,
      actionCodeSettings?: { url: string; handleCodeInApp: boolean }
    ) => {
      if (!isClient() || !_a.instance) return;
      return _a.instance.sendSignInLinkToEmail(email, actionCodeSettings);
    },
    []
  );

  const signInWithEmailLink = useCallback(
    async (email: string, emailLink?: string) => {
      if (!isClient() || !_a.instance) return null;
      return _a.instance.signInWithEmailLink(email, emailLink);
    },
    []
  );

  const isSignInWithEmailLink = useCallback((emailLink?: string) => {
    if (!isClient() || !_a.instance) return false;
    return _a.instance.isSignInWithEmailLink(emailLink);
  }, []);

  const getCurrentUser = useCallback(async () => {
    if (!isClient() || !_a.instance) return null;
    return _a.instance.getCurrentUser();
  }, []);

  const getEmailVerificationStatus = useCallback(async () => {
    if (!isClient() || !_a.instance) return { status: 'pending' as const };
    return _a.instance.getEmailVerificationStatus();
  }, []);

  const isEmailVerificationEnabled = useCallback(async () => {
    if (!isClient() || !_a.instance) return false;
    return _a.instance.isEmailVerificationEnabled();
  }, []);

  // Security Methods
  const hasRole = useCallback(async (role: string) => {
    if (!isClient() || !_a.instance) return false;
    return _a.instance.hasRole(role);
  }, []);

  const hasTier = useCallback(async (tier: string) => {
    if (!isClient() || !_a.instance) return false;
    return _a.instance.hasTier(tier);
  }, []);

  const hasFeature = useCallback(async (feature: string) => {
    if (!isClient() || !_a.instance) return false;
    return _a.instance.hasFeature(feature);
  }, []);

  // Display Helpers
  const getCustomClaims = useCallback(() => {
    if (!isClient()) return {};
    return useAuthStore.getState().getCustomClaims();
  }, []);

  const getCustomClaim = useCallback((claim: string) => {
    if (!isClient()) return null;
    return useAuthStore.getState().getCustomClaim(claim);
  }, []);

  const reauthenticateWithPassword = useCallback(async (password: string) => {
    if (!isClient() || !_a.instance) return;
    return _a.instance.reauthenticateWithPassword(password);
  }, []);

  const reauthenticateWithProvider = useCallback(
    async (partnerId: AuthPartnerId, method?: AuthMethod) => {
      if (!isClient() || !_a.instance) return;
      return _a.instance.reauthenticateWithProvider(partnerId, method);
    },
    []
  );

  const deleteAccount = useCallback(async (password?: string) => {
    if (!isClient() || !_a.instance) return;
    return _a.instance.deleteAccount(password);
  }, []);

  const setRememberMe = useCallback(async (remember: boolean) => {
    if (!isClient() || !_a.instance?.setRememberMe) return;
    return _a.instance.setRememberMe(remember);
  }, []);

  // ==========================================================================
  // Methods Object - Each method is stable via useCallback
  // No useMemo needed since we only access individual properties
  // ==========================================================================

  const methods = {
    signInWithEmail,
    createUserWithEmail,
    signInWithPartner,
    linkWithPartner,
    signInWithGoogleCredential,
    signOut,
    sendPasswordResetEmail,
    updatePassword,
    verifyPasswordResetCode,
    confirmPasswordReset,
    sendEmailVerification,
    getEmailVerificationStatus,
    isEmailVerificationEnabled,
    sendSignInLinkToEmail,
    signInWithEmailLink,
    isSignInWithEmailLink,
    getCurrentUser,
    reauthenticateWithPassword,
    reauthenticateWithProvider,
    deleteAccount,
    setRememberMe,
    hasRole,
    hasTier,
    hasFeature,
    getCustomClaims,
    getCustomClaim,
  };

  // ==========================================================================
  // ✅ ALWAYS call all hooks BEFORE any conditional returns (Rules of Hooks)
  // ==========================================================================

  // Computed keys set
  const computedKeys: Set<keyof AuthAPI> = new Set([
    'isAuthenticated',
    'userRole',
    'userTier',
    'can',
  ]);

  // ✅ ALWAYS subscribe to store unconditionally - condition is INSIDE selector
  const storeValue = useAuthStore((state) =>
    STORE_KEYS.has(key) ? (state as any)[key] : null
  );

  // ✅ ALWAYS subscribe for computed values unconditionally - condition is INSIDE selector
  const computedValue = useAuthStore((state) => {
    if (!computedKeys.has(key)) return null;
    if (key === 'isAuthenticated') return !!state.user;
    if (key === 'userRole') return state.user?.role || USER_ROLES.GUEST;
    if (key === 'userTier')
      return state.userSubscription?.tier || SUBSCRIPTION_TIERS.FREE;
    if (key === 'can') return stableCan;
    return null;
  });

  // ==========================================================================
  // NOW conditionally return values (hooks already called above)
  // ==========================================================================

  // ✅ Subscribe to status reactively so components re-render when auth status changes
  const status = useAuthStore((state) => state.status);

  // Always return real status from store (needed for components to show loaders)
  if (key === 'status') {
    return status as AuthAPI[K];
  }

  // Graceful degradation: initializing/degraded/error → return degraded API
  if (
    status === FEATURE_STATUS.INITIALIZING ||
    status === FEATURE_STATUS.DEGRADED ||
    status === FEATURE_STATUS.ERROR
  ) {
    return DEGRADED_AUTH_API[key];
  }

  // Return isAvailable (true when not in degraded mode)
  if (key === 'isAvailable') {
    return true as AuthAPI[K];
  }

  // Return store value
  if (STORE_KEYS.has(key)) {
    return storeValue as AuthAPI[K];
  }

  // Return method
  if (key in methods) {
    return methods[key as keyof typeof methods] as AuthAPI[K];
  }

  // Return computed value
  if (computedKeys.has(key)) {
    return computedValue as AuthAPI[K];
  }

  // Fallback (should never happen with proper types)
  return DEGRADED_AUTH_API[key];
}

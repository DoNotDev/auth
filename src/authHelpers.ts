// packages/features/auth/src/authHelpers.ts

/**
 * @fileoverview Auth Helper Functions
 * @description Non-React utilities for accessing auth state outside React components.
 * These functions provide safe access to auth state in Zustand stores and other non-React contexts.
 * The store always exists and returns valid state, even if auth is not initialized or consented.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { isClient } from '@donotdev/core';
import type { AuthState, AuthActions } from '@donotdev/core';

import { useAuthStore } from './AuthStore';

/**
 * Get current auth state synchronously
 * Use this in Zustand stores or other non-React contexts
 *
 * **Behavior:**
 * - Always returns valid state (never throws)
 * - Returns initial state if auth is not initialized: `{ user: null, initialized: false, ... }`
 * - Works in both client and server contexts (server returns initial state)
 * - No graceful degradation needed - store always exists with valid initial state
 *
 * @returns Current auth state (or initial state if not initialized)
 *
 * @example
 * ```typescript
 * const authState = getAuthState();
 * const userId = authState.userId; // null if not authenticated
 * const user = authState.user; // null if not authenticated
 * const isInitialized = authState.initialized; // false until auth initializes
 * ```
 */
export function getAuthState(): AuthState & AuthActions {
  // Store always exists and returns valid state
  // On server, Zustand store returns initial state (user: null, initialized: false)
  // On client, returns current state (may be uninitialized if auth hasn't loaded yet)
  return useAuthStore.getState();
}

/**
 * Subscribe to auth state changes
 * Use this in Zustand stores or other non-React contexts
 *
 * **Behavior:**
 * - Always returns unsubscribe function (never throws)
 * - Subscriptions work even if auth is not initialized
 * - On server, subscription is a no-op (returns empty unsubscribe function)
 * - Listener receives initial state immediately, then updates as auth state changes
 *
 * **Important:** Always call the returned unsubscribe function to prevent memory leaks.
 *
 * @param listener - Callback function that receives (state, prevState)
 * @returns Unsubscribe function (call to remove listener)
 *
 * @example
 * ```typescript
 * const unsubscribe = subscribeToAuth((state, prevState) => {
 *   if (state.user?.id !== prevState.user?.id) {
 *     // User changed - handle accordingly
 *     if (state.user) {
 *       console.log('User signed in:', state.user.id);
 *     } else {
 *       console.log('User signed out');
 *     }
 *   }
 * });
 *
 * // Later, cleanup
 * unsubscribe();
 * ```
 */
export function subscribeToAuth(
  listener: (
    state: AuthState & AuthActions,
    prevState: AuthState & AuthActions
  ) => void
): () => void {
  // On server, Zustand subscriptions are no-ops but still return valid unsubscribe
  // On client, normal Zustand subscription behavior
  if (!isClient()) {
    // Server-side: return no-op unsubscribe
    // Store still exists but subscriptions don't work on server
    return () => {};
  }

  return useAuthStore.subscribe(listener);
}

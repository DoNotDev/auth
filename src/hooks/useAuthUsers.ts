'use client';
// packages/features/auth/src/hooks/useAuthUsers.ts

/**
 * @fileoverview useAuthUsers hook
 * @description Admin apps: every auth account (email, confirmation, sign-in dates),
 * loaded once auth is ready, through `useAuth('listUsers')`.
 *
 * @version 0.1.0
 * @since 0.3.3
 * @author AMBROISE PARK Consulting
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AuthUserSummary } from '@donotdev/core';
import { FEATURE_STATUS } from '@donotdev/core';

import { useAuthStore } from '../AuthStore';
import { useAuth } from '../useAuth';

/**
 * Auth user list state
 *
 * @version 0.1.0
 * @since 0.3.3
 */
export interface AuthUsersState {
  /** Every auth account; empty until loaded */
  users: AuthUserSummary[];
  /** True while auth initialises or the list loads */
  loading: boolean;
  /** Load failure (not an admin, server function not deployed, network) */
  error: Error | null;
  /** Load the list again */
  reload: () => Promise<void>;
}

/**
 * Lists every auth account for admin pages. Loads once when auth is ready; the
 * provider calls its admin-only `listAuthUsers` server function, which the app deploys
 * (`createListAuthUsers` for Supabase, `listAuthUsers` for Firebase, from
 * `@donotdev/functions`). A non-admin gets `error`, never a partial list.
 *
 * @example
 * ```tsx
 * const { users, loading, error, reload } = useAuthUsers();
 * ```
 *
 * @returns `{ users, loading, error, reload }`
 * @version 0.1.0
 * @since 0.3.3
 */
export function useAuthUsers(): AuthUsersState {
  const listUsers = useAuth('listUsers');
  // Raw provider status: the cookie snapshot reports ready before the provider is.
  const initializing = useAuthStore(
    (state) => state.status === FEATURE_STATUS.INITIALIZING
  );
  const [users, setUsers] = useState<AuthUserSummary[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Only the latest request (and a mounted component) writes the state
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setFetching(true);
    setError(null);
    try {
      const list = await listUsers();
      if (id === requestId.current) setUsers(list);
    } catch (err) {
      if (id === requestId.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (id === requestId.current) setFetching(false);
    }
  }, [listUsers]);

  useEffect(() => {
    if (initializing) return;
    void reload();
    return () => {
      requestId.current++;
    };
  }, [initializing, reload]);

  return { users, loading: initializing || fetching, error, reload };
}

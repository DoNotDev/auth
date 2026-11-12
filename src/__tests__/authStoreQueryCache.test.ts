// packages/features/auth/src/__tests__/authStoreQueryCache.test.ts

/**
 * The auth store resets the browser query cache when the signed-in identity changes
 * (syncQueryCacheIdentity in @donotdev/core), before the new identity renders.
 */

import { describe, expect, it } from 'vitest';

import { getQueryClient } from '@donotdev/core';
import type { AuthUser } from '@donotdev/core';

import { useAuthStore } from '../AuthStore';

const user = (id: string) => ({ id, role: 'user' }) as AuthUser;
const signIn = (id: string) =>
  useAuthStore.getState().setAuthenticated(user(id), {} as never, {} as never);

describe('AuthStore identity change', () => {
  it('drops queries cached under the previous identity, keeps them for the same user', () => {
    const client = getQueryClient();
    const key = ['account', 'u1'];
    useAuthStore.getState().setUnauthenticated();

    // Fetched while signed out (anonymous: RLS returned nothing)
    client.setQueryData(key, []);
    signIn('u1');
    expect(client.getQueryData(key)).toBeUndefined();
    expect(useAuthStore.getState().userId).toBe('u1');

    client.setQueryData(key, { id: 'acc' });
    signIn('u1'); // token refresh: same identity
    expect(client.getQueryData(key)).toEqual({ id: 'acc' });

    useAuthStore.getState().setUnauthenticated();
    expect(client.getQueryData(key)).toBeUndefined();
  });
});

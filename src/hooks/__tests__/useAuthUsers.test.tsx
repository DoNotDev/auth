/**
 * @fileoverview Unit tests for `useAuthUsers`.
 * @description Loads once auth is ready, through `useAuth('listUsers')`; exposes the
 *   failure as `error`; `reload` loads again.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListUsers = vi.fn();
vi.mock('../../useAuth', () => ({
  useAuth: (key: string) => (key === 'listUsers' ? mockListUsers : undefined),
}));

let mockStatus = 'ready';
vi.mock('../../AuthStore', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: mockStatus }),
}));

import { useAuthUsers } from '../useAuthUsers';

const USERS = [
  {
    id: 'u1',
    email: 'a@example.com',
    emailConfirmedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    lastSignInAt: null,
    displayName: null,
  },
];

describe('useAuthUsers', () => {
  beforeEach(() => {
    mockListUsers.mockReset();
    mockStatus = 'ready';
  });

  it('loads the users once on mount', async () => {
    mockListUsers.mockResolvedValue(USERS);
    const { result } = renderHook(() => useAuthUsers());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toEqual(USERS);
    expect(result.current.error).toBeNull();
    expect(mockListUsers).toHaveBeenCalledTimes(1);
  });

  it('waits while auth initialises', () => {
    mockStatus = 'initializing';
    const { result } = renderHook(() => useAuthUsers());
    expect(result.current.loading).toBe(true);
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it('exposes a refusal as error, with no users', async () => {
    const refusal = new Error('Access denied');
    mockListUsers.mockRejectedValue(refusal);
    const { result } = renderHook(() => useAuthUsers());
    await waitFor(() => expect(result.current.error).toBe(refusal));
    expect(result.current.users).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('reload() loads again', async () => {
    mockListUsers.mockResolvedValueOnce([]).mockResolvedValueOnce(USERS);
    const { result } = renderHook(() => useAuthUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toEqual([]);
    await act(() => result.current.reload());
    expect(result.current.users).toEqual(USERS);
    expect(mockListUsers).toHaveBeenCalledTimes(2);
  });
});

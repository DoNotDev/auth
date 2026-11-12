/**
 * @fileoverview Unit tests for `useDeleteAccount` refusal messages.
 * @description A server refusal code with an `auth:deleteAccount.errors.<code>` key is
 *   shown translated; anything else keeps the raw error message.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DoNotDevError } from '@donotdev/core';

const mockDeleteAccount = vi.fn();
vi.mock('../../useAuth', () => ({
  useAuth: (key: string) =>
    key === 'deleteAccount' ? mockDeleteAccount : undefined,
}));

const TRANSLATIONS: Record<string, string> = {
  'deleteAccount.errors.open_orders': 'You still have an order in progress.',
};
vi.mock('@donotdev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/core')>();
  return {
    ...actual,
    // Framework t(): returns the key itself when the translation is missing
    useTranslation: () => ({ t: (key: string) => TRANSLATIONS[key] ?? key }),
  };
});

import { useDeleteAccount } from '../useDeleteAccount';

async function failWith(error: unknown) {
  mockDeleteAccount.mockRejectedValueOnce(error);
  const { result } = renderHook(() => useDeleteAccount());
  await act(async () => {
    await result.current.confirmDelete();
  });
  return result.current;
}

describe('useDeleteAccount — refusal messages', () => {
  beforeEach(() => mockDeleteAccount.mockReset());

  it('translates a server refusal carried in details.serverMessage', async () => {
    const state = await failWith(
      new DoNotDevError('Request failed.', 'unknown', {
        details: { serverMessage: 'open_orders', serverCode: 'P0001' },
      })
    );
    expect(state.error).toBe('You still have an order in progress.');
  });

  it('translates a refusal carried as the error message', async () => {
    const state = await failWith(new Error('open_orders'));
    expect(state.error).toBe('You still have an order in progress.');
  });

  it('keeps the raw message when no key exists for the code', async () => {
    const state = await failWith(
      new DoNotDevError('Request failed.', 'unknown', {
        details: { serverMessage: 'unpaid_terms' },
      })
    );
    expect(state.error).toBe('Request failed.');
  });

  it('still opens the password dialog on REQUIRES_PASSWORD', async () => {
    const state = await failWith(new Error('REQUIRES_PASSWORD'));
    expect(state.showPasswordDialog).toBe(true);
    expect(state.error).toBeNull();
  });
});

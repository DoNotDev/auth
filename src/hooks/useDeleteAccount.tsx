'use client';
// packages/features/auth/src/hooks/useDeleteAccount.tsx

/**
 * @fileoverview useDeleteAccount hook
 * @description React hook for managing account deletion flow with re-authentication and confirmation dialogs
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState } from 'react';

import { useTranslation } from '@donotdev/core';

import { useAuth } from '../useAuth';

/** Key prefix (namespace `auth`) under which consumers translate refusal codes. */
const REFUSAL_KEY_PREFIX = 'deleteAccount.errors.';

/** A refusal code usable as an i18n key segment (`open_orders`, `unpaid-terms`). */
const REFUSAL_CODE = /^[A-Za-z0-9_-]+$/;

/**
 * Refusal codes carried by a deletion error, most specific first: the server's
 * `code` and `error` (Supabase callable `details.serverCode` / `details.serverMessage`,
 * from a `createDeleteAccount({ beforeDelete })` refusal), then the error message.
 */
function refusalCodes(err: unknown): string[] {
  const details =
    typeof err === 'object' && err !== null && 'details' in err
      ? (err.details as Record<string, unknown> | undefined)
      : undefined;
  const candidates = [
    details?.serverCode,
    details?.serverMessage,
    err instanceof Error ? err.message : undefined,
  ];
  return candidates.filter(
    (c): c is string => typeof c === 'string' && REFUSAL_CODE.test(c)
  );
}

/**
 * Account deletion state and actions
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface DeleteAccountState {
  /** Whether confirmation dialog is visible */
  showConfirmDialog: boolean;

  /** Whether account deletion is in progress */
  isDeleting: boolean;

  /** Whether password re-authentication dialog is visible */
  showPasswordDialog: boolean;

  /** Error message if any */
  error: string | null;

  /** Start the deletion flow (shows confirmation dialog) */
  startDeleteFlow: () => void;

  /** Confirm deletion (executes actual deletion, handles reauthentication internally) */
  confirmDelete: (password?: string) => Promise<void>;

  /** Cancel deletion flow (closes dialogs) */
  cancel: () => void;
}

/**
 * Hook for managing account deletion flow
 *
 * Handles:
 * - Confirmation dialog
 * - Password dialog (when password is required for reauthentication)
 * - Error states
 * - Loading states
 *
 * Reauthentication is handled internally by FirebaseAuth.deleteAccount():
 * - OAuth providers: Automatically triggers popup
 * - Password providers: Requires password parameter
 *
 * **Server refusals**: when the server refuses the deletion (e.g. a
 * `createDeleteAccount({ beforeDelete })` that throws `open_orders`), `error` is the
 * translation of `deleteAccount.errors.<code>` in the `auth` namespace when that key
 * exists. The code is looked up as the server's `code`, then its `error` message, then
 * the client error message; only `[A-Za-z0-9_-]+` values are tried. Without a matching
 * key, `error` is the raw error message (unchanged behaviour). Consumers add the keys
 * in their `auth` locale override, e.g. `src/locales/auth_fr.json`:
 *
 * ```json
 * { "deleteAccount": { "errors": {
 *   "open_orders": "Vous avez une commande en cours. Réessayez après sa livraison."
 * } } }
 * ```
 *
 * @example
 * ```tsx
 * const deletion = useDeleteAccount();
 *
 * // Start flow
 * <Button onClick={deletion.startDeleteFlow}>Delete Account</Button>
 *
 * // Dialogs
 * <ReauthDialog
 *   open={deletion.showPasswordDialog}
 *   onReauth={(password) => deletion.confirmDelete(password)}
 *   onCancel={deletion.cancel}
 * />
 * <ConfirmDeleteDialog
 *   open={deletion.showConfirmDialog}
 *   onConfirm={() => deletion.confirmDelete()}
 *   onCancel={deletion.cancel}
 * />
 * ```
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @returns Account deletion state and actions
 */
export function useDeleteAccount(): DeleteAccountState {
  const deleteAccount = useAuth('deleteAccount');
  const { t } = useTranslation('auth');

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDeleteFlow = () => {
    setError(null);
    setShowConfirmDialog(true);
  };

  const confirmDelete = async (password?: string) => {
    setIsDeleting(true);
    setError(null);

    try {
      await deleteAccount(password);
      // User deleted - auth state will update, redirect handled by app
      setShowConfirmDialog(false);
      setShowPasswordDialog(false);
    } catch (err) {
      // why: deleteAccount rejects with Error instances carrying sentinel messages
      const errorMessage = (err as Error).message;

      // Password required - show password dialog
      if (errorMessage === 'REQUIRES_PASSWORD') {
        setShowConfirmDialog(false);
        setShowPasswordDialog(true);
      } else if (errorMessage === 'REAUTH_CANCELLED') {
        // User cancelled OAuth popup - just close dialogs
        setShowConfirmDialog(false);
        setShowPasswordDialog(false);
      } else {
        // why: the framework t() returns the key itself when it is missing
        const refusal = refusalCodes(err)
          .map((code) => t(`${REFUSAL_KEY_PREFIX}${code}`))
          .find((text) => !text.startsWith(REFUSAL_KEY_PREFIX));
        setError(refusal ?? (errorMessage || 'Failed to delete account'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const cancel = () => {
    setShowConfirmDialog(false);
    setShowPasswordDialog(false);
    setError(null);
  };

  return {
    showConfirmDialog,
    showPasswordDialog,
    isDeleting,
    error,
    startDeleteFlow,
    confirmDelete,
    cancel,
  };
}

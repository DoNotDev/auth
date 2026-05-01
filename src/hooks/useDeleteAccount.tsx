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

import { useAuth } from '../useAuth';

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
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @returns Account deletion state and actions
 */
export function useDeleteAccount(): DeleteAccountState {
  const deleteAccount = useAuth('deleteAccount');

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
    } catch (err: any) {
      const errorMessage = err.message || (err as Error).message;

      // Password required - show password dialog
      if (errorMessage === 'REQUIRES_PASSWORD') {
        setShowConfirmDialog(false);
        setShowPasswordDialog(true);
      } else if (errorMessage === 'REAUTH_CANCELLED') {
        // User cancelled OAuth popup - just close dialogs
        setShowConfirmDialog(false);
        setShowPasswordDialog(false);
      } else {
        setError(errorMessage || 'Failed to delete account');
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

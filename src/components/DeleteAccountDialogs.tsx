// packages/features/auth/src/components/DeleteAccountDialogs.tsx

/**
 * @fileoverview Delete Account Dialogs
 * @description Re-authentication and confirmation dialogs for account deletion
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  Dialog,
  Button,
  BUTTON_VARIANT,
  PasswordInput,
  Label,
  Checkbox,
  Alert,
  ALERT_VARIANT,
  Stack,
  Text,
  List,
} from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

/**
 * Re-authentication dialog props
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface ReauthDialogProps {
  /** Whether dialog is open */
  open: boolean;

  /** Whether re-authentication is in progress */
  isLoading: boolean;

  /** Error message if any */
  error: string | null;

  /** Re-authentication handler */
  onReauth: (password: string) => Promise<void>;

  /** Cancel handler */
  onCancel: () => void;
}

/**
 * Re-authentication dialog for account deletion
 *
 * Prompts user to re-enter password for security before account deletion.
 *
 * @example
 * ```tsx
 * <ReauthDialog
 *   open={showReauthDialog}
 *   isLoading={isReauthenticating}
 *   error={error}
 *   onReauth={reauthenticate}
 *   onCancel={cancel}
 * />
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function ReauthDialog({
  open,
  isLoading,
  error,
  onReauth,
  onCancel,
}: ReauthDialogProps) {
  const { t } = useTranslation('auth');
  const [password, setPassword] = useState('');

  const handleSubmit = async () => {
    await onReauth(password);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => !open && onCancel()}
      title={t('deleteAccount.reauth.title', 'Confirm Your Identity')}
      description={t(
        'deleteAccount.reauth.description',
        'For security, please re-enter your password to continue.'
      )}
      footer={
        <>
          <Button
            variant={BUTTON_VARIANT.OUTLINE}
            onClick={onCancel}
            disabled={isLoading}
          >
            {t('deleteAccount.reauth.cancel', 'Cancel')}
          </Button>
          <Button
            variant={BUTTON_VARIANT.DEFAULT}
            onClick={handleSubmit}
            disabled={isLoading || !password}
          >
            {isLoading
              ? t('deleteAccount.reauth.verifying', 'Verifying...')
              : t('deleteAccount.reauth.continue', 'Continue')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <Stack>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            label={t('deleteAccount.reauth.password', 'Password')}
            disabled={isLoading}
            placeholder={t(
              'deleteAccount.reauth.passwordPlaceholder',
              'Enter your password'
            )}
            required
            className="dndev-w-full"
          />
          {error && <Alert variant={ALERT_VARIANT.ERROR} description={error} />}
        </Stack>
      </form>
    </Dialog>
  );
}

/**
 * Confirmation dialog props
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface ConfirmDeleteDialogProps {
  /** Whether dialog is open */
  open: boolean;

  /** Whether deletion is in progress */
  isLoading: boolean;

  /** Error message if any */
  error: string | null;

  /** Confirm deletion handler */
  onConfirm: () => Promise<void>;

  /** Cancel handler */
  onCancel: () => void;
}

/**
 * Confirmation dialog for account deletion
 *
 * Shows warning, lists what will be deleted, and requires explicit confirmation.
 *
 * @example
 * ```tsx
 * <ConfirmDeleteDialog
 *   open={showConfirmDialog}
 *   isLoading={isDeleting}
 *   error={error}
 *   onConfirm={confirmDelete}
 *   onCancel={cancel}
 * />
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function ConfirmDeleteDialog({
  open,
  isLoading,
  error,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) {
  const { t } = useTranslation('auth');
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = async () => {
    if (!confirmed) return;
    await onConfirm();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => !open && onCancel()}
      data-content-size="text"
      title={t('deleteAccount.confirm.title', 'Delete Your Account?')}
      description={t(
        'deleteAccount.confirm.description',
        'This action cannot be undone. This will permanently delete your account.'
      )}
      footer={
        <>
          <Button
            variant={BUTTON_VARIANT.OUTLINE}
            onClick={onCancel}
            disabled={isLoading}
          >
            {t('deleteAccount.confirm.cancel', 'Cancel')}
          </Button>
          <Button
            variant={BUTTON_VARIANT.DESTRUCTIVE}
            icon={Trash2}
            onClick={handleConfirm}
            disabled={isLoading || !confirmed}
          >
            {isLoading
              ? t('deleteAccount.confirm.deleting', 'Deleting...')
              : t('deleteAccount.confirm.delete', 'Delete My Account')}
          </Button>
        </>
      }
    >
      <Stack gap="large">
        <Stack>
          <Text as="h4" level="h4">
            {t('deleteAccount.confirm.whatDeleted', 'What will be deleted:')}
          </Text>
          <List
            items={[
              t(
                'deleteAccount.confirm.credentials',
                'Your account and authentication credentials'
              ),
              t('deleteAccount.confirm.profile', 'Your profile information'),
              t('deleteAccount.confirm.oauth', 'All connected OAuth providers'),
              t(
                'deleteAccount.confirm.subscriptions',
                'Active subscriptions (will be canceled)'
              ),
            ]}
          />
        </Stack>

        <Stack>
          <Text as="h4" level="h4">
            {t(
              'deleteAccount.confirm.whatKept',
              'What will be kept (anonymized):'
            )}
          </Text>
          <List
            items={[
              t(
                'deleteAccount.confirm.billing',
                'Billing history for tax/accounting purposes'
              ),
              t(
                'deleteAccount.confirm.invoices',
                'Past invoices and transaction records'
              ),
            ]}
          />
        </Stack>

        <Stack direction="row" align="start">
          <Checkbox
            id="confirm-delete"
            checked={confirmed}
            onCheckedChange={(checked) => setConfirmed(checked === true)}
          />
          <Label htmlFor="confirm-delete">
            {t(
              'deleteAccount.confirm.checkbox',
              'I understand this action cannot be undone'
            )}
          </Label>
        </Stack>

        {error && <Alert variant={ALERT_VARIANT.ERROR} description={error} />}
      </Stack>
    </Dialog>
  );
}

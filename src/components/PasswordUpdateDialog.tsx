'use client';
// packages/features/auth/src/components/PasswordUpdateDialog.tsx

/**
 * @fileoverview PasswordUpdateDialog component
 * @description Password update dialog with react-hook-form validation,
 * PasswordInput with eye toggle, and password strength indicator.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';

import {
  Alert,
  ALERT_VARIANT,
  Button,
  BUTTON_VARIANT,
  Dialog,
  PasswordInput,
  Stack,
  Text,
} from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';

interface PasswordUpdateFormData {
  password: string;
}

interface PasswordUpdateDialogProps {
  updatePassword: (password: string) => Promise<void>;
}

/**
 * Password Update Dialog Component
 *
 * Best-in-class password update with:
 * - react-hook-form validation
 * - PasswordInput with eye toggle (no confirm field needed)
 * - Password strength indicator
 * - Full i18n support
 * - Accessible with proper ARIA
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
function PasswordUpdateDialog({ updatePassword }: PasswordUpdateDialogProps) {
  const { t } = useTranslation('profile');
  const [showDialog, setShowDialog] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    reset,
  } = useForm<PasswordUpdateFormData>({
    mode: 'onChange',
    defaultValues: { password: '' },
  });

  const passwordValue = useWatch({ control, name: 'password' });

  const onSubmit = async (data: PasswordUpdateFormData) => {
    try {
      await updatePassword(data.password);
      setShowDialog(false);
      reset();
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      setError('root', {
        message:
          message ||
          t(
            'profile.security.password.dialog.error',
            'Failed to update password'
          ),
      });
    }
  };

  const handleOpenChange = (open: boolean) => {
    setShowDialog(open);
    if (!open) reset();
  };

  return (
    <Dialog
      open={showDialog}
      onOpenChange={handleOpenChange}
      trigger={
        <Button variant={BUTTON_VARIANT.OUTLINE}>
          {t('profile.security.password.change', 'Change Password')}
        </Button>
      }
      title={t('profile.security.password.dialog.title', 'Change Password')}
      description={t(
        'profile.security.password.dialog.description',
        'Enter your new password below'
      )}
      footer={
        <>
          <Button
            variant={BUTTON_VARIANT.OUTLINE}
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('profile.security.password.dialog.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting || !passwordValue}
          >
            {isSubmitting
              ? t('profile.security.password.dialog.updating', 'Updating...')
              : t('profile.security.password.dialog.update', 'Update Password')}
          </Button>
        </>
      }
    >
      <Stack>
        {errors.root && (
          <Alert
            variant={ALERT_VARIANT.ERROR}
            description={errors.root.message}
          />
        )}

        <Controller
          name="password"
          control={control}
          rules={{
            required: t(
              'profile.security.password.dialog.required',
              'Password is required'
            ),
            minLength: {
              value: 8,
              message: t(
                'profile.security.password.dialog.minLength',
                'Password must be at least 8 characters'
              ),
            },
          }}
          render={({ field }) => (
            <Stack gap="tight">
              <PasswordInput
                {...field}
                label={t(
                  'profile.security.password.dialog.newPassword',
                  'New Password'
                )}
                placeholder={t(
                  'profile.security.password.dialog.placeholder',
                  'Enter new password'
                )}
                disabled={isSubmitting}
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? 'password-update-error' : undefined
                }
                className="dndev-w-full"
                data-variant={errors.password ? 'destructive' : undefined}
              />
              {errors.password && (
                <Text
                  as="span"
                  level="caption"
                  variant="destructive"
                  id="password-update-error"
                  role="alert"
                >
                  {errors.password.message}
                </Text>
              )}
            </Stack>
          )}
        />

        <PasswordStrengthIndicator
          password={passwordValue || ''}
          minLength={8}
        />
      </Stack>
    </Dialog>
  );
}

export default PasswordUpdateDialog;

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
  FieldMessage,
  fieldMessageAria,
  PasswordInput,
  Stack,
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
  const { t } = useTranslation('auth');
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError('root', {
        message: message || t('passwordUpdate.error'),
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
          {t('passwordUpdate.change')}
        </Button>
      }
      title={t('passwordUpdate.title')}
      description={t('resetPassword.enter_new')}
      footer={
        <>
          <Button
            variant={BUTTON_VARIANT.OUTLINE}
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting || !passwordValue}
          >
            {isSubmitting
              ? t('passwordUpdate.updating')
              : t('passwordUpdate.update')}
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
            required: t('passwordRequired'),
            minLength: {
              value: 8,
              message: t('passwordMinLength', { count: 8 }),
            },
          }}
          render={({ field }) => (
            <Stack gap="tight">
              <PasswordInput
                {...field}
                label={t('resetPassword.new_password')}
                placeholder={t('passwordUpdate.placeholder')}
                disabled={isSubmitting}
                {...fieldMessageAria({
                  id: 'password-update-error',
                  error: errors.password?.message,
                })}
                className="dndev-w-full"
                data-variant={errors.password ? 'destructive' : undefined}
              />
              <FieldMessage
                id="password-update-error"
                error={errors.password?.message}
              />
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

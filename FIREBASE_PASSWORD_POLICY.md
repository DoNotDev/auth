# Firebase Password Policy Configuration

## Overview

Firebase Authentication allows you to configure password policies to enforce stronger security requirements. By default, Firebase only requires a minimum of 6 characters, which is insufficient for production applications.

## Recommended Password Policy

For production applications, configure the following password requirements:

- **Minimum Length:** 10 characters (recommended) or 8 characters (minimum)
- **Maximum Length:** 128 characters (Firebase default)
- **Character Requirements:**
  - At least one uppercase letter (A-Z)
  - At least one lowercase letter (a-z)
  - At least one number (0-9)
  - At least one special character (!@#$%^&*)

## Configuration Steps

### 1. Enable Password Policy in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Authentication** → **Settings** → **Password policy**
4. Click **Edit** to configure password requirements

### 2. Set Password Policy Enforcement Mode

Choose one of two enforcement modes:

- **Require:** Users must meet all password requirements before account creation
- **Notify:** Users are informed of unmet requirements but can proceed (prompted to update later)

**Recommendation:** Use **Require** mode for production applications.

### 3. Configure Password Requirements

Set the following in Firebase Console:

```
Minimum password length: 10
Maximum password length: 128 (default)
Require uppercase letters: Yes
Require lowercase letters: Yes
Require numbers: Yes
Require special characters: Yes
```

### 4. Update Client-Side Validation

The `EmailPasswordForm` component already validates:
- Minimum length (8 characters for client-side, should match Firebase policy)
- Uppercase, lowercase, numbers (for signup)

**Note:** Client-side validation provides immediate feedback, but Firebase policy is the source of truth. If passwords don't meet Firebase requirements, account creation will fail server-side.

## Email Enumeration Protection

Firebase also provides email enumeration protection to prevent attackers from discovering registered email addresses through error messages.

### Enable Email Enumeration Protection

1. Go to Firebase Console → **Authentication** → **Settings**
2. Enable **Email enumeration protection**
3. This modifies Firebase error messages to be generic (e.g., "Invalid email or password" instead of "User not found")

**Note:** Our framework already handles this in `FirebaseSmartRecovery.ts` with generic error messages.

## Testing

After configuring password policy:

1. Test account creation with weak passwords (should fail)
2. Test account creation with strong passwords (should succeed)
3. Verify error messages are user-friendly
4. Test password reset flow

## References

- [Firebase Password Auth Documentation](https://firebase.google.com/docs/auth/web/password-auth)
- [Firebase Password Policy Settings](https://firebase.google.com/docs/auth/admin/password-policy)

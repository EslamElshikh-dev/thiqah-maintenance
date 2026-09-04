# Mobile shell gate

Do not build store binaries until the API production gates pass.

Planned Capacitor integrations:

- Push Notifications for order status changes.
- Camera/Photo Picker for issue and before/after images.
- Geolocation only while choosing an order location; no background tracking in v1.
- Secure Storage/Keychain/Keystore for mobile session tokens.
- Deep Links for password reset, quote approval and order detail.
- Network status and offline-safe read-only order cache.
- Biometric unlock is optional convenience around locally stored session access; server auth remains authoritative.

The app must not embed admin functionality. Admin remains a separately secured web surface with MFA.

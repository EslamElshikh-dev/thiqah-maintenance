# Android / iOS Release Gate

## Packaging decision

Use Capacitor for v1 after the backend passes Production gates. Do not rewrite the product in Flutter/React Native solely to reach the stores.

## Native value to add

- Push notifications for order/status/quote updates
- Native camera/photo picker
- Geolocation permission flow + manual-address fallback
- Deep links to order/quote screens
- Secure keychain/keystore for refresh credentials
- Optional biometric re-unlock for existing secure session
- Native share/call/maps handoff where appropriate

This makes the app materially more app-like than a simple wrapped website.

## Android

As of 2026-09-04, Google Play requires new apps/updates submitted after 2026-08-31 to target Android 16 / API level 36 or higher (subject to Google's listed platform exceptions).

Release checklist:
- [ ] targetSdk 36+
- [ ] AAB production signing configured
- [ ] Data Safety form matches actual SDK/data flows
- [ ] account deletion URL is live
- [ ] in-app account deletion works end-to-end
- [ ] permissions are just-in-time and minimal
- [ ] no secrets in web assets/native config
- [ ] universal/app links verified
- [ ] push token lifecycle handled

## iOS

Apple's current App Review Guidelines require apps to offer more than a repackaged website, and account-creating apps must offer account deletion in-app.

Release checklist:
- [ ] real native integrations listed above
- [ ] App Privacy labels match actual data handling
- [ ] account deletion end-to-end verified
- [ ] location has manual fallback
- [ ] camera/photos permissions have clear purpose strings
- [ ] Universal Links configured
- [ ] Keychain used for mobile refresh credentials
- [ ] physical maintenance service payments use normal payment methods rather than digital-content IAP

## Do not package until

- durable DB/storage migration complete
- admin MFA + verified customer identity complete
- all P0/P1 security tests pass
- production domain/API stable
- legal/support identity complete
- quote/payment/warranty flows are defined and testable

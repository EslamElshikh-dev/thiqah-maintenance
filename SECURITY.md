# Security policy

Do not commit secrets, OTPs, session tokens, password reset tokens, customer PII, production database exports, service-account keys or signed media URLs.

Production changes affecting authentication, authorization, payments, account deletion, media access or database migrations require review before merge.

Security incidents should preserve relevant audit/event identifiers while avoiding copying raw PII into GitHub issues or chat systems.

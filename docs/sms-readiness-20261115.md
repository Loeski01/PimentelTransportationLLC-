# SMS readiness — 2026-11-15

## Verified
- PR #16 prepares optional administrator-only SMS to +1 617-785-5657, disabled by default.
- Local checks: 30 booking/payment tests and 49 dispatch tests passed. No real provider requests were made by these tests.
- GitHub workflow 43688494882 completed successfully for commit 0e92f289d0161b88f11c9e495e41314286503eb4.
- Brevo account displayed 100 SMS credits. SMS logs for November 8–15 were empty.
- Brevo US sender request TFN_PENDING_8 is a draft. Submit is disabled. Business registration type/number, website policy/terms, SMS use case and consent evidence remain incomplete. Contact email shows an explicit public-email-provider validation error.
- Email sender is verified. Brevo email logs show delivered request/admin/acceptance notices for a test booking, which the owner identified as test-only.
- Render inventory still lists a database named pimentel_dispatch_dev and a restore-test database. These labels do not establish production isolation; the actual service-to-database mapping and backups require verification.

## Deferred by owner
Domain purchase/account creation and business mailbox setup are deferred until the owner is available. Porkbun search displayed pimenteltransportation.com available at USD 11.81 for one year and current renewal USD 11.81. No domain was purchased or reserved; login blocked adding it to cart.

## Activation requirements
1. Complete legitimate business mailbox and sender registration details; do not invent identifiers, consent evidence or policy URLs.
2. Obtain Brevo approval for a US sender and verify the sender value for API use.
3. Check production configuration without exposing secrets. Keep SMS disabled pending readiness.
4. Review abuse/duplicate submission protections before enabling a billable notification on the public booking endpoint. The current module does not provide persistent cross-request SMS deduplication.
5. Review and deploy only after production readiness checks; main auto-deploys on Render.
6. A real delivery test consumes credits and remains outside the existing no-paid-test constraint. A provider submission acknowledgement is not proof of delivery.

No production deployment, migrations, data deletion, live SMS or purchases were performed in this work. Draft PR remains unmerged.

# Mamnoon production-readiness audit
Date: 2026-11-09
Repository: ali8102000/mumnun
Audit branch: mamnoon-production-hardening-2026-11-09
Base: main

## Work performed
- Created backup branch: mamnoon-backup-main-2026-11-09
- Created isolated audit/fix branch: mamnoon-production-hardening-2026-11-09
- Removed hard-coded Supabase URL, Supabase anonymous key, and Google Maps key from mobile/app.json.
- Changed mobile/src/lib/config.ts to read the Supabase URL and Google Maps key from Expo public environment variables.
- Added mobile/.env.example with variable names only.
- No database migrations, live Supabase project settings, main-branch files, or user data were changed.

## Confirmed blockers and risks

### P0/P1: credential exposure
The previous mobile/app.json contained a Google Maps API key and a Supabase anon/publishable key in source control. The Supabase anon key is designed for client use but must be protected by RLS; the Google Maps key must be restricted by Android package/SHA-1 and enabled APIs. Treat the exposed Google Maps key as compromised and rotate/restrict it in Google Cloud. Do not put a Supabase service-role key in the app.

### P1: mobile app source is incomplete
The tracked mobile tree contains imports/references that are not present in the repository tree:
- mobile/App.tsx imports ./src/theme/fonts, but that module is absent.
- mobile/src/lib/auth.tsx imports ./supabase and ./types, but those modules are absent at the referenced paths.
- mobile/app.json references assets/adaptive-icon-bg.png and assets/splash.png, while the mobile/assets directory is absent.
- mobile/app.json references ./google-services.json, which is absent.
- Navigation/screens import paths require a full dependency/import audit before a build can be trusted.

These are static repository findings; no local Metro/TypeScript/Gradle build was executed in this audit.

### P1: project configuration mismatch
The mobile app configuration has embedded Supabase URL/key values that identify a different Supabase project than supabase/config.toml (project_id = zvfdymcalzqhvwnipuup). The correct production project must be confirmed by the owner before configuring EAS secrets or changing backend connections. No Supabase project setting was changed.

### P1: dispatch offer expiry
src/lib/dispatch.functions.ts creates offers with a seven-day expiry despite the mobile config declaring a 45-second offer expiry. The server/database should be the authority and must use an atomic accept/expire flow. This needs database function and integration-test review before changing it.

### P1: backend secrets and CORS
supabase/functions/auth-proxy/index.ts and subscription-cron/index.ts use service-role credentials server-side, which is the correct location, but the auth-proxy defaults Access-Control-Allow-Origin to '*'. Restrict production origins and review endpoint rate limits, authentication, phone lookup abuse, and service-role RPC permissions. Do not expose service-role credentials to clients.

### P2: fare estimates
src/lib/taxi-fares.ts estimates road distance using a fixed multiplier (1.35). It is an estimate, not a verified route distance. Production fares should use trusted route distance/duration and server-side pricing rules; never trust client-submitted totals.

### P2: testing and release
Root package scripts expose lint, build, and Playwright E2E, but no evidence was gathered here that they pass. The repository does not provide a verified successful Android AAB build in this audit. EAS project ID, Google services file, push credentials, signing, privacy policy, store listing, and live service credentials remain to be confirmed.

## Not verified
- Current production RLS coverage across every table.
- Actual database function definitions and race-condition behavior.
- Real-time tracking under background restrictions and weak connectivity.
- Push notification delivery on physical Android devices.
- Full taxi and home-service flows against a production-like backend.
- Load/abuse testing, billing controls, disaster recovery, and restore drills.
- Web lint/build/E2E and Android EAS AAB build.

## Required next steps
1. Confirm the authoritative Supabase project ID and rotate/restrict the exposed Google Maps key.
2. Restore or implement the missing mobile modules/assets and verify imports.
3. Configure EAS environment variables and required private credentials outside Git.
4. Review all RLS policies and RPC grants against role-based test accounts.
5. Make dispatch/accept/expire transactional and add concurrency tests.
6. Run web lint/build/E2E and EAS Android production build; record actual logs.
7. Complete privacy, terms, operational coverage, support, and recovery checks before public launch.

## Release decision
NOT READY FOR PRODUCTION. No 10/10 claim is made. This audit branch contains limited, reversible configuration hardening only; the full commercial-readiness scope requires source completion, backend verification, credentials, physical-device tests, and successful CI/EAS builds.

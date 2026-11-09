# Mamnoon production-readiness audit
Date: 2026-11-09
Repository: ali8102000/mumnun
Development branch: mamnoon-production-hardening-2026-11-09
Backup branch: mamnoon-backup-main-2026-11-09
Base branch: main (unchanged)

## Confirmed project structure
- The repository contains a web application at the root (React, TypeScript, TanStack Start).
- The native Expo Router application is in expo-app/ and has route screens and image assets.
- mobile/ is a separate, incomplete/older native experiment and must not be mistaken for the primary Expo app.
- Supabase project_id in supabase/config.toml and the previous Expo client URL both identify zvfdymcalzqhvwnipuup. The earlier concern about a project mismatch came from comparing the partial mobile/ experiment; it is not evidence of a mismatch in expo-app/.

## Changes committed to this branch
- Removed hard-coded Google Maps key and Supabase client values from expo-app/app.json.
- Added expo-app/app.config.ts to inject Google Maps and Supabase public client configuration from build environment variables.
- Updated expo-app/src/lib/supabase.ts to require EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY; no service-role key is accepted by the client.
- Added expo-app/.env.example.
- Removed hard-coded Google Maps key from mobile/app.json and moved mobile config reads to environment variables; added mobile/.env.example.
- Added GitHub Actions workflow .github/workflows/ci.yml for web lint/typecheck/build and Expo config/typecheck.
- Added migration 20261109000100 to remove permissive authenticated write policies for notifications, chats, request offers, driver wallets, and transactions. Server service_role and owner-controlled SECURITY DEFINER operations remain the intended write paths.
- Added migration 20261109000101 to prevent users from directly self-assigning, updating, or deleting provider/admin roles. Direct self-assignment is limited to the customer role; driver/worker roles use grant_provider_role_safe after provider profile creation. Anonymous execution of has_role is revoked.
- Updated Expo role selection so driver/worker roles go through onboarding instead of being written directly to user_roles.
- Updated Expo provider availability to use the actual database column available and reload its value from the database.
- Updated web dispatch/retry to use the authenticated dispatch_request database function instead of privileged direct inserts with a seven-day expiry.
- Updated web ride start/completion/cancellation to use the guarded transition_service_request RPC.
- Added migration 20261109000102 to dispatch in expanding radii of 2, 5, then 10 km, creating 45-second offers under a locked request row.

## Critical remaining blockers

### P0: exposed Google Maps credential
The Google Maps API key was previously committed in the repository. It has been removed from the edited source files, but it must be rotated/restricted in Google Cloud because removal from current source does not invalidate historical Git objects or prior builds. Restrict the replacement key by Android package name and signing SHA-1 and only the required Maps APIs. Set it as EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in the EAS environment.

### P1: Supabase migrations are not deployed
The three new SQL migrations are committed but have NOT been applied to the live Supabase project. They must be reviewed and applied to the intended project before relying on these security changes. A repository commit is not proof of a live database change.

### P1: Expo taxi request lacks coordinates and map workflow
expo-app/app/request/new.tsx currently collects pickup/destination as text. It does not populate pickup_lat/pickup_lng or destination coordinates. The dispatch database function rejects a taxi request without pickup coordinates. The form also imports fare helpers but does not calculate/set the displayed price. The Expo project does not currently include react-native-maps in expo-app/package.json. Therefore GPS/map selection, route distance/ETA, and fare confirmation are not production-ready.

### P1: incomplete dispatch lifecycle
The database dispatch RPC now has progressive radius logic in a new migration, but it is not deployed or integration-tested. There is no verified scheduler/worker in this audit that retries after offer expiry, sends push notifications, or guarantees provider location freshness. The current offer creation alone does not prove a complete dispatch loop.

### P1: role approval and provider verification
Provider roles are now gated through the provider-profile RPC, but the current schema/flow still needs a formal admin verification/approval state before untrusted drivers or workers can receive live jobs. Vehicle/identity document review and audit workflow are not verified.

### P1: auth-proxy CORS and abuse protection
supabase/functions/auth-proxy/index.ts defaults Access-Control-Allow-Origin to '*'. Production origin allowlisting, per-phone/IP rate limits, anti-enumeration controls, and monitoring must be implemented/configured before public launch.

### P1: public app key and service-side controls
Supabase anon/publishable keys are client-visible by design, but every exposed table/RPC must be protected by correct RLS and grants. Do not place SUPABASE_SERVICE_ROLE_KEY in Expo, web client bundles, or any EXPO_PUBLIC variable.

### P2: live location reliability
The older mobile/ tracking hook has background-task cleanup and shared global state concerns; the main expo-app does not yet provide a verified live location tracking implementation in the inspected route set. Real-device foreground/background tracking, permission denial, GPS loss, stale data, and battery use remain untested.

### P2: pricing and finance
The native fare display is not currently calculated. The web fare helper uses approximate straight-line-to-road distance assumptions; production pricing must be server-authoritative and based on a trusted route result. Wallet/commission/refund ledger integrity needs integration tests after the new RLS restrictions.

### P2: Android build and store readiness
No successful EAS Android AAB build was run during this work. EAS project association, EAS environment variables, signing credentials, push credentials, privacy policy, terms, store listing, and release testing remain to be completed.

## CI
A GitHub Actions workflow was added. Its run was queued at the time of the last status check; no successful lint, TypeScript, web build, Expo typecheck, or E2E result is claimed until the run finishes and logs are reviewed.

## Not verified
- Full RLS coverage and grants across all tables and views.
- All SECURITY DEFINER functions, search_path, and EXECUTE grants.
- Phone lookup anti-enumeration and auth-proxy rate limiting.
- Real user registration/login/password recovery against the intended Supabase project.
- Taxi acceptance race conditions under concurrent driver sessions.
- Home-service offer/accept/complete lifecycle.
- Realtime chat and push delivery on physical devices.
- GPS and route services in Iraq.
- Load tests, cost limits, backup restoration, and incident response.
- Successful web E2E and Android EAS AAB build.

## Release decision
NOT READY FOR PRODUCTION. No 10/10 rating is claimed. The changes are isolated to the development branch; main remains unchanged. The database migrations require review and deployment, and the GPS/map/dispatch workflow, verification, notifications, pricing, real-device tests, CI logs, and EAS build are still release blockers.

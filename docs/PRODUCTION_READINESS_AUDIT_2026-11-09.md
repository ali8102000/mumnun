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
- Added migration 20261109000103 to restrict live-location writes to active request participants and allow only those participants to read each other's request locations.
- Added migration 20261109000104 to prevent chat sender impersonation and restrict ratings to the other participant on a completed request.
- Added GPS acquisition, map point selection, pickup/destination coordinates, and a clearly labelled rough fare estimate to the Expo new-request screen.
- Added foreground live-location publishing and a participant-only live map to active Expo taxi requests.
- Corrected Expo service slugs to match the actual Supabase services catalog and exposed all seeded service categories on the native home screen.
- Corrected Expo request-detail chat reads/writes to use chats.id and messages.chat_id/content, and switched start/complete/cancel to the guarded transition RPC.
- Added a safe provider-role grant RPC that requires the caller's driver/worker profile.
- Added admin-controlled provider verification states (pending/approved/suspended/rejected), blocks unverified providers from setting available=true, and connected the existing admin provider console to show verification state.
- Removed direct client update paths for service_requests and request_offers; customers can directly create only home-service requests, while taxi creation now runs server-side with trusted route-based fare calculation.
- Added `create-taxi-request` Edge Function for authenticated Expo taxi creation with server-computed route distance, duration and fare; the native client no longer supplies taxi fare/distance to the database.
- Added a separate provider_locations presence table for discoverable online drivers/workers, with authenticated writes and self-row-only reads, 90-second freshness checks, anti-spoof speed checks, and nearby driver/pin RPCs reading only verified available provider presence. Nearby map pins are rounded to 2 decimal places, use per-query IDs, and are restricted to authenticated customers.
- Restricted home-service request visibility and acceptance to verified, available workers with fresh provider presence within 10 km; the acceptance RPC rechecks eligibility atomically.
- Added foreground GPS presence publishing while a verified provider is online in both Expo and web home screens.

## Critical remaining blockers

### P0: exposed Google Maps credential
The Google Maps API key was previously committed in the repository. It has been removed from the edited source files, but it must be rotated/restricted in Google Cloud because removal from current source does not invalidate historical Git objects or prior builds. Restrict the replacement key by Android package name and signing SHA-1 and only the required Maps APIs. Set it as EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in the EAS environment.

### P1: Supabase migrations are not deployed
The ten new SQL migrations (00100 through 00109) are committed but have NOT been applied to the live Supabase project. They must be reviewed and applied to the intended project before relying on these security changes. A repository commit is not proof of a live database change.

### P1: Expo route pricing and map verification
The Expo request screen now uses expo-location and react-native-maps to collect pickup and destination coordinates and passes them to service_requests, fixing the missing-pickup-coordinate dispatch blocker. The displayed fare is explicitly a rough straight-line-derived estimate only. No trusted road-route distance/duration calculation or server-authoritative final fare has been integrated into the native flow. Google Maps key rotation/configuration and real-device map validation remain required.

### P1: incomplete dispatch lifecycle
The database taxi dispatch RPC now has progressive radius logic and reads fresh verified provider presence. Home-service requests are filtered to verified available workers within 10 km and acceptance is rechecked atomically. These migrations are not deployed or integration-tested. There is no verified scheduler/worker in this audit that retries after offer expiry or sends push notifications. The current matching logic alone does not prove a complete dispatch loop.

### P1: role approval and provider verification
Provider roles are gated through the provider-profile RPC and the database now requires an admin-approved verification state before a driver/worker can become available. The existing admin provider console exposes approve/suspend/reject actions. However, actual identity-document capture/storage, manual review evidence, audit trail validation, and production testing of this workflow are not complete. These changes depend on migrations 00105/00106 being deployed.

### P1: auth-proxy CORS and abuse protection
The wildcard CORS default was removed from supabase/functions/auth-proxy/index.ts. Production must set the exact ALLOWED_ORIGIN value for the real web origin; without it, browsers will block cross-origin access. Per-phone/IP rate limits, anti-enumeration controls, and monitoring still need implementation.

### P1: public app key and service-side controls
Supabase anon/publishable keys are client-visible by design, but every exposed table/RPC must be protected by correct RLS and grants. Do not place SUPABASE_SERVICE_ROLE_KEY in Expo, web client bundles, or any EXPO_PUBLIC variable.

### P1: live location reliability
The Expo home screen now publishes foreground provider presence while a verified driver/worker is available, and the request-detail screen publishes request-scoped foreground locations and displays the other participant. The web provider home screen also publishes foreground provider presence. Background tracking is not implemented in the main Expo app. Real-device foreground/background tracking, permission denial, GPS loss, stale data, network interruption, and battery use remain untested. The new provider-presence and request-location RLS migrations must be deployed before these sharing flows can work. The web nearby-pin server function now uses the authenticated Supabase session instead of the service-role client.

### P2: pricing and finance
The native fare display is only a rough estimate derived from straight-line distance; the web preview may also fall back to an approximate multiplier when routing credentials are unavailable. Taxi request creation on the web now recomputes road distance, duration and fare on the server through the trusted Google Routes gateway. Expo taxi creation now uses the `create-taxi-request` Edge Function, which validates the user, computes route/fare with a server-only Google Routes key, and inserts through service_role. Both flows require their respective server-side route credentials. Wallet/commission/refund ledger integrity needs integration tests after the new RLS restrictions.

### P2: Android build and store readiness
No successful EAS Android AAB build was run during this work. EAS project association, EAS environment variables, signing credentials, push credentials, privacy policy, terms, store listing, and release testing remain to be completed.

## CI
A GitHub Actions workflow was added. An Expo config, TypeScript, and Android JavaScript bundle export job completed successfully on an earlier commit. Root web TypeScript, production build, and the 3 taxi fare unit tests passed in CI. Expo config, TypeScript, and Android JavaScript export also passed in the latest completed run (commit 0e1af536). Root lint still fails: the last completed run reported 412 errors and 40 warnings, mostly existing explicit-any violations; these remain unresolved. A focused ESLint check for the hardened web provider home, dispatch functions and nearby-provider hook passed. Newer commits are triggering another CI run. E2E was not run.

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

## Problem

Every route renders the error boundary with the message:

> useAuth must be used within AuthProvider

`AuthProvider` exists in `src/lib/auth-context.tsx` but it is never mounted. `src/routes/__root.tsx`'s `RootComponent` only wraps the app in `QueryClientProvider` + `<Outlet />`, so `useAuth()` (used by `/`, `/auth`, `/home`, `/select-role`, `/profile`, `/history`, `/messages`, `/request/...`, onboarding pages, etc.) throws on every render.

## Fix

1. In `src/routes/__root.tsx`:
   - Import `AuthProvider` from `@/lib/auth-context`.
   - Wrap `<Outlet />` with `<AuthProvider>` inside `QueryClientProvider`.

2. Also add the `Toaster` from `sonner` once at the root so the `toast.*` calls used across the app actually render (currently no `<Toaster />` is mounted anywhere).

That's it — no DB, no route, no auth-logic changes. The recently shipped security migration stays as is.

## Verification

- Reload the preview at `/` — instead of the error boundary, the index route should render (it redirects to `/auth` or `/home` based on session).
- No more `useAuth must be used within AuthProvider` in the console.
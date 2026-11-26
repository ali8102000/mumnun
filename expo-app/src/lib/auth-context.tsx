import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type AppRole = 'customer' | 'driver' | 'worker';

export interface Profile {
  id: string;
  phone: string;
  full_name: string;
  avatar_url: string | null;
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  authError: string | null;
  mustChangePassword: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const requestId = useRef(0);
  const activeUserId = useRef<string | null>(null);
  const mustChangePassword = session?.user?.app_metadata?.must_change_password === true;

  async function loadProfile(uid: string) {
    const [profileResult, rolesResult] = await Promise.all([
      supabase.from('profiles').select('id, phone, full_name, avatar_url').eq('id', uid).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', uid),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (rolesResult.error) throw rolesResult.error;

    const validRoles = (rolesResult.data ?? [])
      .map((row) => row.role)
      .filter((role): role is AppRole => role === 'customer' || role === 'driver' || role === 'worker');

    setProfile(profileResult.data ?? null);
    setRoles(validRoles);
  }

  async function applySession(nextSession: Session | null) {
    const currentRequest = ++requestId.current;
    setSession(nextSession);
    activeUserId.current = nextSession?.user?.id ?? null;

    if (!nextSession?.user) {
      setProfile(null);
      setRoles([]);
      setAuthError(null);
      setLoading(false);
      return;
    }

    if (activeUserId.current !== nextSession.user.id) {
      setProfile(null);
      setRoles([]);
    }
    setAuthError(null);
    setLoading(true);
    try {
      await loadProfile(nextSession.user.id);
    } catch (error) {
      console.warn('Unable to load account profile and roles', error);
      if (requestId.current === currentRequest) {
        setProfile(null);
        setRoles([]);
        setAuthError(error instanceof Error ? error.message : 'تعذّر تحميل بيانات الحساب. تحقق من الإنترنت ثم أعد المحاولة.');
      }
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      await applySession(data.session);
    } catch (error) {
      console.warn('Unable to refresh authentication session', error);
      setAuthError(error instanceof Error ? error.message : 'تعذّر تحديث الجلسة. تحقق من الإنترنت ثم أعد المحاولة.');
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      // Token refreshes do not require another profile/role query. This avoids
      // repeatedly interrupting navigation while Supabase renews the session.
      if (
        event === 'TOKEN_REFRESHED' &&
        nextSession?.user?.id &&
        nextSession.user.id === activeUserId.current
      ) {
        setSession(nextSession);
        return;
      }

      // Defer Supabase queries until after its auth callback has returned.
      void Promise.resolve().then(() => {
        if (mounted) void applySession(nextSession);
      });
    });

    return () => {
      mounted = false;
      requestId.current += 1;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, profile, roles, loading, authError, mustChangePassword, refresh, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { AuthState, Profile } from "@/features/auth/types";
import { clearUserOutbox, isOfflineOrNetworkError } from "@/features/messages/lib/outbox";
import { clearDevicePushSubscription } from "@/pwa/usePushSubscription";
import {
  AuthError,
  authApi,
  getAccessToken,
  getSessionSnapshot,
  logoutSession,
  refreshSession,
  SESSION_EXPIRED,
  settleBeforeSignOut,
  subscribeSession,
} from "./auth";
import { getDeviceName, getOrCreateDeviceFingerprint } from "./devices";
import {
  clearOfflineSessionHint,
  readOfflineSessionHint,
  writeOfflineSessionHint,
} from "./message-cache";
import { clearAllUserData } from "./offline-db";
import { unsubscribeFromPush } from "./push";
import { supabase } from "./supabase";

const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider missing");
  return auth;
}
export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setExpired] = useState(false);
  const [offlineHydrated, setOfflineHydrated] = useState(false);
  const sequence = useRef(0);
  const refreshUser = useCallback(async () => {
    await refreshSession();
  }, []);
  useEffect(() => {
    let active = true;
    void refreshSession().catch(async (error: unknown) => {
      if (error instanceof AuthError && error.status === 401) {
        await clearOfflineSessionHint();
      } else if (isOfflineOrNetworkError(error)) {
        const hint = await readOfflineSessionHint();
        if (active && hint) {
          setUser({
            id: hint.user.id,
            email: hint.user.email ?? undefined,
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: {},
            created_at: hint.updated_at,
          } as User);
          setProfile(hint.profile);
          setOfflineHydrated(true);
          setError(null);
          setLoading(false);
          return;
        }
        if (active) setError("We couldn’t reconnect. Check your connection and try again.");
      } else if (active) {
        setError("We couldn’t reconnect. Check your connection and try again.");
      }
      if (active) setLoading(false);
    });
    const expired = () => {
      setExpired(true);
      setOfflineHydrated(false);
      void clearOfflineSessionHint();
      queryClient.clear();
    };
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => {
      active = false;
      window.removeEventListener(SESSION_EXPIRED, expired);
    };
  }, [queryClient]);
  useEffect(() => {
    if (!offlineHydrated) return;
    const reconnect = () => {
      void refreshSession().catch(async (error: unknown) => {
        if (error instanceof AuthError && error.status === 401) {
          setOfflineHydrated(false);
          setUser(null);
          setProfile(null);
          await clearOfflineSessionHint();
        }
      });
    };
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [offlineHydrated]);
  useEffect(() => {
    const version = ++sequence.current;
    if (!session) {
      if (!offlineHydrated) {
        setUser(null);
        setProfile(null);
      }
      return;
    }
    setOfflineHydrated(false);
    setError(null);
    void (async () => {
      try {
        const result = await supabase.auth.getUser(session.accessToken);
        if (result.error || !result.data.user) throw new Error("user_unavailable");
        let nextProfile: Profile | null = null;
        if (!session.mfaRequired) {
          const result = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();
          if (result.error) throw new Error("profile_unavailable");
          nextProfile = result.data;
        }
        if (version !== sequence.current) return;
        setUser(result.data.user);
        setProfile(nextProfile);
        setExpired(false);
        supabase.realtime.setAuth(session.accessToken);
        if (!session.mfaRequired && nextProfile) {
          void writeOfflineSessionHint(
            { id: result.data.user.id, email: result.data.user.email ?? null },
            nextProfile,
          );
        }
      } catch {
        if (version === sequence.current) setError("We couldn’t load your account. Try again.");
      } finally {
        if (version === sequence.current) setLoading(false);
      }
    })();
  }, [session, offlineHydrated]);
  useEffect(() => {
    if (!session) return;
    const delay = Math.max(
      1_000,
      Math.min(50 * 60_000, session.expiresAt * 1000 - Date.now() - 60_000),
    );
    const timer = window.setTimeout(() => {
      void refreshSession().catch(() => undefined);
    }, delay);
    const resume = () => {
      if (document.visibilityState === "visible" && session.expiresAt * 1000 < Date.now() + 60_000)
        void refreshSession().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [session]);
  const id = user?.id;
  const mfaRequired = session?.mfaRequired ?? false;
  useEffect(() => {
    if (!id || mfaRequired) return;
    const fingerprint = getOrCreateDeviceFingerprint();
    const update = async () => {
      if (document.visibilityState !== "visible" || !getAccessToken()) return;
      const now = new Date().toISOString();
      const results = await Promise.all([
        supabase.from("profiles").update({ last_seen_at: now }).eq("id", id),
        supabase
          .from("devices")
          .update({ last_active_at: now })
          .eq("user_id", id)
          .eq("device_fingerprint", fingerprint ?? ""),
      ]);
      if (results.some((r) => r.error)) console.error("Presence update failed");
    };
    void update();
    const timer = window.setInterval(() => {
      void update();
    }, 90_000);
    return () => clearInterval(timer);
  }, [id, mfaRequired]);
  const signOut = async (all = false) => {
    const signingOutUserId = user?.id;
    await settleBeforeSignOut();
    await queryClient.cancelQueries();
    if (signingOutUserId) {
      try {
        await clearDevicePushSubscription(signingOutUserId);
      } catch {
        /* Best-effort push cleanup before token revocation; never block offline logout. */
      }
      try {
        await unsubscribeFromPush();
      } catch {
        /* Optional browser PushManager cleanup. */
      }
      await clearAllUserData(signingOutUserId);
      clearUserOutbox(signingOutUserId);
    }
    setOfflineHydrated(false);
    try {
      await logoutSession(all);
    } finally {
      if (signingOutUserId) {
        await clearAllUserData(signingOutUserId);
        clearUserOutbox(signingOutUserId);
      }
      await clearOfflineSessionHint();
      setUser(null);
      setProfile(null);
      queryClient.clear();
      await supabase.removeAllChannels();
    }
  };
  const completeMfa = async (code: string) => {
    if (!session?.factorId) throw new Error("Missing factor");
    const result = await refreshSession({ totp_code: code, factor_id: session.factorId });
    if (result.aal !== "aal2") throw new Error("MFA upgrade failed");
  };
  const completeMfaWithBackupCode = async (code: string) => {
    const result = await authApi<{ success: boolean }>("backup-code-verify", {
      code,
      mfaChallengeId: session?.mfaChallengeId,
    });
    if (!result.success) throw new Error("Invalid backup code");
    await refreshSession();
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        error,
        mfaRequired,
        mfaChallengeId: session?.mfaChallengeId ?? null,
        factorId: session?.factorId ?? null,
        sessionExpired,
        refreshUser,
        signOut,
        completeMfa,
        completeMfaWithBackupCode,
        signIn: async (email, mode, redirect, turnstileToken) => {
          await authApi("signin", {
            email,
            mode,
            redirect,
            turnstileToken,
            device_fingerprint: getOrCreateDeviceFingerprint(),
            device_name: getDeviceName(),
          });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

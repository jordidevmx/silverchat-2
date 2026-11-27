import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { UpdateAvailableBanner } from "@/components/pwa/UpdateAvailableBanner";
import { InfrastructureNotice } from "@/components/ui/auth-surfaces";
import { Button } from "@/components/ui/button";
import { AppSkeleton, AuthFrame } from "@/features/auth/components";
import { useAuthText } from "@/features/auth/i18n";
import { useOutboxSync } from "@/features/messages/hooks/useOutboxSync";
import { PreferencesProvider } from "@/features/settings/preferences-provider";
import { AuthProvider, useAuth } from "@/lib/auth-provider";
import { ClipboardPasteProvider } from "@/lib/clipboard-paste";
import { isServerError, useSupabaseHealth } from "@/lib/supabase-health";
import { useOnlineStatus } from "@/pwa/useOnlineStatus";
import { ConnectionBanner } from "./connection-banner";
import { ChatBackgroundProvider } from "./providers/chat-background-provider";
import { I18nProvider, useI18n } from "./providers/i18n-provider";
import { ThemeProvider } from "./providers/theme-provider";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Bounded retries: an outage must not amplify its own load.
      retry: (failureCount, error) => {
        if (isServerError(error)) return failureCount < 2;
        if ((error as { status?: number } | null)?.status === 429) return false;
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (isServerError(error)) useSupabaseHealth.getState().markDown();
    },
  }),
});
function AuthenticatedRouter() {
  const auth = useAuth();
  const authText = useAuthText();
  const { t } = useI18n();
  const online = useOnlineStatus();
  useOutboxSync();
  useEffect(() => {
    if (!auth.error) return;
    const handleOnline = () => window.location.reload();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [auth.error]);
  useEffect(() => {
    if (auth.isLoading || auth.error || (auth.user && !auth.mfaRequired && !auth.profile)) return;
    router.update({ context: { auth } });
    void router.invalidate();
  }, [auth]);
  if (auth.error)
    return (
      <AuthFrame title={online ? authText("Let’s reconnect") : t("You’re offline")}>
        <InfrastructureNotice role="alert">{authText(auth.error)}</InfrastructureNotice>
        <Button type="button" onClick={() => window.location.reload()}>
          {t("Reload")}
        </Button>
      </AuthFrame>
    );
  if (auth.isLoading || (auth.user && !auth.mfaRequired && !auth.profile)) return <AppSkeleton />;
  return <RouterProvider router={router} context={{ auth }} />;
}
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <ClipboardPasteProvider>
            <OfflineBanner />
            <ConnectionBanner />
            <AuthProvider>
              <PreferencesProvider>
                <ChatBackgroundProvider>
                  <AuthenticatedRouter />
                </ChatBackgroundProvider>
              </PreferencesProvider>
            </AuthProvider>
            <UpdateAvailableBanner />
          </ClipboardPasteProvider>
        </I18nProvider>
      </ThemeProvider>
      <TanStackDevtools config={{ hideInAutomation: true, triggerHidden: false }} />
    </QueryClientProvider>
  );
}

import "@/styles/settings.css";

import "@/styles/chats.css";

import { Share, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/app/providers/i18n-provider";
import {
  IOS_INSTALL_DISMISSED_KEY,
  shouldShowIOSInstallInstructions,
  useIsIOS,
} from "@/pwa/useIsIOS";

function readDismissed(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(IOS_INSTALL_DISMISSED_KEY) === "true"
    );
  } catch {
    return false;
  }
}

export function IOSInstallInstructions() {
  const { isIOSSafari, isStandalone } = useIsIOS();
  const [dismissed, setDismissed] = useState(readDismissed);
  const { t } = useI18n();

  if (!shouldShowIOSInstallInstructions({ isIOSSafari, isStandalone, dismissed })) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(IOS_INSTALL_DISMISSED_KEY, "true");
    } catch {
      /* Optional storage. */
    }
  };

  return (
    <div
      role="status"
      className="ios-install-banner sticky top-0 z-40 flex shrink-0 items-center justify-center gap-2 border-b border-border/70 bg-card/95 px-4 py-2 text-xs text-foreground backdrop-blur-md lg:pl-[84px]"
    >
      <Share size={14} aria-hidden="true" className="shrink-0 text-neon" />
      <span>{t("To install SilverChat on iOS: tap Share → Add to Home Screen.")}</span>
      <button
        type="button"
        aria-label={t("Dismiss")}
        onClick={dismiss}
        className="ml-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

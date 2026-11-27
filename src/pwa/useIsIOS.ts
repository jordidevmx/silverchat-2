import { useEffect, useState } from "react";

export const IOS_INSTALL_DISMISSED_KEY = "silverchat_ios_install_dismissed";

export interface IOSPlatformInfo {
  isIOS: boolean;
  isIOSSafari: boolean;
  isStandalone: boolean;
  iosVersion: number | null;
  iosSupportsPush: boolean;
}

type NavigatorLike = Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> & {
  standalone?: boolean;
};

function parseIOSVersion(ua: string): number | null {
  const match = ua.match(/OS (\d+)[._](\d+)/i);
  if (!match) return null;
  const major = Number.parseInt(match[1] ?? "", 10);
  const minor = Number.parseInt(match[2] ?? "0", 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return major + minor / 10;
}

export function detectIOSPlatform(
  nav: NavigatorLike | undefined = typeof navigator !== "undefined"
    ? (navigator as NavigatorLike)
    : undefined,
  standaloneMediaMatch = typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches,
): IOSPlatformInfo {
  if (!nav) {
    return {
      isIOS: false,
      isIOSSafari: false,
      isStandalone: false,
      iosVersion: null,
      iosSupportsPush: false,
    };
  }

  const ua = nav.userAgent ?? "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
  const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const isStandalone = Boolean(standaloneMediaMatch || nav.standalone === true);
  const iosVersion = isIOS ? parseIOSVersion(ua) : null;
  const iosSupportsPush = isIOS && isStandalone && (iosVersion === null || iosVersion >= 16.4);

  return { isIOS, isIOSSafari, isStandalone, iosVersion, iosSupportsPush };
}

export function shouldShowIOSInstallInstructions({
  isIOSSafari,
  isStandalone,
  dismissed,
}: {
  isIOSSafari: boolean;
  isStandalone: boolean;
  dismissed: boolean;
}): boolean {
  return isIOSSafari && !isStandalone && !dismissed;
}

export function useIsIOS(): IOSPlatformInfo {
  const [info, setInfo] = useState<IOSPlatformInfo>(() => detectIOSPlatform());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(display-mode: standalone)");
    const update = () => setInfo(detectIOSPlatform(navigator as NavigatorLike, mq.matches));
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return info;
}

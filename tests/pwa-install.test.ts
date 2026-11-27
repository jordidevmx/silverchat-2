import assert from "node:assert/strict";
import test from "node:test";
import { detectIOSPlatform, shouldShowIOSInstallInstructions } from "../src/pwa/useIsIOS.ts";

test("detectIOSPlatform classifies iOS Safari, iPadOS, non-Safari iOS browsers, standalone, and desktop", () => {
  const iphoneSafari17 = detectIOSPlatform(
    {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    },
    false,
  );
  assert.equal(iphoneSafari17.isIOS, true);
  assert.equal(iphoneSafari17.isIOSSafari, true);
  assert.equal(iphoneSafari17.isStandalone, false);
  assert.equal(iphoneSafari17.iosVersion, 17.4);
  assert.equal(iphoneSafari17.iosSupportsPush, false);

  const iphoneStandalone164 = detectIOSPlatform(
    {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
      standalone: true,
    },
    true,
  );
  assert.equal(iphoneStandalone164.isIOS, true);
  assert.equal(iphoneStandalone164.isStandalone, true);
  assert.equal(iphoneStandalone164.iosSupportsPush, true);

  const iphoneStandalone163 = detectIOSPlatform(
    {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
      standalone: true,
    },
    true,
  );
  assert.equal(iphoneStandalone163.iosSupportsPush, false);

  const ipadOS = detectIOSPlatform(
    {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
    },
    false,
  );
  assert.equal(ipadOS.isIOS, true);
  assert.equal(ipadOS.isIOSSafari, true);

  const iosChrome = detectIOSPlatform(
    {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    },
    false,
  );
  assert.equal(iosChrome.isIOS, true);
  assert.equal(iosChrome.isIOSSafari, false);

  const desktopChrome = detectIOSPlatform(
    {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      platform: "Win32",
      maxTouchPoints: 0,
    },
    false,
  );
  assert.equal(desktopChrome.isIOS, false);
  assert.equal(desktopChrome.isIOSSafari, false);
});

test("shouldShowIOSInstallInstructions renders only for non-standalone iOS Safari before dismissal", () => {
  assert.equal(
    shouldShowIOSInstallInstructions({ isIOSSafari: true, isStandalone: false, dismissed: false }),
    true,
  );
  assert.equal(
    shouldShowIOSInstallInstructions({ isIOSSafari: true, isStandalone: true, dismissed: false }),
    false,
  );
  assert.equal(
    shouldShowIOSInstallInstructions({ isIOSSafari: true, isStandalone: false, dismissed: true }),
    false,
  );
  assert.equal(
    shouldShowIOSInstallInstructions({ isIOSSafari: false, isStandalone: false, dismissed: false }),
    false,
  );
});

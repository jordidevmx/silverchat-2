// Custom push and notification click handlers imported by the Workbox-generated Service Worker.

function sanitizeNotificationUrl(rawUrl) {
  if (typeof rawUrl !== "string") return "/chats";
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return "/chats";
  }
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return "/chats";
  }
  try {
    const parsed = new URL(trimmed, self.location.origin);
    if (parsed.origin !== self.location.origin || !parsed.pathname.startsWith("/")) {
      return "/chats";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/chats";
  }
}

function isSameOriginUrl(url) {
  if (typeof url !== "string") return false;
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const hasVisibleAppWindow = clients.some((client) => {
        if (!isSameOriginUrl(client.url)) return false;
        return client.visibilityState === "visible" || client.focused === true;
      });

      // Suppress system notifications while the app is open and visible; client handles in-app UX.
      if (hasVisibleAppWindow) return;

      const title =
        typeof payload.title === "string" && payload.title.trim() ? payload.title : "SilverChat";
      const options = {
        body: typeof payload.body === "string" ? payload.body : undefined,
        icon:
          typeof payload.icon === "string" && payload.icon
            ? payload.icon
            : "/android-chrome-192x192.png",
        badge:
          typeof payload.badge === "string" && payload.badge
            ? payload.badge
            : "/android-chrome-192x192.png",
        tag: typeof payload.tag === "string" && payload.tag ? payload.tag : undefined,
        data: payload.data && typeof payload.data === "object" ? payload.data : { url: "/chats" },
      };

      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = sanitizeNotificationUrl(event.notification?.data?.url);

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if (isSameOriginUrl(client.url)) {
          if (typeof client.navigate === "function") {
            try {
              await client.navigate(targetUrl);
            } catch {
              /* Navigation may fail on non-navigable clients; focus still surfaces the app. */
            }
          }
          if (typeof client.focus === "function") {
            return client.focus();
          }
        }
      }
      return self.clients.openWindow(targetUrl);
    })(),
  );
});

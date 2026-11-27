export function shouldFlushOnVisibilityChange(
  visibilityState: DocumentVisibilityState | string,
  online: boolean,
): boolean {
  return visibilityState === "visible" && online;
}

export function shouldShowOfflineBanner(online: boolean): boolean {
  return !online;
}

export function shouldShowConnectionBanner({
  online,
  supabaseDown,
}: {
  online: boolean;
  supabaseDown: boolean;
}): boolean {
  return online && supabaseDown;
}

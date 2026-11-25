import { useQueryClient } from "@tanstack/react-query";
import imageCompression from "browser-image-compression";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePreferences } from "@/features/settings/preferences-provider";
import { useAuth } from "@/lib/auth-provider";
import {
  deleteCustomBackground,
  loadCustomBackgroundRecord,
  saveCustomBackground,
} from "@/lib/chat-background-store";
import {
  deleteCustomBackgroundFile,
  fetchCustomBackgroundBlob,
  uploadCustomBackgroundFile,
} from "@/lib/chat-background-upload";
import {
  BACKGROUND_DIM_STEPS,
  BACKGROUND_SELECTIONS,
  BackgroundImageError,
  backgroundDimKey,
  backgroundSelectionKey,
  type ChatBackgroundSelection,
  checkBackgroundImage,
  DEFAULT_BACKGROUND_DIM,
  parseBackgroundDim,
  parseBackgroundSelection,
  reconcileRemoteBackground,
  resolveSelectionAfterCustomRemoval,
  serializeBackgroundSelection,
} from "@/lib/chat-background-validation";
import { readPreference, writePreference } from "@/lib/preferences";

const MAX_COMPRESSED_BYTES = 1024 * 1024;

interface ChatBackgroundValue {
  selection: ChatBackgroundSelection;
  dim: number;
  customUrl?: string;
  customPath: string | null;
  choose: (selection: ChatBackgroundSelection) => void;
  setDim: (value: number) => void;
  upload: (file: File) => Promise<void>;
  removeCustom: () => Promise<void>;
}

const Context = createContext<ChatBackgroundValue | null>(null);

function readOwnerSelection(ownerId: string): ChatBackgroundSelection {
  return parseBackgroundSelection(
    readPreference(backgroundSelectionKey(ownerId), BACKGROUND_SELECTIONS, "default"),
  );
}

function readOwnerDim(ownerId: string): number {
  return parseBackgroundDim(
    readPreference(backgroundDimKey(ownerId), BACKGROUND_DIM_STEPS, DEFAULT_BACKGROUND_DIM),
  );
}

export function ChatBackgroundProvider({ children }: PropsWithChildren) {
  const { user, isLoading: authLoading } = useAuth();
  const preferences = usePreferences();
  const queryClient = useQueryClient();
  const ownerId = user?.id ?? "guest";
  const remoteSettings = preferences.settings;
  const hasRemote = Boolean(user?.id && remoteSettings);

  const [selection, setSelection] = useState<ChatBackgroundSelection>(() =>
    authLoading ? { kind: "default" } : readOwnerSelection(ownerId),
  );
  const [dim, setDimState] = useState(() =>
    authLoading ? Number(DEFAULT_BACKGROUND_DIM) : readOwnerDim(ownerId),
  );
  const [customUrl, setCustomUrl] = useState<string | undefined>(undefined);
  const [customPath, setCustomPath] = useState<string | null>(null);
  const urlRef = useRef<string | undefined>(undefined);
  const ownerIdRef = useRef(ownerId);
  ownerIdRef.current = ownerId;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const customPathRef = useRef<string | null>(customPath);
  customPathRef.current = customPath;
  const customMutationSeqRef = useRef(0);
  const saveRef = useRef(preferences.save);
  saveRef.current = preferences.save;
  const hasRemoteRef = useRef(hasRemote);
  hasRemoteRef.current = hasRemote;

  const clearUrl = useCallback(() => {
    const previous = urlRef.current;
    urlRef.current = undefined;
    setCustomUrl(undefined);
    if (previous) URL.revokeObjectURL(previous);
  }, []);

  const installUrl = useCallback((blob: Blob) => {
    if (typeof URL.createObjectURL !== "function") return;
    const next = URL.createObjectURL(blob);
    const previous = urlRef.current;
    urlRef.current = next;
    setCustomUrl(next);
    if (previous) URL.revokeObjectURL(previous);
  }, []);

  const choose = useCallback(
    (next: ChatBackgroundSelection) => {
      const serialized = serializeBackgroundSelection(next);
      selectionRef.current = next;
      setSelection(next);
      writePreference(backgroundSelectionKey(ownerId), serialized);
      if (hasRemoteRef.current) {
        void saveRef.current({ chat_background: serialized }, true).catch(() => undefined);
      }
    },
    [ownerId],
  );

  // Instant local cache hydration on auth resolution / account switch before remote settings arrive.
  useEffect(() => {
    if (authLoading) return;
    if (hasRemoteRef.current) return;
    let cancelled = false;
    const loadMutationSeq = customMutationSeqRef.current;
    const nextSelection = readOwnerSelection(ownerId);
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setDimState(readOwnerDim(ownerId));
    customPathRef.current = null;
    setCustomPath(null);
    clearUrl();

    void loadCustomBackgroundRecord(ownerId).then((record) => {
      if (cancelled || customMutationSeqRef.current !== loadMutationSeq) return;
      if (!record) return;
      if (record.path) {
        customPathRef.current = record.path;
        setCustomPath(record.path);
      }
      installUrl(record.blob);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, clearUrl, installUrl, ownerId]);

  // Account-owned remote preferences are the source of truth across devices once loaded.
  const remoteBg = remoteSettings?.chat_background ?? null;
  const remoteDim = remoteSettings?.chat_background_dim ?? null;
  const remotePath = remoteSettings?.chat_background_path ?? null;

  useEffect(() => {
    if (authLoading || !user?.id || !remoteSettings) return;
    const reconciled = reconcileRemoteBackground(
      {
        chat_background: remoteBg,
        chat_background_dim: remoteDim,
        chat_background_path: remotePath,
      },
      user.id,
    );
    selectionRef.current = reconciled.selection;
    setSelection(reconciled.selection);
    setDimState(reconciled.dim);
    customPathRef.current = reconciled.customPath;
    setCustomPath(reconciled.customPath);
    writePreference(
      backgroundSelectionKey(user.id),
      serializeBackgroundSelection(reconciled.selection),
    );
    writePreference(backgroundDimKey(user.id), String(reconciled.dim));

    let cancelled = false;
    const loadMutationSeq = customMutationSeqRef.current;

    if (!reconciled.customPath) {
      clearUrl();
      void deleteCustomBackground(user.id);
      return () => {
        cancelled = true;
      };
    }

    const expectedPath = reconciled.customPath;
    void (async () => {
      const cached = await loadCustomBackgroundRecord(user.id);
      if (cancelled || customMutationSeqRef.current !== loadMutationSeq) return;
      if (cached && cached.path === expectedPath) {
        installUrl(cached.blob);
        return;
      }
      try {
        const blob = await fetchCustomBackgroundBlob(expectedPath);
        if (cancelled || customMutationSeqRef.current !== loadMutationSeq) return;
        await saveCustomBackground(user.id, blob, expectedPath);
        if (cancelled || customMutationSeqRef.current !== loadMutationSeq) return;
        installUrl(blob);
      } catch {
        // Keep metadata intact so a later reload or network recovery can retry the fetch.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    clearUrl,
    installUrl,
    remoteBg,
    remoteDim,
    remotePath,
    remoteSettings,
    user?.id,
  ]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const setDim = useCallback(
    (value: number) => {
      const step = Math.min(100, Math.max(0, Math.round(value / 10) * 10));
      setDimState(step);
      writePreference(backgroundDimKey(ownerId), String(step));
      if (hasRemoteRef.current) {
        void saveRef.current({ chat_background_dim: step }, true).catch(() => undefined);
      }
    },
    [ownerId],
  );

  const upload = useCallback(
    async (file: File) => {
      const issue = checkBackgroundImage(file);
      if (issue) throw new BackgroundImageError(issue);
      const targetOwnerId = ownerId;
      const previousPath = customPathRef.current;
      const mutationSeq = ++customMutationSeqRef.current;
      let compressed: Blob;
      let width: number | undefined;
      let height: number | undefined;
      try {
        const bitmap = await createImageBitmap(file);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close();
        compressed = await imageCompression(file, {
          maxSizeMB: 0.75,
          maxWidthOrHeight: 1920,
          initialQuality: 0.82,
          fileType: "image/webp",
          useWebWorker: true,
        });
      } catch (cause) {
        throw new BackgroundImageError("unreadable", { cause });
      }
      if (compressed.size > MAX_COMPRESSED_BYTES) {
        throw new BackgroundImageError("too-large");
      }

      if (hasRemoteRef.current && user?.id === targetOwnerId) {
        let uploadedPath: string;
        try {
          const uploaded = await uploadCustomBackgroundFile(targetOwnerId, compressed, {
            width,
            height,
          });
          uploadedPath = uploaded.path;
        } catch (cause) {
          throw new BackgroundImageError("sync-failed", { cause });
        }

        try {
          await saveRef.current(
            { chat_background: "custom", chat_background_path: uploadedPath },
            false,
          );
        } catch (cause) {
          await deleteCustomBackgroundFile(targetOwnerId, uploadedPath).catch(() => undefined);
          throw new BackgroundImageError("sync-failed", { cause });
        }

        if (ownerIdRef.current !== targetOwnerId || customMutationSeqRef.current !== mutationSeq) {
          return;
        }
        await saveCustomBackground(targetOwnerId, compressed, uploadedPath);
        customPathRef.current = uploadedPath;
        setCustomPath(uploadedPath);
        installUrl(compressed);
        selectionRef.current = { kind: "custom" };
        setSelection({ kind: "custom" });
        writePreference(backgroundSelectionKey(targetOwnerId), "custom");

        if (previousPath && previousPath !== uploadedPath) {
          await deleteCustomBackgroundFile(targetOwnerId, previousPath).catch(() => undefined);
        }
        void queryClient.invalidateQueries({ queryKey: ["storage"] });
        return;
      }

      const saved = await saveCustomBackground(targetOwnerId, compressed);
      if (!saved) throw new BackgroundImageError("storage-unavailable");
      if (ownerIdRef.current !== targetOwnerId || customMutationSeqRef.current !== mutationSeq)
        return;
      installUrl(compressed);
      selectionRef.current = { kind: "custom" };
      setSelection({ kind: "custom" });
      writePreference(backgroundSelectionKey(targetOwnerId), "custom");
    },
    [installUrl, ownerId, queryClient, user?.id],
  );

  const removeCustom = useCallback(async () => {
    const targetOwnerId = ownerId;
    const previousPath = customPathRef.current;
    const next = resolveSelectionAfterCustomRemoval(selectionRef.current);
    const nextSerialized = serializeBackgroundSelection(next);
    const mutationSeq = ++customMutationSeqRef.current;

    if (hasRemoteRef.current && user?.id === targetOwnerId) {
      try {
        await saveRef.current(
          { chat_background: nextSerialized, chat_background_path: null },
          false,
        );
      } catch (cause) {
        throw new BackgroundImageError("sync-failed", { cause });
      }
      if (previousPath) {
        await deleteCustomBackgroundFile(targetOwnerId, previousPath).catch(() => undefined);
      }
      void queryClient.invalidateQueries({ queryKey: ["storage"] });
    }

    await deleteCustomBackground(targetOwnerId);
    if (ownerIdRef.current !== targetOwnerId || customMutationSeqRef.current !== mutationSeq)
      return;
    customPathRef.current = null;
    setCustomPath(null);
    clearUrl();
    if (next !== selectionRef.current) {
      selectionRef.current = next;
      setSelection(next);
      writePreference(backgroundSelectionKey(targetOwnerId), nextSerialized);
    }
  }, [clearUrl, ownerId, queryClient, user?.id]);

  return (
    <Context.Provider
      value={{ selection, dim, customUrl, customPath, choose, setDim, upload, removeCustom }}
    >
      {children}
    </Context.Provider>
  );
}

export function useChatBackground() {
  const value = useContext(Context);
  if (!value) throw new Error("ChatBackgroundProvider missing");
  return value;
}

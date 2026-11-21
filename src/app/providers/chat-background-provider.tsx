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
import { useAuth } from "@/lib/auth-provider";
import {
  deleteCustomBackground,
  loadCustomBackground,
  saveCustomBackground,
} from "@/lib/chat-background-store";
import {
  BACKGROUND_DIM_STEPS,
  BACKGROUND_SELECTIONS,
  BackgroundImageError,
  type ChatBackgroundSelection,
  checkBackgroundImage,
  DEFAULT_BACKGROUND_DIM,
  parseBackgroundDim,
  parseBackgroundSelection,
} from "@/lib/chat-background-validation";
import { readPreference, writePreference } from "@/lib/preferences";

const SELECTION_KEY = "chat_background";
const DIM_KEY = "chat_background_dim";

interface ChatBackgroundValue {
  selection: ChatBackgroundSelection;
  dim: number;
  customUrl?: string;
  choose: (selection: ChatBackgroundSelection) => void;
  setDim: (value: number) => void;
  upload: (file: File) => Promise<void>;
  removeCustom: () => Promise<void>;
}

const Context = createContext<ChatBackgroundValue | null>(null);

export function ChatBackgroundProvider({ children }: PropsWithChildren) {
  const { user, isLoading: authLoading } = useAuth();
  const ownerId = user?.id ?? "guest";
  const [selection, setSelection] = useState<ChatBackgroundSelection>(() =>
    parseBackgroundSelection(readPreference(SELECTION_KEY, BACKGROUND_SELECTIONS, "default")),
  );
  const [dim, setDimState] = useState(() =>
    parseBackgroundDim(readPreference(DIM_KEY, BACKGROUND_DIM_STEPS, DEFAULT_BACKGROUND_DIM)),
  );
  const [customUrl, setCustomUrl] = useState<string | undefined>(undefined);
  const urlRef = useRef<string | undefined>(undefined);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const choose = useCallback((next: ChatBackgroundSelection) => {
    setSelection(next);
    writePreference(SELECTION_KEY, next.kind === "preset" ? next.preset : next.kind);
  }, []);
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  const installUrl = useCallback((blob: Blob) => {
    const next = URL.createObjectURL(blob);
    const previous = urlRef.current;
    urlRef.current = next;
    setCustomUrl(next);
    if (previous) URL.revokeObjectURL(previous);
  }, []);

  useEffect(() => {
    // Wait for the session: a guest-key lookup must not clear a signed-in selection.
    if (authLoading) return;
    let cancelled = false;
    const previous = urlRef.current;
    urlRef.current = undefined;
    setCustomUrl(undefined);
    if (previous) URL.revokeObjectURL(previous);
    void loadCustomBackground(ownerId).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        if (selectionRef.current.kind === "custom") chooseRef.current({ kind: "default" });
        return;
      }
      if (typeof URL.createObjectURL !== "function") return;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setCustomUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, ownerId]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const setDim = useCallback((value: number) => {
    const step = Math.min(100, Math.max(0, Math.round(value / 10) * 10));
    setDimState(step);
    writePreference(DIM_KEY, String(step));
  }, []);

  const upload = useCallback(
    async (file: File) => {
      const issue = checkBackgroundImage(file);
      if (issue) throw new BackgroundImageError(issue);
      let compressed: Blob;
      try {
        const bitmap = await createImageBitmap(file);
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
      const saved = await saveCustomBackground(ownerId, compressed);
      if (!saved) throw new BackgroundImageError("storage-unavailable");
      installUrl(compressed);
      choose({ kind: "custom" });
    },
    [choose, installUrl, ownerId],
  );

  const removeCustom = useCallback(async () => {
    await deleteCustomBackground(ownerId);
    const previous = urlRef.current;
    urlRef.current = undefined;
    setCustomUrl(undefined);
    if (previous) URL.revokeObjectURL(previous);
    choose({ kind: "default" });
  }, [choose, ownerId]);

  return (
    <Context.Provider value={{ selection, dim, customUrl, choose, setDim, upload, removeCustom }}>
      {children}
    </Context.Provider>
  );
}

export function useChatBackground() {
  const value = useContext(Context);
  if (!value) throw new Error("ChatBackgroundProvider missing");
  return value;
}

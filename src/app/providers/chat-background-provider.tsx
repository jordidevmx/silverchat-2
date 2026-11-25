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
  backgroundDimKey,
  backgroundSelectionKey,
  type ChatBackgroundSelection,
  checkBackgroundImage,
  DEFAULT_BACKGROUND_DIM,
  parseBackgroundDim,
  parseBackgroundSelection,
  resolveSelectionAfterCustomRemoval,
} from "@/lib/chat-background-validation";
import { readPreference, writePreference } from "@/lib/preferences";

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
  const ownerId = user?.id ?? "guest";
  const [selection, setSelection] = useState<ChatBackgroundSelection>(() =>
    authLoading ? { kind: "default" } : readOwnerSelection(ownerId),
  );
  const [dim, setDimState] = useState(() =>
    authLoading ? Number(DEFAULT_BACKGROUND_DIM) : readOwnerDim(ownerId),
  );
  const [customUrl, setCustomUrl] = useState<string | undefined>(undefined);
  const urlRef = useRef<string | undefined>(undefined);
  const ownerIdRef = useRef(ownerId);
  ownerIdRef.current = ownerId;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const customMutationSeqRef = useRef(0);

  const choose = useCallback(
    (next: ChatBackgroundSelection) => {
      selectionRef.current = next;
      setSelection(next);
      writePreference(
        backgroundSelectionKey(ownerId),
        next.kind === "preset" ? next.preset : next.kind,
      );
    },
    [ownerId],
  );
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  const installUrl = useCallback((blob: Blob) => {
    if (typeof URL.createObjectURL !== "function") return;
    const next = URL.createObjectURL(blob);
    const previous = urlRef.current;
    urlRef.current = next;
    setCustomUrl(next);
    if (previous) URL.revokeObjectURL(previous);
  }, []);

  useEffect(() => {
    // Wait for the session: a guest-key lookup must not read or overwrite a signed-in account.
    if (authLoading) return;
    let cancelled = false;
    const loadMutationSeq = customMutationSeqRef.current;
    const nextSelection = readOwnerSelection(ownerId);
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setDimState(readOwnerDim(ownerId));

    const previous = urlRef.current;
    urlRef.current = undefined;
    setCustomUrl(undefined);
    if (previous) URL.revokeObjectURL(previous);

    void loadCustomBackground(ownerId).then((blob) => {
      if (cancelled || customMutationSeqRef.current !== loadMutationSeq) return;
      if (!blob) {
        if (selectionRef.current.kind === "custom") chooseRef.current({ kind: "default" });
        return;
      }
      installUrl(blob);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, installUrl, ownerId]);

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
    },
    [ownerId],
  );

  const upload = useCallback(
    async (file: File) => {
      const issue = checkBackgroundImage(file);
      if (issue) throw new BackgroundImageError(issue);
      const targetOwnerId = ownerId;
      const mutationSeq = ++customMutationSeqRef.current;
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
      const saved = await saveCustomBackground(targetOwnerId, compressed);
      if (!saved) throw new BackgroundImageError("storage-unavailable");
      if (ownerIdRef.current !== targetOwnerId || customMutationSeqRef.current !== mutationSeq)
        return;
      installUrl(compressed);
      choose({ kind: "custom" });
    },
    [choose, installUrl, ownerId],
  );

  const removeCustom = useCallback(async () => {
    const targetOwnerId = ownerId;
    const mutationSeq = ++customMutationSeqRef.current;
    await deleteCustomBackground(targetOwnerId);
    if (ownerIdRef.current !== targetOwnerId || customMutationSeqRef.current !== mutationSeq)
      return;
    const previous = urlRef.current;
    urlRef.current = undefined;
    setCustomUrl(undefined);
    if (previous) URL.revokeObjectURL(previous);
    const next = resolveSelectionAfterCustomRemoval(selectionRef.current);
    if (next !== selectionRef.current) choose(next);
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

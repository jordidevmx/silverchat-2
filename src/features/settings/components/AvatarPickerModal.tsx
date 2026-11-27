import {
  ArrowLeft,
  Camera,
  Check,
  Eye,
  ImagePlus,
  RotateCcw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { useI18n } from "@/app/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { cropAvatar, saveAvatar } from "@/lib/avatar-upload";
import { useClipboardImageTarget } from "@/lib/clipboard-paste";
import { isGifCandidate } from "@/lib/gif-core";
import "@/styles/avatar-picker.css";
import { type Profile, useProfileRefresh } from "../hooks";
import { useAction } from "../hooks/useAction";
import { useAvatarUrl } from "../hooks/useAvatar";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function AvatarPickerModal({
  profile,
  onClose,
  onSaved,
  onSave,
}: {
  profile: Pick<Profile, "id" | "avatar_url">;
  onSave?: (file: File | null) => Promise<{ cleanupPending: boolean }>;
  onClose: () => void;
  onSaved: (warning: boolean) => void;
}) {
  const { t, language } = useI18n();
  const titleId = useId();
  const zoomId = useId();
  const action = useAction();
  const refresh = useProfileRefresh();
  const url = useAvatarUrl(profile.avatar_url);

  const [source, setSource] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [viewExisting, setViewExisting] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<Area>();
  const [cropping, setCropping] = useState(false);
  const [localError, setLocalError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const cropControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const closingRef = useRef(false);
  const doneRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const busy = action.busy || cropping;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const hasExisting = Boolean(profile.avatar_url);
  const existingUrl = url.data;

  const finishClose = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCloseRef.current();
  }, []);

  const requestClose = useCallback(() => {
    if (closingRef.current || busyRef.current) return;
    closingRef.current = true;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose();
    } else {
      setClosing(true);
    }
  }, [finishClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    mountedRef.current = true;
    if (dialog && !dialog.open) dialog.showModal();

    // Safari fallback for backdrop light-dismiss when native closedby="any" is absent.
    let cleanupBackdrop: (() => void) | undefined;
    if (dialog && !("closedBy" in HTMLDialogElement.prototype)) {
      const outside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onDown = (e: PointerEvent) => {
        pressedOutside = outside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && outside(e)) requestClose();
        pressedOutside = false;
      };
      dialog.addEventListener("pointerdown", onDown);
      dialog.addEventListener("pointerup", onUp);
      cleanupBackdrop = () => {
        dialog.removeEventListener("pointerdown", onDown);
        dialog.removeEventListener("pointerup", onUp);
      };
    }

    return () => {
      mountedRef.current = false;
      cleanupBackdrop?.();
      if (dialog?.open) dialog.close();
      if (invoker?.isConnected) invoker.focus();
    };
  }, [requestClose]);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(finishClose, 220);
    return () => clearTimeout(timer);
  }, [closing, finishClose]);

  useEffect(
    () => () => {
      cropControllerRef.current?.abort();
    },
    [],
  );

  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );

  const selectFile = useCallback((file?: File) => {
    if (!file) return;
    if ((!file.type.startsWith("image/") && !isGifCandidate(file)) || file.size > MAX_FILE_BYTES) {
      setLocalError("Choose an image smaller than 20 MB.");
      return;
    }
    setLocalError("");
    setViewExisting(false);
    setCrop({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
    setArea(undefined);
    setSourceFile(file);
    setSource(URL.createObjectURL(file));
  }, []);

  const handlePasted = useCallback(
    (files: File[]) => {
      if (files[0]) selectFile(files[0]);
    },
    [selectFile],
  );

  useClipboardImageTarget({
    ref: bodyRef,
    kind: "single-image",
    disabled: busy,
    maxFileBytes: MAX_FILE_BYTES,
    onImages: handlePasted,
  });

  const persist = async (file: File | null) => {
    await action.run(async () => {
      const result = onSave
        ? await onSave(file)
        : await saveAvatar(profile.id, file, profile.avatar_url);
      if (!onSave) await refresh();
      onSaved(result.cleanupPending);
      finishClose();
    });
  };

  const commitCrop = async () => {
    if (!source || !area || busy) return;
    setCropping(true);
    setLocalError("");
    const controller = new AbortController();
    cropControllerRef.current = controller;
    try {
      const file = await cropAvatar(source, area, sourceFile ?? undefined, controller.signal);
      if (controller.signal.aborted) return;
      await persist(file);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setLocalError(err instanceof Error ? err.message : "Could not process photo");
    } finally {
      if (cropControllerRef.current === controller) cropControllerRef.current = null;
      setCropping(false);
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onDragEnter = (e: globalThis.DragEvent) => {
      if (busyRef.current || !e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setDragging(true);
    };
    const onDragOver = (e: globalThis.DragEvent) => {
      if (busyRef.current || !e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e: globalThis.DragEvent) => {
      if (busyRef.current) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragging(false);
    };
    const onDrop = (e: globalThis.DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setDragging(false);
      if (busyRef.current) return;
      const file = e.dataTransfer?.files?.[0];
      if (file) selectFile(file);
    };
    dialog.addEventListener("dragenter", onDragEnter);
    dialog.addEventListener("dragover", onDragOver);
    dialog.addEventListener("dragleave", onDragLeave);
    dialog.addEventListener("drop", onDrop);
    return () => {
      dialog.removeEventListener("dragenter", onDragEnter);
      dialog.removeEventListener("dragover", onDragOver);
      dialog.removeEventListener("dragleave", onDragLeave);
      dialog.removeEventListener("drop", onDrop);
    };
  }, [selectFile]);

  const clampZoom = (next: number) =>
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2))));

  const hintText =
    language === "es"
      ? "Arrastra una imagen aquí o pega con Ctrl+V · Máx. 20 MB"
      : "Drop an image here or paste with Ctrl+V · Max 20 MB";

  const dialogProps = {
    closedby: busy ? "none" : "any",
  } as Record<string, string>;

  return (
    <dialog
      ref={dialogRef}
      data-slot="modal"
      data-closing={closing || undefined}
      aria-labelledby={titleId}
      className="avatar-studio-dialog avatar-picker-dialog"
      {...dialogProps}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }}
      onClose={(event) => {
        if (
          !event.currentTarget.open &&
          mountedRef.current &&
          !doneRef.current &&
          !closingRef.current
        ) {
          finishClose();
        }
      }}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) finishClose();
      }}
    >
      <header className="avatar-studio-header">
        <h1 id={titleId} className="avatar-studio-title">
          {t("Change photo")}
        </h1>
        <button
          type="button"
          className="avatar-studio-close"
          aria-label={language === "es" ? "Cerrar" : "Close"}
          disabled={busy}
          onClick={requestClose}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div ref={bodyRef} className="avatar-studio-body" inert={closing}>
        {/* Upload input MUST remain the first file input inside the dialog. */}
        <input
          ref={uploadRef}
          hidden
          type="file"
          accept="image/*"
          onChange={(e) => {
            selectFile(e.target.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={cameraRef}
          hidden
          type="file"
          accept="image/*"
          capture="user"
          onChange={(e) => {
            selectFile(e.target.files?.[0]);
            e.currentTarget.value = "";
          }}
        />

        {source ? (
          <>
            <div className="avatar-crop">
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                aspect={1}
                cropShape="round"
                showGrid={false}
                zoomWithScroll={false}
                onTouchRequest={(e) => e.touches.length < 2}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setArea(pixels)}
              />
            </div>

            <div className="avatar-studio-zoom-deck">
              <div className="avatar-studio-zoom-head">
                <label htmlFor={zoomId} className="avatar-studio-zoom-label">
                  {t("Zoom")}
                </label>
                <span className="avatar-studio-zoom-value">{zoom.toFixed(1)}×</span>
              </div>
              <div className="avatar-studio-zoom-row">
                <button
                  type="button"
                  className="avatar-studio-zoom-step"
                  aria-label={language === "es" ? "Reducir ampliación" : "Decrease magnification"}
                  disabled={busy || zoom <= MIN_ZOOM}
                  onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
                >
                  <ZoomOut size={15} aria-hidden="true" />
                </button>
                <input
                  id={zoomId}
                  data-slot="zoom-slider"
                  type="range"
                  className="avatar-studio-slider"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.05}
                  value={zoom}
                  aria-valuetext={`${zoom.toFixed(1)}×`}
                  disabled={busy}
                  style={
                    {
                      "--attr-min": MIN_ZOOM,
                      "--attr-max": MAX_ZOOM,
                      "--control-value": zoom,
                    } as CSSProperties
                  }
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
                <button
                  type="button"
                  className="avatar-studio-zoom-step"
                  aria-label={language === "es" ? "Aumentar ampliación" : "Increase magnification"}
                  disabled={busy || zoom >= MAX_ZOOM}
                  onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
                >
                  <ZoomIn size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        ) : viewExisting && existingUrl ? (
          <div className="avatar-studio-preview-stage">
            <img className="avatar-preview" src={existingUrl} alt={t("Profile photo")} />
          </div>
        ) : (
          <div className="avatar-studio-dropzone" data-dragging={dragging || undefined}>
            <div className="avatar-studio-stage">
              <div className="avatar-studio-orb-ring">
                <div className="avatar-studio-orb">
                  {hasExisting && existingUrl ? (
                    <img
                      src={existingUrl}
                      alt={t("Profile photo")}
                      className="avatar-studio-orb-img"
                    />
                  ) : (
                    <span className="avatar-studio-orb-placeholder" aria-hidden="true">
                      <ImagePlus size={26} strokeWidth={1.75} />
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="avatar-studio-tiles">
              <button
                type="button"
                className="avatar-studio-tile avatar-studio-tile-primary"
                disabled={busy}
                onClick={() => uploadRef.current?.click()}
              >
                <span className="avatar-studio-tile-icon" aria-hidden="true">
                  <ImagePlus size={19} strokeWidth={2} />
                </span>
                <span>{t("Upload photo")}</span>
              </button>

              <button
                type="button"
                className="avatar-studio-tile"
                disabled={busy}
                onClick={() => cameraRef.current?.click()}
              >
                <span className="avatar-studio-tile-icon" aria-hidden="true">
                  <Camera size={19} strokeWidth={2} />
                </span>
                <span>{t("Take photo")}</span>
              </button>
            </div>

            <p className="avatar-studio-hint">{hintText}</p>

            {hasExisting && (
              <div className="avatar-studio-secondary">
                <button
                  type="button"
                  className="avatar-studio-pill"
                  disabled={!existingUrl || busy}
                  onClick={() => setViewExisting(true)}
                >
                  <Eye size={15} aria-hidden="true" />
                  <span>{t("View photo")}</span>
                </button>
                <button
                  type="button"
                  className="avatar-studio-pill avatar-studio-pill-danger"
                  disabled={busy}
                  onClick={() => void persist(null)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  <span>{t("Remove photo")}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {localError && (
          <p role="alert" className="avatar-studio-alert">
            {localError}
          </p>
        )}
        {action.feedback}
      </div>

      <footer
        className={`avatar-studio-footer${source || viewExisting ? " avatar-studio-footer-split" : ""}`}
        inert={closing}
      >
        {source ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl text-muted-foreground hover:text-foreground"
              type="button"
              disabled={busy}
              onClick={() => {
                setSource("");
                setSourceFile(null);
                setLocalError("");
              }}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Discard crop
            </Button>
            <div className="avatar-studio-footer-group">
              <Button
                variant="outline"
                className="rounded-xl"
                type="button"
                disabled={busy}
                onClick={requestClose}
              >
                {t("Cancel")}
              </Button>
              <Button
                className="rounded-xl"
                type="button"
                disabled={!area || busy}
                onClick={() => void commitCrop()}
              >
                <Check size={16} aria-hidden="true" />
                {t(busy ? "Saving…" : "Save")}
              </Button>
            </div>
          </>
        ) : viewExisting ? (
          <>
            <Button
              variant="outline"
              className="rounded-xl"
              type="button"
              disabled={busy}
              onClick={() => setViewExisting(false)}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              {t("Back")}
            </Button>
            <Button
              variant="ghost"
              className="rounded-xl"
              type="button"
              disabled={busy}
              onClick={requestClose}
            >
              {t("Cancel")}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            className="rounded-xl"
            type="button"
            disabled={busy}
            onClick={requestClose}
          >
            {t("Cancel")}
          </Button>
        )}
      </footer>
    </dialog>
  );
}

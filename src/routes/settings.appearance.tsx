import { Monitor, Moon, Sun } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { useChatBackground } from "@/app/providers/chat-background-provider";
import { useI18n } from "@/app/providers/i18n-provider";
import { useTheme } from "@/app/providers/theme-provider";
import {
  AccentChoice,
  BackgroundChoice,
  SETTINGS_ACCENTS,
  ThemeChoice,
} from "@/components/ui/settings-surfaces";
import { SettingsPage } from "@/features/settings/components/presentation";
import { QueryState, useAction } from "@/features/settings/components/shared";
import { usePreferences } from "@/features/settings/preferences-provider";
import {
  BackgroundImageError,
  type BackgroundImageErrorCode,
  PRESET_BACKGROUND_LABELS,
  PRESET_BACKGROUNDS,
  type PresetBackground,
} from "@/lib/chat-background-validation";

const ERROR_KEYS: Record<BackgroundImageErrorCode, string> = {
  "unsupported-format": "Unsupported image format. Use PNG, JPG, WebP, GIF, BMP, or AVIF.",
  "too-large": "Choose an image smaller than 10 MB.",
  "empty-file": "That file is empty. Try another image.",
  unreadable: "This image could not be read. Try another one.",
  "storage-unavailable": "This image could not be saved on this device.",
  "sync-failed": "This image could not be synced to your account. Please try again.",
};

export function AppearancePage() {
  const theme = useTheme();
  const { t, language } = useI18n();
  const preferences = usePreferences();
  const action = useAction();
  const background = useChatBackground();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const isDefault = background.selection.kind === "default";
  const hasCustom = Boolean(
    background.customUrl || background.customPath || background.selection.kind === "custom",
  );

  async function onUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isUploading) return;
    setError("");
    setNotice("");
    setIsUploading(true);
    try {
      await background.upload(file);
      setNotice(t("Custom image applied."));
    } catch (cause) {
      const code = cause instanceof BackgroundImageError ? cause.code : ("unreadable" as const);
      setError(t(ERROR_KEYS[code]));
    } finally {
      setIsUploading(false);
    }
  }

  async function onRemove() {
    setError("");
    setNotice("");
    try {
      await background.removeCustom();
      setNotice(t("Custom background removed."));
    } catch (cause) {
      const code = cause instanceof BackgroundImageError ? cause.code : ("sync-failed" as const);
      setError(t(ERROR_KEYS[code]));
    }
  }

  function preview(kind: "default" | "custom" | PresetBackground) {
    if (kind === "default") return <span className="background-default-preview" />;
    if (kind === "custom") {
      const style = background.customUrl
        ? { backgroundImage: `url("${background.customUrl}")` }
        : undefined;
      return <span className="background-custom-preview" style={style} />;
    }
    return <span className={`background-preset-preview background-thumb-${kind}`} />;
  }

  return (
    <SettingsPage title="Appearance" description="Make yourself at home.">
      <QueryState loading={preferences.loading} error={null} />
      <fieldset disabled={!preferences.settings}>
        <div className="settings-card settings-card-body">
          <h2>{t("Theme")}</h2>
          <div className="theme-options">
            {(
              [
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "system", label: "System", icon: Monitor },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <ThemeChoice
                key={value}
                value={value}
                label={t(label)}
                icon={<Icon size={17} />}
                selected={theme.theme === value}
                onSelect={() => void action.run(() => preferences.save({ theme: value }, true))}
              />
            ))}
          </div>
        </div>
        <div className="settings-card settings-card-body">
          <h2>{t("Accent color")}</h2>
          <div className="accent-options">
            {SETTINGS_ACCENTS.map((value) => (
              <AccentChoice
                key={value}
                value={value}
                label={t(value)}
                selected={theme.accent === value}
                onSelect={() => void action.run(() => preferences.save({ accent: value }, true))}
              />
            ))}
          </div>
        </div>
        <div className="settings-card settings-card-body">
          <label htmlFor="language">{t("Language")}</label>
          <select
            id="language"
            value={language}
            onChange={(e) =>
              void action.run(() =>
                preferences.save({ language: e.target.value as "en" | "es" }, true),
              )
            }
          >
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </div>
        <div className="settings-card settings-card-body">
          <h2>{t("Chat background")}</h2>
          <p id="chat-background-help" className="background-help">
            {t("Choose a background for your conversations.")}
          </p>
          <fieldset className="background-fieldset" aria-describedby="chat-background-help">
            <legend className="sr-only">{t("Chat background")}</legend>
            <div className="background-options">
              <BackgroundChoice
                label={t("Default")}
                selected={isDefault}
                onSelect={() => background.choose({ kind: "default" })}
              >
                {preview("default")}
              </BackgroundChoice>
              {PRESET_BACKGROUNDS.map((preset) => (
                <BackgroundChoice
                  key={preset}
                  label={t(PRESET_BACKGROUND_LABELS[preset])}
                  selected={
                    background.selection.kind === "preset" && background.selection.preset === preset
                  }
                  onSelect={() => background.choose({ kind: "preset", preset })}
                >
                  {preview(preset)}
                </BackgroundChoice>
              ))}
              {hasCustom && (
                <BackgroundChoice
                  label={t("Custom image")}
                  selected={background.selection.kind === "custom"}
                  onSelect={() => background.choose({ kind: "custom" })}
                >
                  {preview("custom")}
                </BackgroundChoice>
              )}
            </div>
          </fieldset>
          <div className="background-actions">
            <input
              id="chat-background-upload"
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
              aria-disabled={isUploading || undefined}
              aria-busy={isUploading || undefined}
              onClick={(event) => {
                if (isUploading) event.preventDefault();
              }}
              onChange={(event) => void onUpload(event)}
            />
            <label
              className="button secondary"
              htmlFor="chat-background-upload"
              aria-disabled={isUploading || undefined}
            >
              {isUploading ? t("Applying…") : t("Upload image")}
            </label>
            {hasCustom && (
              <button
                className="button secondary"
                type="button"
                disabled={isUploading}
                onClick={() => void onRemove()}
              >
                {t("Remove custom image")}
              </button>
            )}
          </div>
          {!isDefault && (
            <div className="background-dim">
              <label htmlFor="chat-background-dim">{t("Background dimming")}</label>
              <input
                id="chat-background-dim"
                type="range"
                min={0}
                max={100}
                step={10}
                value={background.dim}
                onChange={(event) => background.setDim(Number(event.target.value))}
              />
              <output htmlFor="chat-background-dim">{background.dim}%</output>
            </div>
          )}
          {error && (
            <p role="alert" className="background-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="quiet-note">
              {notice}
            </p>
          )}
        </div>
      </fieldset>
      <p className="quiet-note">{t("These preferences follow you across devices.")}</p>
      {action.feedback}
    </SettingsPage>
  );
}

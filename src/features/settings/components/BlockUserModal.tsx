import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/ui/settings-surfaces";
import { useBlockUser } from "../hooks/useBlockUser";
import { useUnblockUser } from "../hooks/useUnblockUser";
export function BlockUserModal({
  target,
  onClose,
  mode = "block",
}: {
  target: { id: string; display_name: string };
  onClose: () => void;
  mode?: "block" | "unblock";
}) {
  const { user, action, t, language, block } = useBlockUser(target.id, onClose);
  const { action: unblockAction, unblock } = useUnblockUser(target.id, onClose);
  const active = mode === "block" ? action : unblockAction;
  const submit = mode === "block" ? block : unblock;
  return (
    <SettingsDialog
      title={
        mode === "block"
          ? `${t("Block")} ${target.display_name}?`
          : `${t("Unblock")} ${target.display_name}?`
      }
      onClose={onClose}
      canClose={!active.busy}
    >
      {(close) => (
        <>
          <p>
            {mode === "block"
              ? language === "es"
                ? "No podrán enviarte mensajes y no verás sus mensajes."
                : "They won’t be able to message you, and you won’t see their messages."
              : language === "es"
                ? "Volverás a ver sus mensajes y podrán escribirte."
                : "You’ll see their messages again and they’ll be able to message you."}
          </p>
          {active.feedback}
          <div className="modal-actions">
            <Button
              variant="outline"
              type="button"
              autoFocus
              disabled={active.busy}
              onClick={close}
            >
              {t("Cancel")}
            </Button>
            <Button
              variant={mode === "block" ? "destructive" : "default"}
              type="button"
              disabled={active.busy || !user}
              onClick={() => void submit()}
            >
              {mode === "block" ? t("Block") : t("Unblock")}
            </Button>
          </div>
        </>
      )}
    </SettingsDialog>
  );
}

import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/app/providers/i18n-provider";
import { useAuth } from "@/lib/auth-provider";
import { unblockUser } from "../hooks";
import { invalidateBlockState } from "./blockCache";
import { useAction } from "./useAction";

export function useUnblockUser(targetId: string, onClose: () => void) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const action = useAction();
  const { t } = useI18n();
  const unblock = () =>
    action.run(async () => {
      if (!user) return;
      await unblockUser(targetId, user.id);
      await invalidateBlockState(cache, user.id);
      onClose();
    }, "Unblocked");
  return { user, action, t, unblock };
}

// Shared two-person call eligibility rules used across header, contact modal,
// new-call picker, history callbacks, and timeline callbacks.

export interface CallEligibilityInput {
  type: string | null | undefined;
  status?: string | null;
  isBlocked?: boolean;
  readOnly?: boolean;
  channelMode?: boolean;
}

export type CallIneligibilityReason = "unsupported" | "pending" | "blocked" | "read_only";

export type CallEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: CallIneligibilityReason };

export function getCallEligibility(
  input: CallEligibilityInput | null | undefined,
): CallEligibilityResult {
  if (!input || input.channelMode || input.type !== "direct") {
    return { eligible: false, reason: "unsupported" };
  }
  if (input.isBlocked) {
    return { eligible: false, reason: "blocked" };
  }
  if (input.readOnly) {
    return { eligible: false, reason: "read_only" };
  }
  if (input.status && input.status !== "active") {
    return { eligible: false, reason: "pending" };
  }
  return { eligible: true };
}

export function isChatCallable(input: CallEligibilityInput | null | undefined): boolean {
  return getCallEligibility(input).eligible;
}

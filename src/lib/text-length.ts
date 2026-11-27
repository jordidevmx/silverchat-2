/** Universal ceiling for free-text inputs, counted in UTF-16 code units like the browser's maxLength. */
export const MAX_TEXT_LENGTH = 10_000;

/** Trims text to the shared ceiling so programmatic edits cannot exceed what the browser accepts. */
export function clampText(value: string): string {
  const clamped = value.slice(0, MAX_TEXT_LENGTH);
  // A cut at code-unit 10,000 can land between the halves of a surrogate pair.
  return /[\uD800-\uDBFF]$/.test(clamped) ? clamped.slice(0, -1) : clamped;
}

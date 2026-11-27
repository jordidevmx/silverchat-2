import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const MIGRATED_SCREENS = [
  "src/features/chat-settings/components/GroupSettingsScreen.tsx",
  "src/features/chat-settings/components/GroupMembersList.tsx",
  "src/features/chat-settings/components/SharedMediaView.tsx",
  "src/features/chat-settings/components/ChatSettingsLayer.tsx",
  "src/features/communities/components/CommunityChatView.tsx",
  "src/features/messages/components/ChatHeader.tsx",
  "src/features/novedades/components/channels/ChannelInfoScreen.tsx",
  "src/features/novedades/components/channels/ChannelHeader.tsx",
  "src/features/novedades/components/channels/ChannelView.tsx",
  "src/routes/_authenticated.novedades.tsx",
  "src/routes/profile.$username.tsx",
  "src/routes/settings.tsx",
  "src/routes/_authenticated.chats.new.tsx",
  "src/routes/_authenticated.chats.new-group.tsx",
];

test("NavLink forwards aria-label and data-slot onto its anchor element", () => {
  const source = read("src/features/settings/components/shared.tsx");
  assert.match(source, /"aria-label"\?:\s*string/);
  assert.match(source, /aria-label=\{ariaLabel\}/);
  assert.match(source, /"data-slot"\?:\s*string/);
  assert.match(source, /data-slot=\{dataSlot\}/);
});

test("BackButton primitive enforces icon-only ChevronLeft, 40px target, focus ring, and link/button modes", () => {
  const rel = "src/components/ui/back-button.tsx";
  assert.equal(
    existsSync(path.join(ROOT, rel)),
    true,
    "src/components/ui/back-button.tsx must exist",
  );
  const source = read(rel);
  assert.match(source, /export function BackButton\(/);
  assert.match(source, /<ChevronLeft\s+size=\{22\}\s+aria-hidden="true"\s*\/>/);
  assert.match(source, /data-slot="back-button"/);
  assert.match(source, /aria-label=\{props\.label\}/);
  assert.match(source, /min-h-10/);
  assert.match(source, /min-w-10/);
  assert.match(source, /text-foreground/);
  assert.match(source, /focus-visible:outline-2/);
  assert.match(source, /<NavLink/);
  assert.match(source, /<button[\s\S]*type="button"/);
});

test("all 14 screens use BackButton without text back arrows or ArrowLeft icons", () => {
  for (const rel of MIGRATED_SCREENS) {
    const source = read(rel);
    assert.match(
      source,
      /import\s*\{[^}]*\bBackButton\b[^}]*\}\s*from\s*"@\/components\/ui\/back-button"/,
      `${rel} must import BackButton`,
    );
    assert.match(source, /<BackButton\b/, `${rel} must render BackButton`);
    assert.doesNotMatch(source, /←/, `${rel} must not contain '←' text arrows`);
    assert.doesNotMatch(source, /<ArrowLeft\b/, `${rel} must not render ArrowLeft icon`);
  }
});

test("ChannelInfoScreen omits ChannelHeader and ChatHeader preserves desktop conversation-back hiding", () => {
  const channelInfo = read("src/features/novedades/components/channels/ChannelInfoScreen.tsx");
  assert.doesNotMatch(
    channelInfo,
    /\bChannelHeader\b/,
    "ChannelInfoScreen must not render ChannelHeader",
  );

  const chatHeader = read("src/features/messages/components/ChatHeader.tsx");
  assert.match(chatHeader, /conversation-back/);
  assert.match(chatHeader, /\[\.chat-workspace_&\]:lg:hidden/);
});

test("ExploreChannelsPage header opts out of global space-between header layout", () => {
  const novedades = read("src/routes/_authenticated.novedades.tsx");
  assert.match(
    novedades,
    /<header[^>]*data-slot="explore-header"[^>]*justify-start/,
    "ExploreChannelsPage header must set data-slot and justify-start so globals.css header:not([data-slot]) does not push the title right",
  );
});

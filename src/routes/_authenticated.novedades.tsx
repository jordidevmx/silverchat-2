import { useRouter, useSearch } from "@tanstack/react-router";
import { Compass, Megaphone } from "lucide-react";
import { useState } from "react";
import { BackButton } from "@/components/ui/back-button";
import { BrandLockup } from "@/components/ui/brand-lockup";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { useMessageText } from "@/features/messages/i18n";
import { ChannelInvitationsBanner } from "@/features/novedades/components/channels/ChannelInvitationsSection";
import { ChannelsSection } from "@/features/novedades/components/channels/ChannelsSection";
import { CreateChannelModal } from "@/features/novedades/components/channels/CreateChannelModal";
import { DiscoverChannelsSection } from "@/features/novedades/components/channels/DiscoverChannelsSection";
import { StoriesRow } from "@/features/novedades/components/stories/StoriesRow";
import { StoryCreator } from "@/features/novedades/components/stories/StoryCreator";
import { StoryViewer } from "@/features/novedades/components/stories/StoryViewer";
import { NavLink } from "@/features/settings/components/shared";
import "@/styles/novedades.css";
export function NovedadesPage() {
  const { say } = useMessageText();
  const router = useRouter();
  const search = useSearch({ from: "/_authenticated/novedades" });
  const [text, setText] = useState("");
  const [creator, setCreator] = useState(false);
  const [viewer, setViewer] = useState<string>();
  return (
    <main id="main" className="novedades-page">
      <header className="novedades-header">
        <BrandLockup />
        <h1>{say("Updates", "Novedades")}</h1>
        <SearchField
          label={say("Search stories and channels", "Buscar historias y canales")}
          placeholder={say("Search stories and channels…", "Buscar historias y canales…")}
          clearLabel={say("Clear search", "Limpiar búsqueda")}
          value={text}
          onChange={setText}
          onClear={() => setText("")}
        />
      </header>
      <StoriesRow search={text} onOpen={setViewer} onCreate={() => setCreator(true)} />
      <ChannelInvitationsBanner />
      <ChannelsSection search={text} />
      <DiscoverChannelsSection search={text} />
      <footer className="novedades-bottom">
        <Button
          asChild
          variant="outline"
          className="bg-card/70 text-foreground hover:bg-neon/10 hover:text-foreground"
        >
          <NavLink href="/novedades/explore">
            <Compass size={17} aria-hidden="true" />
            {say("Explore more", "Explorar más")}
          </NavLink>
        </Button>
        <Button
          type="button"
          variant="neon-outline"
          onClick={() => void router.navigate({ to: "/novedades", search: { create: true } })}
        >
          <Megaphone size={17} aria-hidden="true" />
          {say("Create channel", "Crear canal")}
        </Button>
      </footer>
      {creator && <StoryCreator onClose={() => setCreator(false)} />}{" "}
      {viewer && <StoryViewer userId={viewer} onClose={() => setViewer(undefined)} />}{" "}
      {search.create && (
        <CreateChannelModal
          onClose={() =>
            void router.navigate({ to: "/novedades", search: { create: undefined }, replace: true })
          }
        />
      )}
    </main>
  );
}
export function ExploreChannelsPage() {
  const { say } = useMessageText();
  return (
    <main id="main" className="novedades-page">
      <header data-slot="explore-header" className="mb-5 flex items-center justify-start gap-3">
        <BackButton href="/novedades" label={say("Back to updates", "Volver a novedades")} />
        <h1 className="!m-0">{say("Explore channels", "Explorar canales")}</h1>
      </header>
      <DiscoverChannelsSection />
    </main>
  );
}

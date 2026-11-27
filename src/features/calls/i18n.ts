import { useI18n } from "@/app/providers/i18n-provider";

const es: Record<string, string> = {
  // Calls page
  Calls: "Llamadas",
  "Recent voice and video activity": "Actividad reciente de voz y vídeo",
  All: "Todos",
  Missed: "Perdidas",
  "Search calls…": "Buscar llamadas…",
  "Clear search": "Borrar búsqueda",
  "No calls yet": "Aún no hay llamadas",
  "Voice and video calls with your contacts will appear here.":
    "Aquí aparecerán tus llamadas de voz y vídeo con tus contactos.",
  "No missed calls": "No hay llamadas perdidas",
  "Calls you miss will appear here.": "Las llamadas que pierdas aparecerán aquí.",
  "Could not load calls.": "No se pudieron cargar las llamadas.",
  Busy: "Ocupado",
  "Missed while busy": "Perdida mientras estabas en otra llamada",
  "{name} is busy": "{name} está ocupado",
  "Try again later.": "Inténtalo más tarde.",
  Close: "Cerrar",
  // Log rows
  "Voice call": "Llamada de voz",
  "Video call": "Videollamada",
  Outgoing: "Saliente",
  Incoming: "Entrante",
  "No answer": "Sin respuesta",
  Declined: "Rechazada",
  Canceled: "Cancelada",
  "Tap to call back": "Toca para devolver la llamada",
  // Inline call events
  "Missed voice call": "Llamada de voz perdida",
  "Missed video call": "Videollamada perdida",
  "Declined call": "Llamada rechazada",
  "Canceled call": "Llamada cancelada",
  "Call failed": "La llamada falló",
  "Could not update call details": "No se pudieron actualizar los detalles de la llamada",
  "Unavailable contact": "Contacto no disponible",
  Duration: "Duración",
  "Started by {name}": "Iniciada por {name}",
  Participants: "Participantes",
  "Start voice call": "Iniciar llamada de voz",
  // New call modal
  "New call": "Nueva llamada",
  "Search chats…": "Buscar chats…",
  "No contacts with active chats. Start a chat first.":
    "No hay contactos con chats activos. Inicia un chat primero.",
  "Could not load chats.": "No se pudieron cargar los chats.",
  // Ringing modals
  "Incoming voice call": "Llamada de voz entrante",
  "Incoming video call": "Videollamada entrante",
  "Calling…": "Llamando…",
  Accept: "Aceptar",
  Decline: "Rechazar",
  Cancel: "Cancelar",
  Hangup: "Colgar",
  // Active call
  "Camera off": "Cámara apagada",
  "Toggle video size": "Cambiar tamaño del vídeo",
  "Minimize call": "Minimizar llamada",
  "Active call": "Llamada activa",
  "Return to call": "Volver a la llamada",
  "Return to full screen": "Volver a pantalla completa",
  "Close floating video": "Cerrar ventana flotante",
  "Video call window. Drag or use arrow keys to move. Double-click to expand.":
    "Ventana de videollamada. Arrastra o usa las flechas para moverla. Doble toque para ampliar.",
  "Moved left": "Movido a la izquierda",
  "Moved right": "Movido a la derecha",
  "Moved up": "Movido hacia arriba",
  "Moved down": "Movido hacia abajo",
  You: "Tú",
  Muted: "Silenciado",
  "Ending…": "Finalizando…",
  // Controls (aria)
  "Mute microphone": "Silenciar micrófono",
  "Unmute microphone": "Activar micrófono",
  "Speaker on": "Altavoz activado",
  "Speaker off": "Altavoz silenciado",
  "Turn camera on": "Encender cámara",
  "Turn camera off": "Apagar cámara",
  // Toasts and errors
  "Call declined": "Llamada rechazada",
  "Call canceled": "Llamada cancelada",
  "Call ended": "Llamada finalizada",
  "Call failed. Try again.": "La llamada falló. Inténtalo de nuevo.",
  "Camera/microphone access is required. Enable it in your browser settings.":
    "Se necesita acceso a la cámara y al micrófono. Actívalo en la configuración del navegador.",
  "Failed to start call. Try again.": "No se pudo iniciar la llamada. Inténtalo de nuevo.",
  "You are already in a call": "Ya estás en una llamada",
  "A call is already in progress in this chat": "Ya hay una llamada en curso en este chat",
  // Day grouping
  Today: "Hoy",
  Yesterday: "Ayer",
};
export function useCallText() {
  const { language } = useI18n();
  return (text: string, spanish?: string) =>
    language === "es" ? (spanish ?? es[text] ?? text) : text;
}

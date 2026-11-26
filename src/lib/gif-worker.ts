/// <reference types="vite/client" />
import workerUrl from "modern-gif/dist/worker.js?url";

export function getGifWorkerUrl(): string | undefined {
  return typeof Worker === "undefined" ? undefined : workerUrl;
}

import { getCurrentWindow } from "@tauri-apps/api/window";

export const isDesktop = "__TAURI_INTERNALS__" in window;

export const windowControls = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
};

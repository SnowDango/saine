import type { PlasmoCSConfig } from "plasmo"

import { boot } from "./controllers/PreviewController"

export const config: PlasmoCSConfig = {
  matches: ["https://github.com/*"],
  run_at: "document_idle"
}

boot()

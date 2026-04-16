import fs from "node:fs"
import path from "node:path"

const targets = [
  "build/chrome-mv3-prod",
  "build/chrome-mv3-dev",
]

for (const target of targets) {
  const dest = path.join(target, "_locales")
  if (fs.existsSync(target)) {
    fs.cpSync("_locales", dest, { recursive: true })
    console.log(`Copied _locales → ${dest}`)
  }
}


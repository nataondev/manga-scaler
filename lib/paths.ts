import { homedir, platform } from "os";
import { join } from "path";

const p = platform();
const home = homedir();

function configDir(): string {
  if (p === "darwin") return join(home, "Library", "Application Support", "manga-scaler");
  if (p === "win32") return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "manga-scaler");
  return join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "manga-scaler");
}

function dataDir(): string {
  if (p === "darwin") return join(home, "Library", "Application Support", "manga-scaler");
  if (p === "win32") return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "manga-scaler");
  return join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), "manga-scaler");
}

function cacheDir(): string {
  if (p === "darwin") return join(home, "Library", "Caches", "manga-scaler");
  if (p === "win32") return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "manga-scaler", "Cache");
  return join(process.env.XDG_CACHE_HOME || join(home, ".cache"), "manga-scaler");
}

export const paths = {
  config: configDir(),
  data: dataDir(),
  cache: cacheDir(),
};

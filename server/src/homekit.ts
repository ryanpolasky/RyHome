import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface HomeKitAccessory {
  id: string;
  name: string;
  room: string | null;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  vendorId: number | null;
  productId: number | null;
}

export interface HomeKitInfo {
  homeName: string | null;
  accessories: HomeKitAccessory[];
}

const DB_PATH = join(homedir(), "Library", "HomeKit", "core.sqlite");
const CACHE_MS = 60_000;

let cached: { at: number; info: HomeKitInfo | null } | null = null;
let warned = false;

function query<T>(db: DatabaseSync, sql: string): T[] {
  try {
    return db.prepare(sql).all() as T[];
  } catch {
    return [];
  }
}

// read-only peek at homed's database so names and rooms match the home app; needs full disk access
function read(): HomeKitInfo | null {
  if (process.platform !== "darwin") return null;
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(DB_PATH, { readOnly: true });
  } catch (e) {
    if (!warned) console.warn(`Can't read Home app names (${(e as Error).message}). Grant Full Disk Access to use them.`);
    warned = true;
    return null;
  }
  try {
    const accessories = query<HomeKitAccessory>(
      db,
      `SELECT a.ZUNIQUEIDENTIFIER AS id, COALESCE(a.ZCONFIGUREDNAME, a.ZPROVIDEDNAME) AS name, r.ZNAME AS room,
              a.ZMANUFACTURER AS manufacturer, a.ZMODEL AS model, NULLIF(TRIM(a.ZSERIALNUMBER), '') AS serial,
              a.ZMATTERVENDORID AS vendorId, a.ZMATTERPRODUCTID AS productId
       FROM ZMKFACCESSORY a LEFT JOIN ZMKFROOM r ON a.ZROOM = r.Z_PK
       WHERE a.ZUNIQUEIDENTIFIER IS NOT NULL AND COALESCE(a.ZCONFIGUREDNAME, a.ZPROVIDEDNAME) IS NOT NULL`
    );
    const homes = query<{ name: string | null }>(db, "SELECT ZNAME AS name FROM ZMKFHOME LIMIT 1");
    warned = false;
    return { homeName: homes[0]?.name ?? null, accessories };
  } finally {
    db.close();
  }
}

export function homeKitInfo(): HomeKitInfo | null {
  if (!cached || Date.now() - cached.at > CACHE_MS) cached = { at: Date.now(), info: read() };
  return cached.info;
}

export function refreshHomeKit() {
  cached = null;
}

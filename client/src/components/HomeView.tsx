import type { ConnectionStatus } from "../api/bridge";
import type { Accessory, Home, Room } from "../api/types";
import type { MenuItem } from "./MoreMenu";
import { MoreMenu } from "./MoreMenu";
import type { View } from "../home";
import { categories, categoryOf, categorySummary } from "../home";
import { Icon } from "./Icon";
import { categoryIcons } from "./Sidebar";
import { AccessoryTile, SceneTile } from "./Tile";
import { WindowControls } from "./WindowControls";

const kindOrder: Accessory["kind"][] = ["camera", "light", "television", "speaker", "sensor"];

function sortAccessories(list: Accessory[]): Accessory[] {
  return [...list].sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
}

export function HomeView({
  home,
  view,
  onNavigate,
  onOpen,
  onToggle,
  onRunScene,
  menu,
  status,
  emptyHint,
}: {
  home: Home;
  view: View;
  onNavigate: (view: View) => void;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onRunScene: (id: string) => void;
  menu: MenuItem[];
  status: ConnectionStatus;
  emptyHint?: string;
}) {
  const statusLabel = { online: null, connecting: "Connecting...", offline: "Mac Unreachable", unauthorized: "Pairing Expired" }[status];
  const room = view.type === "room" ? home.rooms.find((r) => r.id === view.id) : undefined;
  const category = view.type === "category" ? categories.find((c) => c.id === view.id) : undefined;
  const title = room?.name ?? category?.name ?? home.name;

  const scoped: Home = room ? { ...home, accessories: home.accessories.filter((a) => a.roomId === room.id) } : home;
  const tiles = scoped.accessories.filter((a) => !(a.kind === "light" && a.groupId));
  const visible = category ? tiles.filter((a) => categoryOf(a) === category.id) : tiles;
  const pills = categories.flatMap((c) => {
    const summary = categorySummary(scoped, c.id);
    return summary ? [{ ...c, summary }] : [];
  });

  const grid = (list: Accessory[]) => (
    <div className="tile-grid">
      {sortAccessories(list).map((a) => (
        <AccessoryTile key={a.id} accessory={a} onOpen={() => onOpen(a.id)} onToggle={() => onToggle(a.id)} />
      ))}
    </div>
  );

  const roomSection = (r: Room) => {
    const list = visible.filter((a) => a.roomId === r.id);
    if (list.length === 0) return null;
    return (
      <section key={r.id} className="room-section">
        <button className="section-title" onClick={() => onNavigate({ type: "room", id: r.id })}>
          {r.name}
          <Icon name="chevronRight" size={11} />
        </button>
        {grid(list)}
      </section>
    );
  };

  return (
    <main className="home-view">
      <header className="home-header" data-tauri-drag-region>
        <h1 data-tauri-drag-region>{title}</h1>
        {statusLabel && <span className={`status-pill ${status}`}>{statusLabel}</span>}
        <MoreMenu items={menu} />
        <WindowControls />
      </header>
      <div className="home-scroll">
        {!category && pills.length > 0 && (
          <div className="pills">
            {pills.map((p) => (
              <button key={p.id} className={`pill pill-${p.id}`} onClick={() => onNavigate({ type: "category", id: p.id })}>
                <Icon name={categoryIcons[p.id]} size={15} />
                <span className="pill-text">
                  <span className="pill-name">{p.name}</span>
                  <span className="pill-summary">{p.summary}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {view.type === "home" && home.scenes.length > 0 && (
          <section className="room-section">
            <div className="section-title static">Scenes</div>
            <div className="tile-grid">
              {home.scenes.map((s) => (
                <SceneTile key={s.id} scene={s} onRun={() => onRunScene(s.id)} />
              ))}
            </div>
          </section>
        )}
        {room ? grid(visible) : home.rooms.map(roomSection)}
        {visible.length === 0 && (
          <div className="empty-state">
            <span>No Accessories</span>
            {view.type === "home" && emptyHint && <span className="empty-hint">{emptyHint}</span>}
          </div>
        )}
      </div>
    </main>
  );
}

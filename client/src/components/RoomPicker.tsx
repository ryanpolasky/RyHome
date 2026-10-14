import { useState } from "react";
import type { Room } from "../api/types";

const NEW = "__new__";

export function RoomPicker({
  rooms,
  value,
  disabled,
  onChange,
}: {
  rooms: Room[];
  value: string;
  disabled?: boolean;
  onChange: (room: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  if (adding) {
    const commit = () => {
      setAdding(false);
      if (draft.trim()) onChange(draft.trim());
      setDraft("");
    };
    return (
      <input
        className="settings-input"
        placeholder="Room name"
        autoFocus
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setAdding(false);
        }}
      />
    );
  }

  const names = rooms.map((r) => r.name);
  if (value && !names.includes(value)) names.push(value);
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))}
    >
      {!value && <option value="">Default Room</option>}
      {names.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
      <option value={NEW}>New Room...</option>
    </select>
  );
}

import { useState } from 'react';
import { CHAT_MAX_ROOMS, type ChatRoom } from '@taskterm/shared';
import { useChatRoomMutations, useChatRooms } from '../../api/chat';
import { Icon } from '../../components/Icon';
import { confirmDialog } from '../../stores/confirm';

function RoomRow({ room, index, rooms, onRename, onMove, onDelete }: {
  room: ChatRoom;
  index: number;
  rooms: ChatRoom[];
  onRename: (name: string) => void;
  onMove: (beforeId: number | null) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="chat-room-row flex flex-wrap items-center justify-between gap-2 border border-line bg-bg px-3 py-2">
      {editing ? (
        <input
          autoFocus
          defaultValue={room.name}
          maxLength={40}
          aria-label="название темы"
          className="chat-room-rename-input w-56 border border-accent bg-elev px-2 py-0.5 outline-none"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== room.name) onRename(v);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span className="chat-room-name">
          {room.isGeneral && <Icon name="pin" className="mr-1 text-muted" />}
          {room.name}
        </span>
      )}
      <div className="chat-room-actions flex items-center gap-2">
        <button type="button" className="chat-room-move-left btn btn-icon" disabled={index === 0} title="влево" aria-label={`сдвинуть тему «${room.name}» влево`} onClick={() => onMove(rooms[index - 1]!.id)}>
          ‹
        </button>
        <button type="button" className="chat-room-move-right btn btn-icon" disabled={index === rooms.length - 1} title="вправо" aria-label={`сдвинуть тему «${room.name}» вправо`} onClick={() => onMove(rooms[index + 2]?.id ?? null)}>
          ›
        </button>
        <button type="button" className="chat-room-rename btn" onClick={() => setEditing(true)}>
          изменить
        </button>
        {!room.isGeneral && (
          <button type="button" className="chat-room-delete btn btn-danger" onClick={onDelete}>
            удалить
          </button>
        )}
      </div>
    </li>
  );
}

/** Темы чата (вкладки): создать, переименовать, переставить, удалить; основная тема (General) закреплена и не удаляется */
export function ChatRoomsAdmin() {
  const rooms = useChatRooms().data ?? [];
  const m = useChatRoomMutations();
  const [name, setName] = useState('');
  const error = m.create.error ?? m.rename.error ?? m.move.error ?? m.remove.error;
  const create = () => {
    const v = name.trim();
    if (v) m.create.mutate(v, { onSuccess: () => setName('') });
  };
  return (
    <section className="chat-rooms-admin space-y-3 border border-line bg-elev p-4">
      <h2 className="chat-rooms-title">
        ## темы <span className="text-muted">({rooms.length})</span>
      </h2>
      <ul className="chat-rooms-list space-y-1">
        {rooms.map((r, i) => (
          <RoomRow
            key={r.id}
            room={r}
            index={i}
            rooms={rooms}
            onRename={(n) => m.rename.mutate({ id: r.id, name: n })}
            onMove={(beforeId) => m.move.mutate({ id: r.id, beforeId })}
            onDelete={async () => {
              if (await confirmDialog({ title: `Удалить тему «${r.name}»?`, message: 'Вместе с темой удалятся все её сообщения. Действие необратимо.', danger: true })) m.remove.mutate(r.id);
            }}
          />
        ))}
      </ul>
      <div className="chat-room-create flex flex-wrap items-center gap-2">
        <input
          value={name}
          maxLength={40}
          name="chat-room-name"
          autoComplete="off"
          aria-label="название новой темы"
          placeholder="название темы, enter"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          className="chat-room-name-input w-56 border border-line bg-bg px-2 py-1 outline-none focus:border-accent"
        />
        <button type="button" className="chat-room-add btn btn-primary" disabled={!name.trim() || m.create.isPending || rooms.length >= CHAT_MAX_ROOMS} onClick={create}>
          добавить
        </button>
      </div>
      {error && (
        <p role="alert" className="chat-rooms-error text-danger">
          ! {error.message}
        </p>
      )}
      <p className="text-[14px] text-muted">// эмодзи в названии допустимы; тему General удалить нельзя, остальные удаляются вместе с сообщениями</p>
    </section>
  );
}

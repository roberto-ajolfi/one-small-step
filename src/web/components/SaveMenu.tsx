/**
 * SaveMenu — save/load slots and JSON file export/import (spec §7 "Save/load:
 * localStorage (slot-based) + JSON file export/import").
 *
 * Slots are an internal convenience; the exported document is the portable
 * `{version, seed, tuningHash, moves[]}` save (see `src/web/save.ts`).
 */

import { useRef, useState } from 'react';
import { SLOT_IDS, downloadSave, readFileText } from '../store';
import { Badge, Button, Icon, Modal } from '../ui';
import { useGameSession, useGameState } from '../useGameSession';

export function SaveMenu({ onClose }: { onClose: () => void }) {
  const session = useGameSession();
  const { slots } = useGameState();
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const note = (text: string, isError = false) => {
    setMessage(text);
    if (!isError) setTimeout(onClose, 900);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const reason = session.loadSaveText(await readFileText(file));
    note(reason ?? `imported ${file.name}`, reason !== null);
  };

  return (
    <Modal title="Save & load" eyebrow="session" onClose={onClose} maxWidth="md">
      <div className="flex flex-col gap-4">
        {message ? (
          <p className="flex items-center gap-2 border border-ink/25 bg-paper-edge/30 px-3 py-2 text-micro text-ink-soft">
            <Icon name="info" size={14} /> {message}
          </p>
        ) : null}

        <ul className="flex flex-col gap-2">
          {SLOT_IDS.map((id) => {
            const slot = slots.find((entry) => entry.id === id);
            return (
              <li key={id} className="flex flex-wrap items-center gap-2 border border-ink/20 px-3 py-2">
                <Badge tone="ink">slot {id.toUpperCase()}</Badge>
                <p className="min-w-0 grow text-micro text-ink-soft">
                  {slot
                    ? `${slot.year} \u00b7 turn ${slot.turn} \u00b7 ${slot.moves} moves \u00b7 seed ${slot.seed} \u00b7 ${new Date(slot.savedAt).toLocaleString()}`
                    : 'empty'}
                </p>
                <Button
                  size="sm"
                  icon="save"
                  onClick={() => {
                    const reason = session.saveToSlot(id);
                    note(reason ?? `saved to slot ${id.toUpperCase()}`, reason !== null);
                  }}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  icon="folder"
                  disabledReason={slot ? undefined : `slot ${id.toUpperCase()} is empty`}
                  onClick={() => {
                    const reason = session.loadFromSlot(id);
                    note(reason ?? `loaded slot ${id.toUpperCase()}`, reason !== null);
                  }}
                >
                  Load
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon="trash"
                  disabledReason={slot ? undefined : `slot ${id.toUpperCase()} is empty`}
                  onClick={() => {
                    session.deleteSlot(id);
                    setMessage(`cleared slot ${id.toUpperCase()}`);
                  }}
                >
                  Clear
                </Button>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2 border-t border-ink/20 pt-3">
          <Button icon="download" onClick={() => downloadSave(session.encodeSave())}>
            Export JSON
          </Button>
          <Button icon="upload" onClick={() => fileInput.current?.click()}>
            Import JSON
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import a save file"
            onChange={(event) => {
              void onImport(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <p className="text-micro text-ink-faint">
            Saves store the seed, the tuning fingerprint and the move journal — the whole game replays
            from them.
          </p>
        </div>
      </div>
    </Modal>
  );
}

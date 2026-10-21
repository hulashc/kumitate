"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Peer, PresenceUser } from "@/lib/presence";
import type { ConnectionStatus } from "@/lib/useRoom";
import type { BuildStore } from "@/lib/buildStore";
import { downloadBuild, importBuildFile } from "@/lib/buildFile";
import styles from "./RoomBar.module.css";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  connected: "Live",
  disconnected: "Offline",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function RoomBar({
  store,
  roomId,
  title,
  status,
  identity,
  peers,
  onRenameIdentity,
  onRetitle,
}: {
  store: BuildStore;
  roomId: string;
  title: string;
  status: ConnectionStatus;
  identity: PresenceUser;
  peers: Peer[];
  onRenameIdentity: (name: string) => void;
  onRetitle: (title: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [editingName, setEditingName] = useState(false);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be denied; the URL bar is still the fallback.
      setNotice({ ok: false, message: "Could not copy — copy the address bar instead." });
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    const result = await importBuildFile(store, file);
    setNotice({ ok: result.ok, message: result.message });
    setTimeout(() => setNotice(null), 5000);
  };

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.brand}>Kumitate</span>

        <input
          className={styles.title}
          value={title}
          onChange={(event) => onRetitle(event.target.value)}
          aria-label="Build title"
          spellCheck={false}
        />

        <span className={styles.status} data-status={status}>
          <span className={styles.dot} aria-hidden="true" />
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className={styles.right}>
        <div className={styles.people} aria-label="People in this room">
          <span
            className={styles.avatar}
            style={{ background: identity.color }}
            title={`${identity.name} (you)`}
          >
            {initials(identity.name)}
          </span>
          {peers.map((peer) => (
            <span
              key={peer.clientId}
              className={styles.avatar}
              style={{ background: peer.user.color }}
              title={peer.user.name}
            >
              {initials(peer.user.name)}
            </span>
          ))}
          <span className={styles.peopleCount}>
            {peers.length + 1} {peers.length === 0 ? "builder" : "builders"}
          </span>
        </div>

        {editingName ? (
          <input
            className={styles.nameInput}
            defaultValue={identity.name}
            autoFocus
            aria-label="Your name"
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next) onRenameIdentity(next);
              setEditingName(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setEditingName(false);
            }}
          />
        ) : (
          <button type="button" className={styles.button} onClick={() => setEditingName(true)}>
            {identity.name}
          </button>
        )}

        <button type="button" className={styles.buttonPrimary} onClick={copyInvite}>
          {copied ? "Link copied" : "Copy invite link"}
        </button>

        <Link className={styles.button} href={`/build/${roomId}/reveal`}>
          Preview reveal
        </Link>

        <button type="button" className={styles.button} onClick={() => downloadBuild(store)}>
          Export
        </button>

        <button type="button" className={styles.button} onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void onPickFile(event.target.files?.[0]);
            // Reset so picking the same file twice still fires a change event.
            event.target.value = "";
          }}
        />
      </div>

      {notice && (
        <p className={notice.ok ? styles.noticeOk : styles.noticeBad} role="status">
          {notice.message}
        </p>
      )}
    </header>
  );
}

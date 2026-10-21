"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROOM_PARAM, newRoomId } from "@/lib/useRoomId";
import styles from "./StartBuildingButton.module.css";

/**
 * Mints a new room id and navigates into it.
 *
 * Room ids are generated client-side: a room needs no server record to exist, it springs into
 * being the first time someone connects to that name.
 */
export function StartBuildingButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className={styles.button}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        router.push(`/build/?${ROOM_PARAM}=${newRoomId()}`);
      }}
    >
      {busy ? "Opening room…" : "Start building"}
    </button>
  );
}

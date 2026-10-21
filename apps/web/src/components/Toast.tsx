"use client";

import styles from "./Toast.module.css";

/** A brief, non-blocking message over the scene. */
export function Toast({ message }: { message: string }) {
  return (
    <p className={styles.toast} role="status" aria-live="polite">
      {message}
    </p>
  );
}

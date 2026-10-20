"use client";

import {
  PALETTE,
  getColorOrDefault,
  partsByCategory,
  type PartId,
  type ColorCode,
} from "@kumitate/brick-core";
import { useUiStore } from "@/lib/uiStore";
import { PartPreview } from "./PartPreview";
import styles from "./Toolbar.module.css";

const CATEGORY_LABELS: Record<string, string> = {
  brick: "Bricks",
  plate: "Plates",
  tile: "Tiles",
  slope: "Slopes",
};

export function Toolbar({
  brickCount,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  brickCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const part = useUiStore((s) => s.part);
  const color = useUiStore((s) => s.color);
  const rot = useUiStore((s) => s.rot);
  const setPart = useUiStore((s) => s.setPart);
  const setColor = useUiStore((s) => s.setColor);
  const rotate = useUiStore((s) => s.rotate);

  const swatch = getColorOrDefault(color).hex;
  const groups = partsByCategory();

  return (
    <div className={styles.bar}>
      <div className={styles.parts}>
        {groups.map(({ category, parts }) => (
          <div key={category} className={styles.group}>
            <span className={styles.groupLabel}>{CATEGORY_LABELS[category] ?? category}</span>
            <div className={styles.groupItems}>
              {parts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={p.id === part ? `${styles.part} ${styles.partActive}` : styles.part}
                  onClick={() => setPart(p.id as PartId)}
                  title={`${p.name} (${p.id})`}
                  aria-label={p.name}
                  aria-pressed={p.id === part}
                >
                  <PartPreview part={p} color={swatch} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.right}>
        <div className={styles.group}>
          <span className={styles.groupLabel}>Colour</span>
          <div className={styles.swatches}>
            {PALETTE.map((c) => (
              <button
                key={c.code}
                type="button"
                className={
                  c.code === color ? `${styles.swatch} ${styles.swatchActive}` : styles.swatch
                }
                style={{ background: c.hex }}
                onClick={() => setColor(c.code as ColorCode)}
                title={c.name}
                aria-label={c.name}
                aria-pressed={c.code === color}
              />
            ))}
          </div>
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Actions</span>
          <div className={styles.groupItems}>
            <button type="button" className={styles.action} onClick={rotate} title="Rotate (R)">
              Rotate <kbd>R</kbd>
              <span className={styles.rotValue}>{rot * 90}&deg;</span>
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl/Cmd+Z)"
            >
              Undo
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Shift+Ctrl/Cmd+Z)"
            >
              Redo
            </button>
            <span className={styles.count}>
              {brickCount} {brickCount === 1 ? "brick" : "bricks"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

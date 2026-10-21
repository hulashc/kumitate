/**
 * Local, non-shared UI state.
 *
 * Anything in here is private to this tab — which part and colour the toolbar has selected, how
 * the next brick is turned. Build state never lives here; that belongs to the Yjs doc
 * (PLAN.md principle 1).
 */

import { create } from "zustand";
import {
  DEFAULT_COLOR,
  DEFAULT_PART,
  type ColorCode,
  type PartId,
  type Rotation,
  nextRotation,
} from "@kumitate/brick-core";

export type UiState = {
  part: PartId;
  color: ColorCode;
  rot: Rotation;
  /**
   * Template armed for stamping, or null for ordinary brick placement.
   *
   * Picking a part cancels it — the two are the same gesture (click in the scene) and arming
   * both at once would be ambiguous.
   */
  template: string | null;
  setPart: (part: PartId) => void;
  setColor: (color: ColorCode) => void;
  setRot: (rot: Rotation) => void;
  rotate: () => void;
  setTemplate: (template: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  part: DEFAULT_PART,
  color: DEFAULT_COLOR,
  rot: 0,
  template: null,
  setPart: (part) => set({ part, template: null }),
  setColor: (color) => set({ color }),
  setRot: (rot) => set({ rot }),
  rotate: () => set((state) => ({ rot: nextRotation(state.rot) })),
  setTemplate: (template) => set({ template }),
}));

import { RoomRevealClient } from "@/components/RoomRevealClient";

export const metadata = {
  title: "Kumitate — reveal",
};

/** Watch a room's build assemble itself. Room comes from `?room=`. */
export default function RevealPage() {
  return <RoomRevealClient />;
}

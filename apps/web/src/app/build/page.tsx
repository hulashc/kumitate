import { BuilderClient } from "@/components/BuilderClient";

export const metadata = {
  title: "Kumitate — building",
};

/**
 * The builder. The room is in `?room=`, read on the client — see `useRoomId` for why a query
 * string rather than a path segment.
 */
export default function BuildPage() {
  return <BuilderClient />;
}

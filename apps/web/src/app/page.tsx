import Link from "next/link";
import { StartBuildingButton } from "@/components/StartBuildingButton";
import styles from "./page.module.css";

export default function LandingPage() {
  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <h1 className={styles.title}>Kumitate</h1>
        <p className={styles.tagline}>
          A 3D brick builder in your browser. Start a room, share the link, and build together in
          real time.
        </p>

        <StartBuildingButton />

        <ul className={styles.hints}>
          <li>
            <strong>Click</strong> to place a brick, <strong>right-click</strong> to remove one
          </li>
          <li>
            <strong>R</strong> rotates, <strong>Ctrl/Cmd+Z</strong> undoes only your own bricks
          </li>
          <li>
            <strong>Left-drag</strong> orbits, <strong>right-drag</strong> pans,{" "}
            <strong>scroll</strong> zooms
          </li>
        </ul>

        <p className={styles.footnote}>
          Kumitate (組み立て) means &ldquo;assembly&rdquo;. Not affiliated with any toy
          manufacturer. Part geometry follows the <Link href="https://www.ldraw.org/">LDraw</Link>{" "}
          standard.
        </p>
      </div>
    </main>
  );
}

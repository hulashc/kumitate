"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Canvas, useFrame } from "@react-three/fiber";
import { BASEPLATE_SIZE, type Brick } from "@kumitate/brick-core";
import { RevealScene, revealDuration } from "./RevealScene";
import styles from "./Reveal.module.css";

/** Pause after the last brick lands before the letter appears. */
const LETTER_DELAY_SECONDS = 0.8;

/** Advances the shared clock each frame. Lives inside the Canvas so it gets the render loop. */
function Clock({
  clock,
  onTick,
}: {
  clock: { elapsed: number };
  onTick: (elapsed: number) => void;
}) {
  useFrame((_, delta) => {
    clock.elapsed += delta;
    onTick(clock.elapsed);
  });
  return null;
}

export type RevealProps = {
  bricks: Brick[];
  title: string;
  /** The message shown once the build has assembled. Omit for a plain preview. */
  letter?: string;
  from?: string;
  baseplateSize?: number;
  /** Where "back" goes, if anywhere. */
  backHref?: string;
  backLabel?: string;
};

/**
 * The gift reveal: the build assembles itself, then the letter appears.
 *
 * The animation is driven by a single elapsed-seconds clock held in a ref, not React state —
 * re-rendering the tree sixty times a second to move some bricks would be absurd. Only the two
 * things that genuinely change for the DOM (whether the letter is up, whether we are done) are
 * state.
 */
export function Reveal({
  bricks,
  title,
  letter,
  from,
  baseplateSize = BASEPLATE_SIZE,
  backHref,
  backLabel = "Back",
}: RevealProps) {
  const clock = useRef({ elapsed: 0 }).current;
  const [showLetter, setShowLetter] = useState(false);
  const [spin, setSpin] = useState(true);
  const [skipped, setSkipped] = useState(false);

  const duration = useMemo(() => revealDuration(bricks), [bricks]);

  const onTick = useCallback(
    (elapsed: number) => {
      if (!showLetter && elapsed >= duration + LETTER_DELAY_SECONDS) setShowLetter(true);
    },
    [duration, showLetter],
  );

  /** Jump straight to the finished build. */
  const skip = useCallback(() => {
    clock.elapsed = duration + LETTER_DELAY_SECONDS;
    setShowLetter(true);
    setSkipped(true);
  }, [clock, duration]);

  const replay = useCallback(() => {
    clock.elapsed = 0;
    setShowLetter(false);
    setSkipped(false);
    setSpin(true);
  }, [clock]);

  // Respect a reduced-motion preference: show the finished build rather than animating to it.
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    clock.elapsed = duration + LETTER_DELAY_SECONDS;
    setSpin(false);
    setShowLetter(true);
    setSkipped(true);
  }, [clock, duration]);

  const empty = bricks.length === 0;

  return (
    <div className={styles.root}>
      <div className={styles.canvasWrap} onPointerDown={() => setSpin(false)}>
        <Canvas shadows dpr={[1, 2]} camera={{ position: [26, 20, 26], fov: 42 }}>
          <color attach="background" args={["#0B121A"]} />
          <fog attach="fog" args={["#0B121A", baseplateSize * 1.7, baseplateSize * 3.6]} />
          <Clock clock={clock} onTick={onTick} />
          <RevealScene
            bricks={bricks}
            baseplateSize={baseplateSize}
            clock={clock}
            spin={spin && !showLetter}
          />
        </Canvas>
      </div>

      <header className={styles.header}>
        {backHref && (
          <Link className={styles.back} href={backHref}>
            ← {backLabel}
          </Link>
        )}
        <span className={styles.title}>{title}</span>
      </header>

      {empty && (
        <p className={styles.emptyNote}>This build is empty — there is nothing to reveal yet.</p>
      )}

      {!empty && !showLetter && (
        <button type="button" className={styles.skip} onClick={skip}>
          Skip
        </button>
      )}

      {showLetter && (
        <div className={styles.letterLayer}>
          {letter && (
            <article className={styles.letter}>
              <p className={styles.letterBody}>{letter}</p>
              {from && <p className={styles.letterFrom}>— {from}</p>}
            </article>
          )}
          <button type="button" className={styles.replay} onClick={replay}>
            {skipped ? "Play the reveal" : "Watch again"}
          </button>
        </div>
      )}
    </div>
  );
}

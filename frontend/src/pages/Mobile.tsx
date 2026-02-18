import React, { useEffect, useState } from "react";
import Section from "../components/Section";

type SwipeDirection = "left" | "right" | "up" | "down";

export default function Mobile() {
  const [gesture, setGesture] = useState("none");
  const [orientation, setOrientation] = useState("portrait");
  const [refreshCount, setRefreshCount] = useState(0);
  const [pressing, setPressing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const updateOrientation = () => {
      setOrientation(window.innerWidth > window.innerHeight ? "landscape" : "portrait");
    };
    updateOrientation();
    window.addEventListener("resize", updateOrientation);
    return () => window.removeEventListener("resize", updateOrientation);
  }, []);

  const handlePointerDown = (event: React.PointerEvent) => {
    setStart({ x: event.clientX, y: event.clientY });
    setPressing(true);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    let direction: SwipeDirection = "right";
    if (absX > absY) {
      direction = dx > 0 ? "right" : "left";
    } else {
      direction = dy > 0 ? "down" : "up";
    }
    if (Math.max(absX, absY) > 40) {
      setGesture(`swipe-${direction}`);
    }
    setPressing(false);
    setStart(null);
  };

  return (
    <div className="space-y-6">
      <Section title="Orientation & Viewport">
        <div className="text-sm" data-testid="orientation-value">
          Orientation: {orientation}
        </div>
        <div className="text-xs text-black/60">
          Resize the window or rotate the device emulator.
        </div>
      </Section>

      <Section title="Swipe & Drag Surface">
        <div
          className={`h-40 rounded border border-black/20 bg-white/70 flex items-center justify-center text-sm ${
            pressing ? "ring-2 ring-ember" : ""
          }`}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          data-testid="gesture-surface"
          data-playwright="gesture-surface"
          data-selenium="gesture-surface"
        >
          Swipe here
        </div>
        <div className="mt-2 text-sm" data-testid="gesture-result">
          Last gesture: {gesture}
        </div>
      </Section>

      <Section title="Long Press">
        <button
          className="rounded border border-black/20 px-3 py-2 text-sm"
          onPointerDown={() => setPressing(true)}
          onPointerUp={() => setPressing(false)}
          onContextMenu={(event) => {
            event.preventDefault();
            setGesture("long-press");
          }}
          data-testid="long-press"
        >
          Press and hold
        </button>
        <div className="mt-2 text-xs text-black/60">
          Long press triggers context menu behavior on mobile.
        </div>
      </Section>

      <Section title="Pull-to-Refresh">
        <div className="rounded border border-black/10 p-3 text-sm">
          Refresh count: <span data-testid="refresh-count">{refreshCount}</span>
        </div>
        <button
          className="mt-2 rounded bg-ember px-3 py-2 text-white"
          onClick={() => setRefreshCount((prev) => prev + 1)}
          data-testid="refresh-trigger"
        >
          Simulate refresh
        </button>
      </Section>
    </div>
  );
}

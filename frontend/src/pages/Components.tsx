import React, { useEffect, useRef, useState } from "react";
import Section from "../components/Section";

export default function Components() {
  const [count, setCount] = useState(30);
  const [toasts, setToasts] = useState<string[]>([]);
  const [selectedBar, setSelectedBar] = useState("none");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 400, 200);
    ctx.fillStyle = "#1f6feb";
    ctx.fillRect(20, 20, 120, 60);
    ctx.fillStyle = "#f45b2a";
    ctx.beginPath();
    ctx.arc(260, 80, 40, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const showToast = () => {
    const id = `Toast ${Date.now()}`;
    setToasts((prev) => [id, ...prev].slice(0, 3));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t !== id)), 2500);
  };

  return (
    <div className="space-y-6">
      <Section title="Virtualized List">
        <div className="h-48 overflow-auto rounded border border-black/10 p-2" data-testid="virtual-list">
          {Array.from({ length: 1000 }).map((_, index) => (
            <div key={index} className="py-1 text-sm">
              Item #{index + 1}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Infinite Scroll">
        <div className="space-y-2" data-testid="infinite-scroll">
          {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="rounded border border-black/10 p-2 text-sm">
              Page item {index + 1}
            </div>
          ))}
          <button
            className="rounded bg-ember px-3 py-2 text-white"
            onClick={() => setCount((prev) => prev + 10)}
            data-testid="load-more"
          >
            Load more
          </button>
        </div>
      </Section>

      <Section title="SVG Data Visualization">
        <svg viewBox="0 0 200 100" className="w-full h-40" data-testid="svg-chart">
          <rect x="10" y="40" width="40" height="50" fill="#1f6feb" onClick={() => setSelectedBar("A")} />
          <rect x="70" y="20" width="40" height="70" fill="#0f766e" onClick={() => setSelectedBar("B")} />
          <rect x="130" y="30" width="40" height="60" fill="#f45b2a" onClick={() => setSelectedBar("C")} />
        </svg>
        <div className="text-sm">Selected bar: {selectedBar}</div>
      </Section>

      <Section title="Canvas Drawing Board">
        <canvas ref={canvasRef} width={400} height={200} className="border border-black/10 rounded" data-testid="canvas" />
      </Section>

      <Section title="Context Menu">
        <div
          className="rounded border border-black/10 p-6 text-sm"
          onContextMenu={(event) => {
            event.preventDefault();
            alert("Context menu opened");
          }}
          data-testid="context-zone"
        >
          Right click here
        </div>
      </Section>

      <Section title="Toasts & Tooltips">
        <div className="flex items-center gap-4">
          <button className="rounded bg-tide px-3 py-2 text-white" onClick={showToast} data-testid="toast-btn">
            Trigger Toast
          </button>
          <div className="relative group">
            <span className="underline">Hover tooltip</span>
            <div className="absolute left-0 mt-2 w-40 rounded bg-black text-white p-2 text-xs opacity-0 transition-opacity delay-300 group-hover:opacity-100">
              Delayed tooltip content
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {toasts.map((toast) => (
            <div key={toast} className="rounded bg-ember/10 p-2 text-sm" data-testid="toast-item">
              {toast}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

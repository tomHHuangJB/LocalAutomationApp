import React, { useEffect, useState } from "react";
import Section from "../components/Section";

export default function Performance() {
  const [workerResult, setWorkerResult] = useState("pending");

  useEffect(() => {
    performance.mark("lab-start");
    setTimeout(() => performance.mark("lab-end"), 500);
    const blob = new Blob(
      ["self.onmessage = (e) => { postMessage({ result: e.data * 2 }); }"],
      { type: "text/javascript" }
    );
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = (event) => {
      setWorkerResult(`Result: ${event.data.result}`);
      worker.terminate();
    };
    worker.postMessage(21);
    return () => worker.terminate();
  }, []);

  return (
    <div className="space-y-6">
      <Section title="Large DOM Tree">
        <div className="grid grid-cols-4 gap-2 text-xs" data-testid="large-dom">
          {Array.from({ length: 10000 }).map((_, index) => (
            <span key={index} className="rounded bg-white/70 p-1 border border-black/5">
              {index}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Animation & Transitions">
        <div className="flex gap-4">
          <div className="h-16 w-16 animate-bounce rounded-full bg-ember" />
          <div className="h-16 w-16 animate-pulse rounded-full bg-tide" />
        </div>
        <button
          className="mt-3 rounded border border-black/20 px-3 py-2 text-sm"
          onClick={() => {
            const start = performance.now();
            while (performance.now() - start < 200) {
              // intentional blocking
            }
          }}
          data-testid="block-main-thread"
        >
          Block main thread (200ms)
        </button>
      </Section>

      <Section title="Lazy Loaded Images">
        <div className="grid md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <img
              key={index}
              loading="lazy"
              className="h-32 w-full rounded object-cover"
              src={`data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'><rect width='400' height='200' fill='%23eef2ff'/><text x='20' y='110' font-size='20' fill='%231c1b22'>Lazy ${index + 1}</text></svg>`}
              alt="lazy"
            />
          ))}
        </div>
      </Section>

      <Section title="Resource Timing Marks">
        <div className="text-sm">Performance marks available in performance entries.</div>
      </Section>

      <Section title="Web Workers">
        <div className="text-sm" data-testid="worker-result">
          {workerResult}
        </div>
      </Section>

      <Section title="CPU Throttling Indicator">
        <div className="rounded border border-black/10 p-3 text-sm" data-testid="cpu-indicator">
          Simulated CPU throttle: 4x
        </div>
      </Section>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import Section from "../components/Section";

export default function A11y() {
  const [announcement, setAnnouncement] = useState("Ready");
  const [modalOpen, setModalOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (modalOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [modalOpen]);

  return (
    <div className="space-y-6">
      <Section title="Screen Reader Announcements">
        <div aria-live="polite" data-testid="aria-live" className="text-sm">
          {announcement}
        </div>
        <button
          className="mt-2 rounded border border-black/20 px-3 py-2"
          onClick={() => setAnnouncement(`Update at ${new Date().toLocaleTimeString()}`)}
          data-testid="announce-btn"
        >
          Announce update
        </button>
      </Section>

      <Section title="Keyboard Trap">
        <div className="rounded border border-black/10 p-4" data-testid="keyboard-trap">
          <button className="rounded border border-black/20 px-3 py-1">Trap Start</button>
          <button className="rounded border border-black/20 px-3 py-1 ml-2">Trap End</button>
        </div>
      </Section>

      <Section title="Focus Managed Modal">
        <button className="rounded bg-ember px-3 py-2 text-white" onClick={() => setModalOpen(true)}>
          Open modal
        </button>
        {modalOpen && (
          <div
            ref={modalRef}
            tabIndex={-1}
            className="mt-3 rounded border border-black/20 bg-white p-4"
            role="dialog"
            aria-modal="true"
            data-testid="focus-modal"
          >
            <div className="text-sm">Focus should land here.</div>
            <button className="mt-2 rounded border border-black/20 px-3 py-1" onClick={() => setModalOpen(false)}>
              Close
            </button>
          </div>
        )}
      </Section>

      <Section title="High Contrast & Reduced Motion">
        <div className="flex gap-3 text-sm">
          <button className="rounded border border-black/20 px-3 py-1" data-testid="high-contrast">
            Toggle high contrast
          </button>
          <button className="rounded border border-black/20 px-3 py-1" data-testid="reduced-motion">
            Toggle reduced motion
          </button>
        </div>
      </Section>
    </div>
  );
}

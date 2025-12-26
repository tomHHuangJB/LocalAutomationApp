import React, { useEffect, useRef, useState } from "react";
import Section from "../components/Section";

export default function Forms() {
  const [showExtra, setShowExtra] = useState(false);
  const [steps, setSteps] = useState(1);
  const [items, setItems] = useState(["Primary"]);
  const shadowHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shadowHostRef.current) return;
    const host = shadowHostRef.current;
    const root = host.attachShadow({ mode: "open" });
    const wrapper = document.createElement("div");
    wrapper.setAttribute("style", "display:flex; gap:8px; align-items:center; font-family:inherit;");
    const label = document.createElement("label");
    label.textContent = "Shadow DOM Field";
    const input = document.createElement("input");
    input.setAttribute("data-testid", "shadow-input");
    input.setAttribute("placeholder", "Shadow input");
    input.setAttribute("style", "border:1px solid #ccc; padding:6px; border-radius:6px;");
    wrapper.append(label, input);
    root.appendChild(wrapper);
    return () => {
      root.innerHTML = "";
    };
  }, []);

  return (
    <div className="space-y-6">
      <Section title="Conditional Fields">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showExtra}
            onChange={(event) => setShowExtra(event.target.checked)}
            data-testid="toggle-extra"
          />
          Show extra fields
        </label>
        {showExtra && (
          <input
            className="mt-3 w-full rounded border border-black/20 p-2"
            placeholder="Conditional field"
            data-testid="conditional-input"
          />
        )}
      </Section>

      <Section title="Multi-Step Wizard">
        <div className="flex items-center gap-3 text-sm">
          <button
            className="rounded border border-black/20 px-3 py-1"
            onClick={() => setSteps((prev) => Math.max(1, prev - 1))}
            data-testid="wizard-prev"
          >
            Prev
          </button>
          <div data-testid="wizard-step">Step {steps} of 3</div>
          <button
            className="rounded border border-black/20 px-3 py-1"
            onClick={() => setSteps((prev) => Math.min(3, prev + 1))}
            data-testid="wizard-next"
          >
            Next
          </button>
        </div>
      </Section>

      <Section title="Dynamic Form Arrays">
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={`${item}-${index}`} className="flex gap-2">
              <input
                className="flex-1 rounded border border-black/20 p-2"
                defaultValue={item}
                data-testid={`array-item-${index}`}
              />
              <button
                className="rounded border border-black/20 px-3"
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                data-testid={`array-remove-${index}`}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            className="rounded bg-ember px-3 py-2 text-white"
            onClick={() => setItems((prev) => [...prev, `Item ${prev.length + 1}`])}
            data-testid="array-add"
          >
            Add Field
          </button>
        </div>
      </Section>

      <Section title="Rich Text Editor (iframe)">
        <iframe
          title="rich-text"
          className="h-40 w-full rounded border border-black/20"
          srcDoc="<html><body contenteditable='true' style='font-family:Arial;padding:12px;'>Edit content here</body></html>"
          data-testid="rich-text-iframe"
        />
      </Section>

      <Section title="File Upload">
        <div
          className="rounded-lg border-2 border-dashed border-black/20 p-6 text-center text-sm"
          data-testid="drag-drop-zone"
        >
          Drag and drop files here
        </div>
        <div className="mt-3 h-2 w-full rounded bg-black/10">
          <div className="h-2 w-1/3 rounded bg-ember" data-testid="upload-progress" />
        </div>
      </Section>

      <Section title="Specialized Inputs">
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <label>
            Credit card
            <input className="mt-1 w-full rounded border border-black/20 p-2" placeholder="•••• •••• •••• 4242" />
          </label>
          <label>
            Phone
            <input className="mt-1 w-full rounded border border-black/20 p-2" placeholder="+1 (555) 555-5555" />
          </label>
          <label>
            Password strength
            <input className="mt-1 w-full rounded border border-black/20 p-2" type="password" placeholder="StrongPass!" />
          </label>
          <label>
            Color picker
            <input className="mt-1 w-full" type="color" data-testid="color-picker" />
          </label>
          <label>
            Range slider
            <div className="mt-1 flex items-center gap-2">
              <input className="w-full" type="range" min="0" max="100" data-testid="range-min" />
              <input className="w-full" type="range" min="0" max="100" data-testid="range-max" />
            </div>
          </label>
          <label>
            Date/time
            <input className="mt-1 w-full rounded border border-black/20 p-2" type="datetime-local" data-testid="datetime-picker" />
          </label>
        </div>
      </Section>

      <Section title="Shadow DOM Elements">
        <div ref={shadowHostRef} className="rounded border border-black/10 p-4" data-testid="shadow-host" />
      </Section>
    </div>
  );
}

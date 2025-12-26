import React, { useMemo, useState } from "react";
import Section from "../components/Section";

const locales = ["en-US", "es-ES", "fr-FR", "ar"] as const;

export default function I18n() {
  const [locale, setLocale] = useState<(typeof locales)[number]>("en-US");
  const [timezone, setTimezone] = useState("UTC");
  const count = 3;
  const isRtl = locale === "ar";

  const formatted = useMemo(() => {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(12345.67);
  }, [locale]);

  const plural = useMemo(() => {
    const rule = new Intl.PluralRules(locale).select(count);
    return rule === "one" ? `${count} item` : `${count} items`;
  }, [locale, count]);

  return (
    <div className="space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <Section title="Locale Switching">
        <select
          className="rounded border border-black/20 p-2 text-sm"
          value={locale}
          onChange={(event) => setLocale(event.target.value as (typeof locales)[number])}
          data-testid="locale-select"
        >
          {locales.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
        <div className="mt-3 text-sm">Currency example: {formatted}</div>
        <div className="text-sm">Pluralization: {plural}</div>
        <div className="text-sm text-black/60">Missing translation: [cta.checkout]</div>
      </Section>

      <Section title="Timezone Widgets">
        <select
          className="rounded border border-black/20 p-2 text-sm"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          data-testid="timezone-select"
        >
          <option value="UTC">UTC</option>
          <option value="America/Los_Angeles">America/Los_Angeles</option>
          <option value="Asia/Tokyo">Asia/Tokyo</option>
        </select>
        <div className="mt-3 text-sm">Selected TZ: {timezone}</div>
      </Section>
    </div>
  );
}

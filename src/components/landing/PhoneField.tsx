"use client";

import { useMemo, useState } from "react";
import { useLocale, useT } from "@/lib/i18n/client";

/**
 * Phone number with a country prefix picker. The flag is the country's regional-indicator glyph (the one place
 * the UI shows an emoji, CLAUDE.md §4 notwithstanding: it is the meaning of the row, not decoration; on systems
 * without flag glyphs the two letters show instead). Country names come from the browser in the UI language.
 */

const COUNTRIES: [string, string][] = [
  ["FR", "33"], ["ES", "34"], ["GB", "44"], ["DE", "49"], ["IT", "39"], ["PT", "351"], ["BE", "32"], ["NL", "31"], ["CH", "41"], ["LU", "352"],
  ["AT", "43"], ["IE", "353"], ["PL", "48"], ["SE", "46"], ["DK", "45"], ["NO", "47"], ["FI", "358"], ["GR", "30"], ["CZ", "420"], ["RO", "40"],
  ["HU", "36"], ["AD", "376"], ["MC", "377"], ["MA", "212"], ["DZ", "213"], ["TN", "216"], ["SN", "221"], ["CI", "225"], ["CM", "237"], ["US", "1"],
  ["CA", "1"], ["MX", "52"], ["AR", "54"], ["CL", "56"], ["CO", "57"], ["PE", "51"], ["BR", "55"], ["IN", "91"], ["AU", "61"], ["JP", "81"],
];
const DEFAULT: Record<string, string> = { fr: "FR", es: "ES", en: "GB" };

const flag = (code: string) => String.fromCodePoint(0x1f1e6 + code.charCodeAt(0) - 65, 0x1f1e6 + code.charCodeAt(1) - 65);

export default function PhoneField({ value, onChange, fieldClass, labelClass, label }: { value: string; onChange: (full: string) => void; fieldClass: string; labelClass: string; label: React.ReactNode }) {
  const t = useT();
  const { locale, tag } = useLocale();
  const [country, setCountry] = useState(DEFAULT[locale] || "FR");
  const [number, setNumber] = useState(value.replace(/^\+\d+\s*/, ""));
  const names = useMemo(() => {
    try {
      const dn = new Intl.DisplayNames([tag], { type: "region" });
      return (c: string) => dn.of(c) || c;
    } catch {
      return (c: string) => c;
    }
  }, [tag]);
  const dial = COUNTRIES.find(([c]) => c === country)?.[1] || "33";
  const emit = (c: string, n: string) => {
    const d = COUNTRIES.find(([x]) => x === c)?.[1] || "33";
    onChange(n.trim() ? `+${d} ${n.trim()}` : "");
  };
  return (
    <div className={labelClass}>
      <label htmlFor="pilot-phone">{label}</label>
      <div className="flex gap-2">
        <select
          id="pilot-country"
          aria-label={t("landing.pilotForm.country")}
          className={`${fieldClass} !w-auto max-w-[190px] flex-shrink-0 !px-2.5`}
          value={country}
          onChange={(e) => { setCountry(e.target.value); emit(e.target.value, number); }}
        >
          {COUNTRIES.map(([c, d]) => (
            <option key={c} value={c}>{flag(c)} {names(c)} +{d}</option>
          ))}
        </select>
        <input
          id="pilot-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          className={`${fieldClass} min-w-0`}
          placeholder={t("landing.pilotForm.phonePlaceholder")}
          value={number}
          onChange={(e) => { setNumber(e.target.value); emit(country, e.target.value); }}
          autoComplete="tel-national"
          aria-describedby="pilot-dial"
        />
      </div>
      <span id="pilot-dial" className="sr-only">+{dial}</span>
    </div>
  );
}

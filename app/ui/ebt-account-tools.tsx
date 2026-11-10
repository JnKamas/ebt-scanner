"use client";

import { useEffect, useId, useState } from "react";
import { EbtCity, EbtComment, EbtJourney, EbtProfile, Receipt, submissionMessage, submissionStatus } from "../lib/ebt";

function useEbtData<T>(url: string | null) {
  const [state, setState] = useState<{ url: string | null; data?: T; error?: string; loading: boolean }>({ url: null, loading: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    setState({ url, loading: true });
    void fetch(url, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "EBT could not be reached.");
      if (!controller.signal.aborted) setState({ url, data: body, loading: false });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ url, error: error instanceof Error ? error.message : "EBT could not be reached.", loading: false });
    });
    return () => controller.abort();
  }, [url, attempt]);
  // Never show a previous location's suggestions while the new request starts.
  return { ...(state.url === url ? state : { loading: Boolean(url), data: undefined as T | undefined, error: undefined as string | undefined }), retry: () => setAttempt((value) => value + 1) };
}

function LoadStatus({ loading, error, retry }: { loading: boolean; error?: string; retry: () => void }) {
  return <>{loading && <p className="api-status" role="status">Loading from EBT…</p>}{error && <p className="api-status" role="status">{error} <button type="button" onClick={retry}>Retry</button></p>}</>;
}

type Location = { city: string; country: string; postalCode: string };

type Suggestion = { value: string; label: string; detail?: string; choose: () => void };

function SuggestedField({ id, label, value, placeholder, autoComplete, multiline, suggestions, loading, error, retry, onChange }: {
  id: string; label: string; value: string; placeholder: string; autoComplete?: string; multiline?: boolean;
  suggestions: Suggestion[]; loading: boolean; error?: string; retry: () => void; onChange: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const matches = suggestions.filter((item) => !filtering || `${item.label} ${item.detail || ""}`.toLocaleLowerCase().includes(value.toLocaleLowerCase())).slice(0, 5);
  const listId = useId();
  const shared = {
    id, value, placeholder, autoComplete: autoComplete || "off",
    onFocus: () => { setFocused(true); setFiltering(false); },
    onClick: () => { setFocused(true); setFiltering(false); },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setFocused(true); setFiltering(true); onChange(event.target.value); },
    onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Escape") { setFocused(false); event.stopPropagation(); } },
    "aria-describedby": focused && (matches.length || loading || error) ? listId : undefined,
  };
  return <div className={multiline ? "comment suggested-field" : "suggested-field"} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  }}>
    <label htmlFor={id}>{label}{multiline && <> <span>optional</span></>}</label>
    {multiline ? <textarea {...shared} rows={2} /> : <input {...shared} />}
    {focused && <div id={listId} className="field-suggestions" onPointerDown={(event) => {
      // Keep the input focused until a suggestion or Retry click completes.
      // Some browsers blur it without focusing the button, hiding it too soon.
      if ((event.target as HTMLElement).closest("button")) event.preventDefault();
    }}>
      {matches.length > 0 && <ul aria-label={`${label} suggestions`}>{matches.map((item) => <li key={item.value}><button type="button" onClick={() => { item.choose(); setFocused(false); }}><span>{item.label}</span>{item.detail && <small>{item.detail}</small>}</button></li>)}</ul>}
      <LoadStatus loading={loading} error={error} retry={retry} />
    </div>}
  </div>;
}

function useDebouncedQuery(value: string) {
  const [query, setQuery] = useState("");
  useEffect(() => { const timer = setTimeout(() => setQuery(value), 450); return () => clearTimeout(timer); }, [value]);
  return query === value ? query : "";
}

export function EntryLocationFields({ signedIn, location, comment, onChange, onChoose }: {
  signedIn: boolean; location: Location; comment: string;
  onChange: (field: "city" | "country" | "postalCode" | "comment", value: string) => void;
  onChoose: (location: Location) => void;
}) {
  const cities = useEbtData<{ data: EbtCity[] }>(signedIn ? "/api/ebt/suggestions?kind=cities" : null);
  const ready = signedIn && Boolean(location.city.trim() && location.country.trim());
  const query = useDebouncedQuery(ready ? new URLSearchParams({ city: location.city, country: location.country }).toString() : "");
  const commentQuery = useDebouncedQuery(ready ? new URLSearchParams({ city: location.city, country: location.country, zip: location.postalCode }).toString() : "");
  const zips = useEbtData<{ data: string[] }>(query ? `/api/ebt/suggestions?kind=zipcodes&${query}` : null);
  const comments = useEbtData<{ data: EbtComment[] }>(commentQuery ? `/api/ebt/suggestions?kind=comments&${commentQuery}` : null);
  return <>
    <div className="location-card">
      <label>Country<input value={location.country} onChange={(event) => onChange("country", event.target.value)} placeholder="Slovakia" autoComplete="country-name" /></label>
      <div className="two-fields">
        <SuggestedField id="entry-city" label="City" value={location.city} placeholder="Bratislava" autoComplete="address-level2" onChange={(value) => onChange("city", value)} {...cities} suggestions={(cities.data?.data || []).map((city) => ({ value: `${city.country}/${city.city}`, label: city.city, detail: [city.country, city.top_zipcode].filter(Boolean).join(" · "), choose: () => onChoose({ city: city.city, country: city.country, postalCode: city.top_zipcode }) }))} />
        <SuggestedField id="entry-postcode" label="Postal code" value={location.postalCode} placeholder="811 01" autoComplete="postal-code" onChange={(value) => onChange("postalCode", value)} {...zips} suggestions={(zips.data?.data || []).filter(Boolean).map((zip) => ({ value: zip, label: zip, choose: () => onChange("postalCode", zip) }))} />
      </div>
    </div>
    <SuggestedField id="entry-comment" label="Comment" value={comment} placeholder="e.g. ATM, supermarket" multiline onChange={(value) => onChange("comment", value)} {...comments} suggestions={(comments.data?.data || []).filter((item) => item.comment).map((item) => ({ value: item.comment, label: item.comment, detail: `${item.amount} notes`, choose: () => onChange("comment", item.comment) }))} />
  </>;
}

function EbtMap({ url, label, expanded = false }: { url: string | null; label: string; expanded?: boolean }) {
  if (!url) return null;
  if (expanded) return <figure className="ebt-map"><figcaption>{label}</figcaption><img src={url} alt={label} loading="lazy" referrerPolicy="no-referrer" /></figure>;
  return <details className="ebt-map"><summary>{label}</summary><a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={label} loading="lazy" referrerPolicy="no-referrer" /></a></details>;
}

export function PersonalProfile({ onTotals }: { onTotals: (notes: number, hits: number) => void }) {
  const result = useEbtData<{ profile: EbtProfile }>("/api/ebt/profile");
  const profile = result.data?.profile;
  useEffect(() => { if (profile) onTotals(profile.total_notes, profile.total_hits); }, [profile, onTotals]);
  return <div className="personal-profile"><LoadStatus {...result} />{profile && <><p>Tracking since {profile.join_date || "an unknown date"}</p>
    <EbtMap url={profile.img_url_notes_europe} label="My notes in Europe" /><EbtMap url={profile.img_url_notes_world} label="My notes worldwide" /><EbtMap url={profile.img_url_hits_europe} label="My hit map" />
    {!profile.img_url_notes_europe && !profile.img_url_notes_world && !profile.img_url_hits_europe && <p>Maps are unavailable. Check your map sharing settings on EBT.</p>}
    <button type="button" className="text-button" onClick={result.retry}>Refresh my stats</button></>}</div>;
}

function HitJourney({ id, example }: { id: string; example?: EbtJourney }) {
  const result = useEbtData<{ journey: EbtJourney }>(example ? null : `/api/ebt/journey?id=${encodeURIComponent(id)}`);
  const journey = example ?? result.data?.journey;
  return <div className="hit-journey"><LoadStatus {...result} />{journey && <>
    <p><b>{journey.total_km.toLocaleString()} km</b> over <b>{journey.total_days.toLocaleString()} days</b></p>
    <ol>{journey.steps.map((step) => <li key={step.step_id}><strong>{step.location_name}, {step.country_name}</strong><span>{step.timestamp} · {step.user_name}</span>{step.step_id > 0 && <span>{step.hit_km.toLocaleString()} km · {step.hit_days.toLocaleString()} days since previous entry</span>}{step.comment && <p>{step.comment}</p>}</li>)}</ol>
    <EbtMap url={journey.img_url_europe} label="Journey in Europe" expanded /><EbtMap url={journey.img_url_world} label="Journey worldwide" expanded />
    {!journey.steps.length && <p>Entry details are not available from EBT yet.</p>}
  </>}</div>;
}

export function SubmissionReceipts({ receipts, exampleJourneys }: { receipts: Receipt[]; exampleJourneys?: Record<string, EbtJourney> }) {
  if (!receipts.length) return null;
  const hits = receipts.filter((receipt) => submissionStatus(receipt.result?.status) === 1);
  const details = receipts.filter((receipt) => submissionStatus(receipt.result?.status) !== 0);
  return <section className="submission-receipts" aria-label="Last submission results"><h2>Last submission: {hits.length} {hits.length === 1 ? "hit" : "hits"}</h2>{details.map((receipt) => {
    const id = String(receipt.result?.billId ?? "");
    const hasId = /^\d{1,12}$/.test(id);
    const status = submissionStatus(receipt.result?.status);
    return <article key={receipt.id} className={status === 1 ? "receipt-hit" : ""}><strong>€{receipt.denomination} · {receipt.serial}</strong><p>{submissionMessage(receipt.result)}</p>{status === 1 && (hasId ? <HitJourney id={id} example={exampleJourneys?.[id]} /> : <p>EBT did not provide a note ID, so journey details are unavailable.</p>)}</article>;
  })}</section>;
}

"use client";

import { useEffect, useState } from "react";
import { EbtCity, EbtComment, EbtJourney, EbtProfile, Receipt, submissionMessage } from "../lib/ebt";

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

export function PreviousLocations({ onChoose }: { onChoose: (location: Location) => void }) {
  const result = useEbtData<{ data: EbtCity[] }>("/api/ebt/suggestions?kind=cities");
  const cities = result.data?.data ?? [];
  return <div className="ebt-suggestions"><label htmlFor="previous-location">Your previous EBT locations</label><LoadStatus {...result} />
    {result.data && (cities.length ? <select id="previous-location" value="" onChange={(event) => {
      const city = cities[Number(event.target.value)];
      if (city) onChoose({ city: city.city, country: city.country, postalCode: city.top_zipcode });
    }}><option value="" disabled>Choose a previous location</option>{cities.map((city, index) => <option key={`${city.country}/${city.city}`} value={index}>{city.city}, {city.country}{city.top_zipcode ? ` · ${city.top_zipcode}` : ""}</option>)}</select> : <p className="api-status">No previous locations yet. Enter one below.</p>)}
  </div>;
}

export function LocationSuggestions({ location, onZip, onComment }: { location: Location; onZip: (zip: string) => void; onComment: (comment: string) => void }) {
  const params = new URLSearchParams({ city: location.city, country: location.country });
  const ready = Boolean(location.city.trim() && location.country.trim());
  // Debounce manual entry to avoid requesting each partial city/postcode.
  const [query, setQuery] = useState("");
  const nextQuery = ready ? params.toString() : "";
  const nextCommentQuery = ready ? new URLSearchParams({ ...location, zip: location.postalCode }).toString() : "";
  const [commentQuery, setCommentQuery] = useState("");
  useEffect(() => { const timer = setTimeout(() => setQuery(nextQuery), 450); return () => clearTimeout(timer); }, [nextQuery]);
  useEffect(() => { const timer = setTimeout(() => setCommentQuery(nextCommentQuery), 450); return () => clearTimeout(timer); }, [nextCommentQuery]);
  const zips = useEbtData<{ data: string[] }>(query && query === nextQuery ? `/api/ebt/suggestions?kind=zipcodes&${query}` : null);
  const comments = useEbtData<{ data: EbtComment[] }>(commentQuery && commentQuery === nextCommentQuery ? `/api/ebt/suggestions?kind=comments&${commentQuery}` : null);
  if (!ready) return null;
  return <div className="ebt-suggestions"><LoadStatus {...zips} />
    {Boolean(zips.data?.data.length) && <label>Previously used postcodes<select value="" onChange={(event) => onZip(event.target.value)}><option value="" disabled>Choose a postcode</option>{zips.data!.data.map((zip) => <option key={zip} value={zip}>{zip || "(empty postcode)"}</option>)}</select></label>}
    <LoadStatus {...comments} />
    {comments.data && (comments.data.data.length ? <label>Previous comments for this city and postcode<select value="" onChange={(event) => onComment(event.target.value)}><option value="" disabled>Choose a comment</option>{comments.data.data.map((item) => <option key={item.comment} value={item.comment}>{item.comment || "(empty comment)"} · {item.amount} notes</option>)}</select></label> : <p className="api-status">No previous comments for this city and postcode. You can write one below.</p>)}
  </div>;
}

function EbtMap({ url, label }: { url: string | null; label: string }) {
  if (!url) return null;
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

function HitJourney({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const result = useEbtData<{ journey: EbtJourney }>(open ? `/api/ebt/journey?id=${encodeURIComponent(id)}` : null);
  const journey = result.data?.journey;
  return <div className="hit-journey"><button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide journey" : "Show hit journey"}</button>{open && <><LoadStatus {...result} />{journey && <>
    <p><b>{journey.total_km.toLocaleString()} km</b> over <b>{journey.total_days.toLocaleString()} days</b></p>
    <ol>{journey.steps.map((step) => <li key={step.step_id}><strong>{step.location_name}, {step.country_name}</strong><span>{step.timestamp} · {step.user_name}</span>{step.step_id > 0 && <span>{step.hit_km.toLocaleString()} km · {step.hit_days.toLocaleString()} days since previous entry</span>}{step.comment && <p>{step.comment}</p>}</li>)}</ol>
    <EbtMap url={journey.img_url_europe} label="Journey in Europe" /><EbtMap url={journey.img_url_world} label="Journey worldwide" />
  </>}</>}</div>;
}

export function SubmissionReceipts({ receipts }: { receipts: Receipt[] }) {
  if (!receipts.length) return null;
  return <section className="submission-receipts" aria-label="Last submission results"><h2>Last submission</h2>{receipts.map((receipt) => {
    const id = String(receipt.result?.billId ?? "");
    const hasId = /^\d{1,12}$/.test(id);
    const status = Number(receipt.result?.status);
    return <article key={receipt.id} className={status === 1 ? "receipt-hit" : ""}><strong>€{receipt.denomination} · {receipt.serial}</strong><p>{submissionMessage(receipt.result)}</p>{hasId && <a href={`https://www.eurobilltracker.com/notes/?id=${id}`} target="_blank" rel="noopener noreferrer">Open note on EBT ↗</a>}{status === 1 && hasId && <HitJourney id={id} />}</article>;
  })}</section>;
}

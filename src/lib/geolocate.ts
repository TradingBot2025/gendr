// Best-effort automatic location detection so new users don't have to type their
// city/country during onboarding.
//
// Strategy:
//  1. Browser Geolocation API (accurate) → reverse-geocode the coordinates with
//     BigDataCloud's free, key-less, CORS-enabled client endpoint.
//  2. If geolocation is denied / unavailable / slow, fall back to an IP lookup
//     (ipwho.is) which needs no permission.
//
// Never throws — returns null on any failure so the caller can just let the user
// type it manually.

export type DetectedLocation = { city: string; country: string };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function reverseGeocode(lat: number, lon: number): Promise<DetectedLocation | null> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
    );
    if (!res.ok) return null;
    const d = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      countryName?: string;
    };
    const city = d.city || d.locality || d.principalSubdivision || "";
    const country = d.countryName || "";
    if (!city && !country) return null;
    return { city, country };
  } catch {
    return null;
  }
}

async function byIp(): Promise<DetectedLocation | null> {
  try {
    const res = await fetch("https://ipwho.is/");
    if (!res.ok) return null;
    const d = (await res.json()) as {
      success?: boolean;
      city?: string;
      country?: string;
    };
    if (!d || d.success === false) return null;
    const city = d.city || "";
    const country = d.country || "";
    if (!city && !country) return null;
    return { city, country };
  } catch {
    return null;
  }
}

async function byBrowser(): Promise<DetectedLocation | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 6000,
      maximumAge: 5 * 60 * 1000,
      enableHighAccuracy: false,
    }),
  );
  return reverseGeocode(pos.coords.latitude, pos.coords.longitude);
}

/**
 * Detect the current city and country. Prefers precise browser geolocation, then
 * falls back to an IP lookup. Resolves to null if nothing could be determined.
 */
export async function detectLocation(): Promise<DetectedLocation | null> {
  try {
    const geo = await withTimeout(byBrowser(), 7000);
    if (geo) return geo;
  } catch {
    /* denied or slow — fall back to IP */
  }
  return withTimeout(byIp(), 5000).catch(() => null);
}

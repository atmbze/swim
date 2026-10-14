// Small offline ZIP centroid table for the US Southwest (MVP; no external geocoder).
export const ZIPS: Record<string, { city: string; lat: number; lon: number }> = {
  "85001": { city: "Phoenix, AZ", lat: 33.4484, lon: -112.074 },
  "85201": { city: "Mesa, AZ", lat: 33.4152, lon: -111.8315 },
  "85281": { city: "Tempe, AZ", lat: 33.4255, lon: -111.94 },
  "85251": { city: "Scottsdale, AZ", lat: 33.4942, lon: -111.9261 },
  "85701": { city: "Tucson, AZ", lat: 32.2226, lon: -110.9747 },
  "86001": { city: "Flagstaff, AZ", lat: 35.1983, lon: -111.6513 },
  "87101": { city: "Albuquerque, NM", lat: 35.0844, lon: -106.6504 },
  "87501": { city: "Santa Fe, NM", lat: 35.687, lon: -105.9378 },
  "88001": { city: "Las Cruces, NM", lat: 32.3199, lon: -106.7637 },
  "79901": { city: "El Paso, TX", lat: 31.7619, lon: -106.485 },
  "89101": { city: "Las Vegas, NV", lat: 36.1699, lon: -115.1398 },
  "89002": { city: "Henderson, NV", lat: 36.0395, lon: -114.9817 },
  "92101": { city: "San Diego, CA", lat: 32.7157, lon: -117.1611 },
  "90012": { city: "Los Angeles, CA", lat: 34.0522, lon: -118.2437 },
  "84101": { city: "Salt Lake City, UT", lat: 40.7608, lon: -111.891 },
};

export function distanceMiles(zipA: string, zipB: string): number | null {
  const a = ZIPS[zipA], b = ZIPS[zipB];
  if (!a || !b) return null;
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isDemoMode = !supabaseUrl || !supabaseAnonKey;

export const supabase = isDemoMode
  ? null
  : createClient(supabaseUrl, supabaseAnonKey);

export interface LocationRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'hospital' | 'centro_acopio' | 'iglesia';
  address?: string;
  needs?: string;
  leader_name?: string;
  leader_phone?: string;
  photo_url?: string;
  created_at: string;
  is_active?: boolean;
}

export interface EphemeralNote {
  id: string;
  location_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface Validation {
  id: string;
  location_id: string;
  device_id: string;
  created_at: string;
};

// Haversine ΓÇö distancia en km
export function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Geocodificaci├│n inversa
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    const data = await res.json();
    return data.display_name || '';
  } catch {
    return '';
  }
}

export async function getUserState(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    const data = await res.json();
    return data.address?.state || data.address?.city || '';
  } catch {
    return '';
  }
}

// DEMO DATA
export const DEMO_ACOPIOS: LocationRow[] = [
  { id: 'a1', name: 'Centro de Acopio Altamira', type: 'centro_acopio', needs: 'Agua, alimentos enlatados, cobijas', address: 'Altamira, Chacao, Caracas', lat: 10.4961, lng: -66.8575, leader_name: 'María Fernández', leader_phone: '0412-000-0000', photo_url: 'https://images.unsplash.com/photo-1593113565694-c6f140685519?auto=format&fit=crop&q=80&w=400&h=200', created_at: new Date().toISOString() },
  { id: 'a2', name: 'Iglesia San Pedro', type: 'iglesia', needs: 'Ropa, carpas, colchonetas', address: 'Los Chaguaramos, Caracas', lat: 10.4977, lng: -66.8889, leader_name: 'Padre José', created_at: new Date().toISOString() },
];

export async function searchLocation(query: string): Promise<Array<{lat: number, lon: number, display_name: string, type: string}>> {
  const fullQuery = query.toLowerCase().includes('venezuela') ? query : `${query}, Venezuela`;

  // Motor 1: Photon (Komoot) — fuzzy matching excelente, ideal para autocompletado
  const photonSearch = async (): Promise<Array<{lat: number, lon: number, display_name: string, type: string}>> => {
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(fullQuery)}&lang=es&limit=6&lat=8.0&lon=-66.0&zoom=6`;
      const res = await fetch(url);
      const data = await res.json();
      return (data.features || [])
        .filter((f: any) => {
          const cc = f.properties?.country;
          return cc === 'Venezuela' || cc === 'República Bolivariana de Venezuela';
        })
        .map((f: any) => {
          const p = f.properties || {};
          const parts = [p.name, p.street, p.city || p.county, p.state].filter(Boolean);
          return {
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            display_name: parts.join(', '),
            type: p.osm_value || p.type || '',
          };
        });
    } catch { return []; }
  };

  // Motor 2: Nominatim — más completo en direcciones formales
  const nominatimSearch = async (): Promise<Array<{lat: number, lon: number, display_name: string, type: string}>> => {
    try {
      const params = new URLSearchParams({
        q: fullQuery,
        format: 'json',
        countrycodes: 'VE',
        limit: '5',
        dedupe: '1',
        addressdetails: '1',
      });
      const url = `https://nominatim.openstreetmap.org/search?${params}`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
      return await res.json();
    } catch { return []; }
  };

  // Ejecutar ambos motores en paralelo
  const [photonResults, nominatimResults] = await Promise.all([photonSearch(), nominatimSearch()]);

  // Combinar y deduplicar por proximidad (si dos resultados están a menos de 50m, son iguales)
  const combined = [...photonResults];
  for (const nr of nominatimResults) {
    const isDupe = combined.some(cr => {
      const dist = Math.abs(Number(cr.lat) - Number(nr.lat)) + Math.abs(Number(cr.lon) - Number(nr.lon));
      return dist < 0.0005;
    });
    if (!isDupe) combined.push(nr);
  }

  return combined.slice(0, 10);
}

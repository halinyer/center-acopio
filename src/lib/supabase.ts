import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isDemoMode = !supabaseUrl || !supabaseAnonKey;

export const supabase = isDemoMode
  ? null
  : createClient(supabaseUrl, supabaseAnonKey);

// Device ID efímero para evitar el eco de nuestros propios posts en Realtime
const LOCAL_DEVICE_ID_KEY = 'tactical_device_id';
export const getDeviceId = () => {
  let id = localStorage.getItem(LOCAL_DEVICE_ID_KEY);
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    localStorage.setItem(LOCAL_DEVICE_ID_KEY, id);
  }
  return id;
};

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
  expires_at?: string | null;
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

export interface TacticalPost {
  id: string;
  user_id?: string;
  author_name: string;
  author_avatar?: string;
  content: string;
  image_url?: string;
  is_critical: boolean;
  contact_phone?: string;
  linked_center_id?: string;
  lat: number;
  lng: number;
  zone: string;
  created_at: string;
  supports_count: number;
  relevance_score?: number;
  distance_km?: number;
  device_id?: string;
}

export const DEMO_POSTS: TacticalPost[] = [
  {
    id: '1',
    author_name: 'Carlos M.',
    author_avatar: 'https://i.pravatar.cc/150?u=carlos',
    content: 'Se accidentó el camión con 20 cajas de agua en la autopista, necesitamos a alguien con grúa o transporte para mover la carga.',
    image_url: 'https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&q=80&w=800',
    is_critical: true,
    contact_phone: '584121234567',
    linked_center_id: 'c2', // Hospital CHET
    lat: 10.1910, lng: -67.9931, zone: 'Valencia, Carabobo',
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    supports_count: 142
  },
  {
    id: '2',
    author_name: 'Ana R.',
    author_avatar: 'https://i.pravatar.cc/150?u=ana',
    content: 'La vía principal hacia el centro de acopio está bloqueada por escombros. Por favor, usen la ruta alterna por la avenida Bolívar.',
    is_critical: false,
    linked_center_id: 'c1', // Iglesia San José
    lat: 10.2310, lng: -66.8631, zone: 'Chacao, Miranda',
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    supports_count: 85
  },
  {
    id: '3',
    author_name: 'Miguel T.',
    author_avatar: 'https://i.pravatar.cc/150?u=miguel',
    content: 'Acaban de llegar 20 cajas de agua potable, pero necesitamos transporte para distribuirlas hacia el sur.',
    is_critical: false,
    lat: 10.4806, lng: -66.9036, zone: 'Caracas, Distrito Capital',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    supports_count: 34
  }
];


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
  const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // Motor Principal: Google Maps (Nueva Places API v1 - Soporta CORS)
  if (googleKey) {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleKey,
          'X-Goog-FieldMask': 'places.displayName,places.location,places.formattedAddress,places.primaryType'
        },
        body: JSON.stringify({
          textQuery: fullQuery,
          regionCode: 'VE'
        })
      });
      const data = await res.json();
      if (data.places && data.places.length > 0) {
        return data.places.map((p: any) => ({
          lat: p.location.latitude,
          lon: p.location.longitude,
          display_name: p.displayName?.text + (p.formattedAddress ? `, ${p.formattedAddress}` : ''),
          type: p.primaryType || 'point_of_interest'
        }));
      }
    } catch (e) {
      console.warn("Error con Google Maps, usando fallback abierto:", e);
    }
  }

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

  // Fallback: Ejecutar ambos motores libres en paralelo
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

export async function getTacticalFeed(
  lat: number, lng: number, 
  lastScore?: number, lastTime?: string, lastId?: string,
  limit: number = 15
): Promise<TacticalPost[]> {
  if (isDemoMode || !supabase) return DEMO_POSTS;
  
  const { data, error } = await supabase.rpc('get_tactical_feed_radar', {
    user_lat: lat,
    user_lng: lng,
    p_last_score: lastScore || null,
    p_last_time: lastTime || null,
    p_last_id: lastId || null,
    limit_size: limit
  });

  if (error) {
    console.error('Error fetching tactical feed:', error);
    return [];
  }
  return data || [];
}

export function subscribeToTacticalFeed(
  onNewPost: (post: TacticalPost) => void
) {
  if (isDemoMode || !supabase) return () => {};

  const myDeviceId = getDeviceId();

  const channel = supabase.channel('public:tactical_feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tactical_feed' }, payload => {
      const newPost = payload.new as TacticalPost;
      // Anti-echo: ignorar si el post fue creado por este dispositivo
      if (newPost.device_id === myDeviceId) return;
      onNewPost(newPost);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export async function publishTacticalReport(post: Omit<TacticalPost, 'id' | 'created_at' | 'supports_count'>): Promise<boolean> {
  const postWithDevice = { ...post, device_id: getDeviceId() };
  
  if (isDemoMode || !supabase) {
    console.log('Demo publish:', postWithDevice);
    return true;
  }
  
  const { error } = await supabase.from('tactical_feed').insert([postWithDevice]);
  if (error) {
    console.error('Error publishing report:', error);
    // Buzón de Salida Offline (Pendiente de sincronizar)
    const pending = JSON.parse(localStorage.getItem('tactical_outbox') || '[]');
    pending.push({ ...postWithDevice, id: 'temp-' + Date.now(), created_at: new Date().toISOString() });
    localStorage.setItem('tactical_outbox', JSON.stringify(pending));
    return false;
  }
  return true;
}

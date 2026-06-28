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

// Haversine — distancia en km
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

// Geocodificación inversa
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
}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    const data = await res.json();
    return data.display_name || '';
  } catch {
    return '';
  }
}

// HOSPITALES
export const HOSPITALS: LocationRow[] = [
  { id: 'h1', name: 'Hospital Universitario de Caracas', type: 'hospital', needs: 'Equipos de trauma, medicamentos', address: 'Los Chaguaramos, Caracas', lat: 10.4911, lng: -66.8453, created_at: new Date().toISOString() },
  { id: 'h2', name: 'Hospital J.M. de los Ríos', type: 'hospital', needs: 'Pediatría, oxígeno, ventiladores', address: 'San Bernardino, Caracas', lat: 10.5055, lng: -66.8915, created_at: new Date().toISOString() },
  { id: 'h3', name: 'Hospital Vargas de Caracas', type: 'hospital', needs: 'Insumos quirúrgicos', address: 'San José, Caracas', lat: 10.5091, lng: -66.9132, created_at: new Date().toISOString() },
  { id: 'h4', name: 'Hospital Militar Carlos Arvelo', type: 'hospital', needs: 'Material quirúrgico', address: 'San Martín, Caracas', lat: 10.5032, lng: -66.9145, created_at: new Date().toISOString() },
  { id: 'h5', name: 'Clínica Santa Sofía', type: 'hospital', needs: 'Medicamentos pediátricos', address: 'El Cafetal, Caracas', lat: 10.4826, lng: -66.8725, created_at: new Date().toISOString() },
  { id: 'h10', name: 'Hospital Central de Maracay', type: 'hospital', needs: 'Medicamentos, generadores', address: 'Maracay, Aragua', lat: 10.2472, lng: -67.5967, created_at: new Date().toISOString() },
  { id: 'h11', name: 'Hospital Central de Valencia', type: 'hospital', needs: 'Insumos de emergencia', address: 'Valencia, Carabobo', lat: 10.1783, lng: -68.0050, created_at: new Date().toISOString() },
  { id: 'ig1', name: 'Iglesia San Pedro', type: 'iglesia', needs: 'Ropa, carpas, colchonetas', address: 'Los Chaguaramos, Caracas', lat: 10.4977, lng: -66.8889, leader_name: 'Padre José', created_at: new Date().toISOString() },
  { id: 'ig2', name: 'Catedral de Caracas', type: 'iglesia', needs: 'Comida, agua potable', address: 'Plaza Bolívar, Caracas', lat: 10.5056, lng: -66.9146, created_at: new Date().toISOString() },
];

export const DEMO_ACOPIOS: LocationRow[] = [
  { id: 'a1', name: 'Centro de Acopio Altamira', type: 'centro_acopio', needs: 'Agua, alimentos enlatados, cobijas', address: 'Altamira, Chacao, Caracas', lat: 10.4961, lng: -66.8575, leader_name: 'María Fernández', leader_phone: '0412-000-0000', photo_url: 'https://images.unsplash.com/photo-1593113565694-c6f140685519?auto=format&fit=crop&q=80&w=400&h=200', created_at: new Date().toISOString() },
  { id: 'a2', name: 'Iglesia San Pedro', type: 'iglesia', needs: 'Ropa, carpas, colchonetas', address: 'Los Chaguaramos, Caracas', lat: 10.4977, lng: -66.8889, leader_name: 'Padre José', created_at: new Date().toISOString() },
];


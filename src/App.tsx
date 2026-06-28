import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase, isDemoMode, HOSPITALS, DEMO_ACOPIOS, getDistanceKm, reverseGeocode } from './lib/supabase';
import { Lock, Plus, List as ListIcon, MapPin, HelpCircle, Hospital, Church, Package, Phone, MessageCircle, Map as MapIcon, User, Pointer, CheckCircle2, Send, Bell } from 'lucide-react';
import type { LocationRow } from './lib/supabase';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './index.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function makeIcon(type: 'hospital' | 'centro_acopio' | 'iglesia', isNearest = false): L.DivIcon {
  const size = isNearest ? 34 : 28;
  const emoji = type === 'hospital' ? '🏥' : type === 'iglesia' ? '⛪' : '📦';
  const nc = isNearest ? ' nearest' : '';
  return L.divIcon({
    className: '',
    html: `<div class="marker-custom ${type}${nc}" style="width:${size}px;height:${size}px;font-size:${size * 0.45}px">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function placingIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<div class="marker-placing">📦</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function userIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<div class="marker-user"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function FlyTo({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lng], zoom, { duration: 1.2 }); }, [lat, lng, zoom, map]);
  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function MapCenterer({ flyTo }: { flyTo: { lat: number, lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (flyTo) {
      map.flyTo([flyTo.lat, flyTo.lng], 16, { animate: true });
    }
  }, [flyTo, map]);
  return null;
}

function gmapsUrl(userLat: number | null, userLng: number | null, lat: number, lng: number) {
  if (userLat !== null && userLng !== null)
    return `https://www.google.com/maps/dir/${userLat},${userLng}/${lat},${lng}`;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

// CORRECCIÓN: Fuerza a Leaflet a recalcular el tamaño correcto en móviles para evitar azulejos grises
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// COMPONENTE: Carga dinámica de hospitales e iglesias al mover el mapa
function DynamicHospitals({ setOsmHospitals }: { setOsmHospitals: React.Dispatch<React.SetStateAction<LocationRow[]>> }) {
  const map = useMap();

  const fetchOsm = useCallback(async () => {
    const zoom = map.getZoom();
    if (zoom < 10) return; // Permitir zoom desde más lejos
    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    
    // Consulta a Overpass API explícita sin regex para evitar errores de sintaxis o timeout
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="hospital"](${bbox});
        way["amenity"="hospital"](${bbox});
        node["amenity"="clinic"](${bbox});
        way["amenity"="clinic"](${bbox});
        node["healthcare"="hospital"](${bbox});
        way["healthcare"="hospital"](${bbox});
        node["healthcare"="clinic"](${bbox});
        way["healthcare"="clinic"](${bbox});
        node["amenity"="place_of_worship"](${bbox});
        way["amenity"="place_of_worship"](${bbox});
      );out center;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 429) {
          console.warn("El servidor de mapas gratuitos está saturado por muchas consultas.");
        }
        return;
      }
      const data = await res.json();
      
      const newHospitals: LocationRow[] = data.elements.map((el: any) => {
        const lat = el.lat || el.center?.lat;
        const lon = el.lon || el.center?.lon;
        
        let name = el.tags?.name || 'Lugar sin nombre';
        let type: 'hospital' | 'iglesia' = 'hospital';
        
        if (el.tags?.amenity === 'place_of_worship') {
          type = 'iglesia';
          if (!el.tags?.name) name = 'Iglesia / Parroquia';
        } else if (!el.tags?.name) {
          name = el.tags?.amenity === 'clinic' || el.tags?.healthcare === 'clinic' ? 'Clínica' : 'Hospital';
        }
        
        return {
          id: `osm-${el.id}`,
          name: name,
          type: type,
          needs: type === 'iglesia' ? 'Posible centro de acopio - Contactar líderes' : 'Contactar para consultar necesidades',
          address: 'Ubicación importada del mapa',
          lat: lat,
          lng: lon,
          updated_at: new Date().toISOString()
        };
      });

      setOsmHospitals(prev => {
        const map = new Map(prev.map(h => [h.id, h]));
        newHospitals.forEach(h => map.set(h.id, h));
        return Array.from(map.values());
      });
    } catch (err) {
      console.error('Error cargando datos OSM:', err);
      // Solo mostrar un toast genérico si no se ha mostrado ya
    }
  }, [map, setOsmHospitals]);

  useMapEvents({
    moveend: fetchOsm
  });

  useEffect(() => {
    fetchOsm();
  }, [fetchOsm]);

  return null;
}

// ========== MAIN APP ==========
function App() {
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [acopios, setAcopios] = useState<LocationRow[]>([]);
  
  // Refs para evitar re-suscripción en WebSockets
  const userPosRef = useRef(userPos);
  const acopiosRef = useRef(acopios);
  const recentSentNotes = useRef<Set<string>>(new Set());

  useEffect(() => { userPosRef.current = userPos; }, [userPos]);
  useEffect(() => { acopiosRef.current = acopios; }, [acopios]);
  const [osmHospitals, setOsmHospitals] = useState<LocationRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'hospital' | 'acopio' | 'iglesia'>('all');
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [locating, setLocating] = useState(true);

  // Access Code System
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authCode, setAuthCode] = useState('');
  
  // Help modal
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Modals
  const [showList, setShowList] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [selectedLoc, setSelectedLoc] = useState<LocationRow | null>(null); // Details modal
  const [mapFlyTo, setMapFlyTo] = useState<{lat: number, lng: number} | null>(null);

  // Placing mode
  const [showLocationChooser, setShowLocationChooser] = useState(false);
  const [placingMode, setPlacingMode] = useState(false);
  const [placedPos, setPlacedPos] = useState<{ lat: number; lng: number } | null>(null);
  const [placedAddress, setPlacedAddress] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form fields
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'centro_acopio' | 'hospital' | 'iglesia'>('centro_acopio');
  const [formNeeds, setFormNeeds] = useState('');
  const [formLeader, setFormLeader] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Ephemeral Feed & Notifications Mock
  const [isTyping, setIsTyping] = useState(false);
  const [ephemeralText, setEphemeralText] = useState('');
  const [ephemeralRole, setEphemeralRole] = useState('Civil');
  
  const [mockNotes, setMockNotes] = useState<{role: string, text: string, time: string, locId: string}[]>([
    { role: 'Civil', text: 'La vía por la principal está despejada, entregué agua hace un rato.', time: 'Hace 2h', locId: 'all' },
    { role: 'Médico', text: 'Ya no traigan más suero, necesitamos son gasas y alcohol urgentemente.', time: 'Hace 5h', locId: 'all' }
  ]);
  const [mockVerifications, setMockVerifications] = useState<Record<string, number>>({});
  
  // Toast & History
  const [activeToast, setActiveToast] = useState<{title: string, desc: string, id: number, locId?: string} | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsHistory, setNotificationsHistory] = useState<{id: number, title: string, desc: string, time: string, locId?: string, read: boolean}[]>([]);

  const showToast = (title: string, desc: string, locId?: string) => {
    const id = Date.now();
    setActiveToast({title, desc, id, locId});
    
    // Add to history
    setNotificationsHistory(prev => [{id, title, desc, time: 'Hace un momento', locId, read: false}, ...prev]);

    setTimeout(() => {
      setActiveToast(prev => prev?.id === id ? null : prev);
    }, 4000); // Se oculta a los 4s
  };
  
  const unreadCount = notificationsHistory.filter(n => !n.read).length;

  // Check auth status on mount
  useEffect(() => {
    const savedCode = localStorage.getItem('sos_auth_code');
    if (savedCode) {
      setAuthCode(savedCode);
      setIsUnlocked(true);
    }
  }, []);

  const [deviceId] = useState(() => {
    let id = localStorage.getItem('device_id');
    if (!id) {
      id = Math.random().toString(36).substring(2, 10);
      localStorage.setItem('device_id', id);
    }
    return id;
  });

  const openDetails = (loc: LocationRow) => {
    setShowList(false);
    setSelectedLoc(loc);
    setMapFlyTo({ lat: loc.lat, lng: loc.lng });
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDemoMode && supabase) {
      const { data, error } = await supabase.rpc('verify_auth_code', { p_auth_code: authCode });
      if (error || !data) {
        alert('❌ Código incorrecto o error de conexión');
        return;
      }
    } else {
      if (authCode !== 'SOS-VZLA-2026') {
        alert('❌ Código incorrecto (Demo)');
        return;
      }
    }

    setIsUnlocked(true);
    localStorage.setItem('sos_auth_code', authCode);
    setShowAuthModal(false);
    alert('✅ Modo Administrador desbloqueado. Ahora puedes agregar puntos.');
  };

  const fetchAcopios = useCallback(async () => {
    if (isDemoMode || !supabase) { setAcopios(DEMO_ACOPIOS); return; }
    const { data, error } = await supabase.from('locations').select('*').eq('is_active', true);
    if (error) console.error(error);
    else setAcopios(data || []);
  }, []);

  const fetchSocialData = useCallback(async () => {
    if (isDemoMode || !supabase) return;
    
    // Notes
    const yesterday = new Date(Date.now() - 24*60*60*1000).toISOString();
    const { data: notesData } = await supabase.from('ephemeral_notes').select('*').gte('created_at', yesterday).order('created_at', { ascending: false });
    if (notesData) {
      setMockNotes(notesData.map((n: any) => ({
        role: n.role,
        text: n.content,
        time: new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        locId: n.location_id
      })));
    }

    // Validations
    const { data: valData } = await supabase.from('validations').select('location_id, device_id').gte('created_at', yesterday);
    if (valData) {
      const counts: Record<string, number> = {};
      valData.forEach((v: any) => {
        counts[v.location_id] = (counts[v.location_id] || 0) + 1;
        if (v.device_id === deviceId) {
          counts[v.location_id + '_self'] = 1;
        }
      });
      setMockVerifications(counts);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchAcopios();
    fetchSocialData();
    
    // Configurar suscripción en tiempo real a Supabase
    let channel: any;
    let socialChannel: any;
    if (!isDemoMode && supabase) {
      channel = supabase
        .channel('realtime:public:locations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => {
          fetchAcopios();
        })
        .subscribe();
        
      socialChannel = supabase
        .channel('realtime:public:social')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ephemeral_notes' }, (payload) => {
          fetchSocialData();
          const pos = userPosRef.current;
          const acs = acopiosRef.current;
          
          // Prevenir auto-notificación comprobando si enviamos este mismo texto recientemente
          if (recentSentNotes.current.has(payload.new.content)) {
            recentSentNotes.current.delete(payload.new.content);
            return; // Ignorar el broadcast de nuestro propio mensaje
          }

          if (pos && acs.length > 0) {
            const loc = acs.find(a => a.id === payload.new.location_id);
            if (loc && getDistanceKm(pos.lat, pos.lng, loc.lat, loc.lng) <= 20) {
              showToast(`Nuevo reporte en ${loc.name}`, `${payload.new.role} reportó algo nuevo.`, loc.id);
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'validations' }, (payload) => {
          fetchSocialData();
          if (payload.eventType === 'INSERT') {
            const pos = userPosRef.current;
            const acs = acopiosRef.current;
            if (pos && acs.length > 0) {
              const loc = acs.find(a => a.id === payload.new.location_id);
              if (loc && getDistanceKm(pos.lat, pos.lng, loc.lat, loc.lng) <= 20) {
                if (payload.new.device_id !== deviceId) {
                  showToast(`Actividad en ${loc.name}`, `Alguien acaba de confirmar que este centro sigue activo.`, loc.id);
                }
              }
            }
          }
        })
        .subscribe();
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setFlyTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 13 });
          setLocating(false);
        },
        () => {
          setUserPos({ lat: 10.4806, lng: -66.9036 });
          setFlyTarget({ lat: 10.4806, lng: -66.9036, zoom: 8 });
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setUserPos({ lat: 10.4806, lng: -66.9036 });
      setFlyTarget({ lat: 10.4806, lng: -66.9036, zoom: 8 });
      setLocating(false);
    }

      return () => {
        if (channel) supabase?.removeChannel(channel);
        if (socialChannel) supabase?.removeChannel(socialChannel);
      };
  }, [fetchAcopios, fetchSocialData, deviceId]);

  const allHospitals = useMemo(() => {
    // Unir los hospitales quemados (HOSPITALS) con los descargados dinámicamente (osmHospitals)
    const map = new Map();
    HOSPITALS.forEach(h => map.set(h.id, h));
    osmHospitals.forEach(h => map.set(h.id, h)); // Sobrescribe si por casualidad choca el ID, pero los OSM tienen prefijo "osm-"
    return Array.from(map.values());
  }, [osmHospitals]);

  const allLocations = useMemo(() => [...allHospitals, ...acopios], [allHospitals, acopios]);
  const filtered = useMemo(() => {
    if (filter === 'all') return allLocations;
    if (filter === 'acopio') return allLocations.filter(loc => loc.type === 'centro_acopio');
    return allLocations.filter(loc => loc.type === filter);
  }, [filter, allLocations]);

  const distTo = useCallback((lat: number, lng: number) =>
    userPos ? getDistanceKm(userPos.lat, userPos.lng, lat, lng) : null, [userPos]);

  const sortedByDist = useMemo(() => {
    if (!userPos) return filtered;
    return [...filtered].sort((a, b) =>
      getDistanceKm(userPos.lat, userPos.lng, a.lat, a.lng) -
      getDistanceKm(userPos.lat, userPos.lng, b.lat, b.lng)
    );
  }, [userPos, filtered]);

  const listItems = useMemo(() => {
    if (!listSearch) return sortedByDist;
    const lower = listSearch.toLowerCase();
    return sortedByDist.filter(loc => 
      loc.name.toLowerCase().includes(lower) || 
      (loc.address && loc.address.toLowerCase().includes(lower)) ||
      (loc.needs && loc.needs.toLowerCase().includes(lower))
    );
  }, [sortedByDist, listSearch]);

  const nearest = useMemo(() => {
    if (!userPos || acopios.length === 0) return null;
    let minDist = Infinity;
    let closest: LocationRow | null = null;
    for (const a of acopios) {
      const d = getDistanceKm(userPos.lat, userPos.lng, a.lat, a.lng);
      if (d < minDist) { minDist = d; closest = a; }
    }
    return closest ? { location: closest, distance: minDist } : null;
  }, [userPos, acopios]);

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setFlyTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 14 });
    });
  };

  const startPlacing = () => { setShowLocationChooser(true); setPlacedPos(null); setPlacedAddress(''); setShowForm(false); setPlacingMode(false); setEditingId(null); };
  
  const cancelPlacing = () => { 
    setPlacingMode(false); setShowLocationChooser(false); setPlacedPos(null); setPlacedAddress(''); setShowForm(false); setFormName(''); setFormType('centro_acopio'); setFormNeeds(''); setFormLeader(''); setFormPhone(''); setEditingId(null);
  };

  const handleChooseMap = () => {
    setShowLocationChooser(false);
    setPlacingMode(true);
  };

  const handleChooseGPS = () => {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta GPS");
      return;
    }
    setShowLocationChooser(false);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPlacedPos({ lat, lng });
        
        // Reverse geocode
        const addr = await reverseGeocode(lat, lng);
        setPlacedAddress(addr || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        
        setLocating(false);
        setShowForm(true);
      },
      () => {
        setLocating(false);
        alert("No pudimos obtener tu ubicación actual. Asegúrate de tener el GPS encendido o darnos permisos.");
        handleChooseMap(); // Fallback to map
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleMapClick = async (lat: number, lng: number) => {
    if (!placingMode) return;
    setPlacedPos({ lat, lng });
    setShowForm(true);
    const addr = await reverseGeocode(lat, lng);
    setPlacedAddress(addr || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;
    if (!placedPos && !editingId) return;

    setSubmitting(true);
    
    const rowData = {
      name: formName, type: formType, needs: formNeeds, address: placedAddress, 
      leader_name: formLeader, leader_phone: formPhone,
      lat: placedPos?.lat || 0, lng: placedPos?.lng || 0,
      updated_at: new Date().toISOString(),
    };
    
    if (editingId) {
      if (!isDemoMode && supabase) {
        const { error } = await supabase.rpc('edit_location_secure', {
          p_id: editingId,
          p_name: formName, p_type: formType, p_needs: formNeeds,
          p_leader_name: formLeader, p_leader_phone: formPhone,
          p_auth_code: authCode
        });
        if (error) { alert('Error actualizando: ' + error.message); setSubmitting(false); return; }
      } else {
        setAcopios(prev => prev.map(a => a.id === editingId ? { ...a, ...rowData, lat: a.lat, lng: a.lng, address: a.address } : a));
      }
    } else {
      if (!isDemoMode && supabase) {
        const { error } = await supabase.rpc('add_location_secure', {
          p_name: formName, p_type: formType, p_needs: formNeeds, p_address: placedAddress,
          p_lat: placedPos?.lat || 0, p_lng: placedPos?.lng || 0,
          p_leader_name: formLeader, p_leader_phone: formPhone,
          p_auth_code: authCode
        });
        if (error) { alert('Error guardando: ' + error.message); setSubmitting(false); return; }
      } else {
        setAcopios(prev => [...prev, { id: `local-${Date.now()}`, ...rowData } as any]);
      }
    }
    
    cancelPlacing();
    setSubmitting(false);
    if (!editingId && rowData.lat) setFlyTarget({ lat: rowData.lat, lng: rowData.lng, zoom: 15 });
    await fetchAcopios();
  };

  const startEditing = (loc: LocationRow) => {
    setEditingId(loc.id);
    setFormName(loc.name);
    setFormType(loc.type as any);
    setFormNeeds(loc.needs || '');
    setFormLeader(loc.leader_name || '');
    setFormPhone(loc.leader_phone || '');
    setPlacedPos({ lat: loc.lat, lng: loc.lng });
    setPlacedAddress(loc.address || '');
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas ocultar este punto? Desaparecerá del mapa pero quedará guardado para tu revisión.')) return;
    if (!isDemoMode && supabase) {
      const { error } = await supabase.rpc('delete_location_secure', { p_id: id, p_auth_code: authCode });
      if (error) { alert('Error deshabilitando: ' + error.message); return; }
    } else {
      setAcopios(prev => prev.filter(a => a.id !== id));
    }
    setSelectedLoc(null);
    await fetchAcopios();
  };

  const fmtDist = (d: number | null) => {
    if (d === null) return '';
    return d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`;
  };



  // WhatsApp formatter
  const formatWaLink = (phone: string) => {
    let cleanPhone = phone.replace(/[^0-9+]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '58' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('58') && !cleanPhone.startsWith('+58')) {
      // Assume it's a Venezuelan number if it's 10 digits
      if (cleanPhone.length === 10) cleanPhone = '58' + cleanPhone;
    }
    // Remove +
    cleanPhone = cleanPhone.replace('+', '');
    return `https://wa.me/${cleanPhone}`;
  };

  return (
    <div className="app">
      {locating && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">Obteniendo tu ubicación...</div>
        </div>
      )}

      {/* PLACING BANNER */}
      {placingMode && !showForm && (
        <div className="placing-banner">
          <span>👆 Toca el mapa para colocar el punto</span>
          <button className="placing-cancel" onClick={cancelPlacing}>Cancelar</button>
        </div>
      )}

      <div className={`map-full ${placingMode && !showForm ? 'placing-cursor' : ''}`}>
        <MapContainer center={[10.4806, -66.9036]} zoom={13} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer 
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" 
            attribution='&copy; OSM &copy; CARTO'
            detectRetina={true}
          />
          <MapCenterer flyTo={mapFlyTo} />
          {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} zoom={flyTarget.zoom} />}
          {placingMode && !showForm && <MapClickHandler onMapClick={handleMapClick} />}
          <DynamicHospitals setOsmHospitals={setOsmHospitals} />
          <MapResizer />

          {userPos && (
            <Marker position={[userPos.lat, userPos.lng]} icon={userIcon()}>
              <Popup><div className="popup-body"><div className="popup-name">📍 Tu ubicación</div></div></Popup>
            </Marker>
          )}

          {placedPos && <Marker position={[placedPos.lat, placedPos.lng]} icon={placingIcon()} />}

          {filtered.map((loc) => {
            const isNearest = nearest?.location.id === loc.id;
            return (
              <Marker 
                key={loc.id} 
                position={[loc.lat, loc.lng]} 
                icon={makeIcon(loc.type, isNearest)}
                eventHandlers={{ click: () => openDetails(loc) }}
              />
            );
          })}
        </MapContainer>
      </div>

      {!placingMode && (
        <div className="top-bar">
          <div className="brand">
            <div className="brand-icon"><Package size={24} color="white" /></div>
            <div className="brand-text">Acopio<span>Venezuela</span></div>
          </div>
          <div className="top-actions">
              <button 
                className="btn-circle" 
                style={{position: 'relative'}} 
                onClick={() => {
                  setShowNotifications(true);
                  setNotificationsHistory(prev => prev.map(n => ({...n, read: true})));
                }} 
                title="Notificaciones"
              >
                <Bell size={18} />
                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
              </button>
              {!isUnlocked && <button className="btn-circle" onClick={() => setShowAuthModal(true)} title="Acceso Líderes"><Lock size={18} /></button>}
            {isUnlocked && <button className="btn-pill btn-add-top" onClick={startPlacing}><Plus size={18} /> <span>Agregar</span></button>}
            <button className="btn-pill" onClick={() => setShowList(true)}><ListIcon size={18} /> <span>Ver lista</span></button>
            <button className="btn-circle" onClick={handleLocate} title="Mi ubicación"><MapPin size={18} /></button>
            <button className="btn-circle" onClick={() => setShowHelpModal(true)} title="Cómo funciona"><HelpCircle size={18} /></button>
          </div>
        </div>
      )}

      {nearest && !placingMode && !showList && !selectedLoc && (
        <div className="nearest-chip" onClick={() => openDetails(nearest.location)}>
          <div className="chip-dot" />
          <div className="chip-info">
            <div className="chip-name">{nearest.location.name}</div>
            <div className="chip-dist" style={{display:'flex', alignItems:'center', gap:'4px'}}><Package size={14} /> Más cercano · {fmtDist(nearest.distance)}</div>
          </div>
        </div>
      )}

      {!placingMode && (
        <div className="bottom-bar-wrapper">
          <div className="bottom-bar-scroll">
            <button className={`filter-pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}><MapIcon size={16}/> Todos</button>
            <button className={`filter-pill ${filter === 'hospital' ? 'active' : ''}`} onClick={() => setFilter('hospital')}><Hospital size={16}/> Hospitales</button>
            <button className={`filter-pill ${filter === 'iglesia' ? 'active' : ''}`} onClick={() => setFilter('iglesia')}><Church size={16}/> Iglesias</button>
            <button className={`filter-pill ${filter === 'acopio' ? 'active' : ''}`} onClick={() => setFilter('acopio')}><Package size={16}/> Acopio</button>
          </div>
        </div>
      )}

      {/* AUTH MODAL */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}>
          <div className="auth-card">
            <h2 style={{display:'flex', alignItems:'center', gap:'8px'}}><Lock size={20} /> Acceso a Líderes</h2>
            <p>Ingresa el código de acceso para poder registrar centros de acopio.</p>
            <form onSubmit={handleAuthSubmit}>
              <input 
                type="password" 
                value={authCode} 
                onChange={(e) => setAuthCode(e.target.value)} 
                placeholder="Código de acceso..." 
                autoFocus 
              />
              <div className="auth-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowAuthModal(false)}>Cancelar</button>
                <button type="submit" className="btn-submit-auth">Verificar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HELP MODAL */}
      {showHelpModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowHelpModal(false); }}>
          <div className="modal-sheet help-sheet">
            <div className="list-handle" />
            <div className="modal-header">
              <h2 style={{display:'flex', alignItems:'center', gap:'8px'}}><HelpCircle size={20} /> ¿Cómo funciona?</h2>
              <button className="modal-close" onClick={() => setShowHelpModal(false)}>✕</button>
            </div>
            <div className="help-body">
              <div className="help-step">
                <span className="help-step-icon"><Hospital size={22} /> / <Church size={22} /></span>
                <p><strong>Hospitales e Iglesias:</strong> Se cargan automáticamente del mapa oficial libre de Venezuela al mover la pantalla. No tienes que agregarlos.</p>
              </div>
              <div className="help-step">
                <span className="help-step-icon"><Package size={22} /></span>
                <p><strong>Centros de Acopio (Rojos):</strong> Son los puntos de ayuda activos. Toca cualquiera para ver qué insumos necesitan y su teléfono.</p>
              </div>
              <div className="help-step">
                <span className="help-step-icon"><Phone size={22} /> / <MessageCircle size={22} /></span>
                <p><strong>Contacto Directo:</strong> Puedes llamar al líder del centro o enviarle un WhatsApp directo en 1 clic para coordinar tu entrega.</p>
              </div>
              <div className="help-step">
                <span className="help-step-icon"><Lock size={22} /></span>
                <p><strong>Agregar Puntos:</strong> Exclusivo para médicos, sacerdotes y líderes con código de autorización. Toca el candado e ingresa el código.</p>
              </div>
              <button className="help-close-btn" onClick={() => setShowHelpModal(false)}>Entendido</button>
              
              <div className="powered-by">Powered by <strong>signalNote</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* LIST PANEL */}
      {showList && (
        <div className="list-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowList(false); }}>
          <div className="list-sheet">
            <div className="list-handle" />
            <div className="list-header">
              <h2 style={{display:'flex', alignItems:'center', gap:'8px'}}><ListIcon size={20} /> {filter === 'all' ? 'Todos los puntos' : filter === 'hospital' ? 'Hospitales' : filter === 'iglesia' ? 'Iglesias' : 'Centros de Acopio'} cercanos</h2>
              <button className="list-close" onClick={() => setShowList(false)}>✕</button>
            </div>
            
            <div className="list-search-container">
              <input 
                type="text" 
                className="list-search-input" 
                placeholder="Buscar por nombre o dirección..." 
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
              />
            </div>

            <div className="list-body">
              {listItems.length === 0 && <div className="list-empty">No se encontraron resultados</div>}
              {listItems.map((loc) => {
                const dist = distTo(loc.lat, loc.lng);
                return (
                  <div key={loc.id} className="list-item" onClick={() => openDetails(loc)}>
                    <div className={`list-item-icon ${loc.type}`}>
                      {loc.type === 'hospital' ? <Hospital size={20} /> : loc.type === 'iglesia' ? <Church size={20} /> : <Package size={20} />}
                    </div>
                    <div className="list-item-info">
                      <div className="list-item-name">{loc.name}</div>
                      <div className="list-item-addr">{loc.address || (loc.type === 'hospital' ? 'Hospital' : loc.type === 'iglesia' ? 'Iglesia' : 'Centro de Acopio')}</div>
                      {dist !== null && <div className="list-item-dist">{fmtDist(dist)}</div>}
                    </div>
                    <button className="list-item-go">Info</button>
                  </div>
                );
              })}

              <div className="powered-by">Powered by <strong>signalNote</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* DETAILS MODAL */}
      {selectedLoc && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedLoc(null); }}>
          <div className="modal-sheet details-sheet">
            
            {/* Header Image */}
            {selectedLoc.photo_url ? (
        <div className="details-header-image" style={{ backgroundImage: `url(${selectedLoc.photo_url})` }}>
                <button className="details-close-abs" onClick={() => setSelectedLoc(null)}>✕</button>
              </div>
            ) : (
              <div className="details-header-color">
                <button className="details-close-abs" onClick={() => setSelectedLoc(null)}>✕</button>
              </div>
            )}

            <div className="details-body">
              <div className="trust-badge">
                <span className="trust-dot"></span>
                {mockVerifications[selectedLoc.id] || 0} confirmaciones hoy
              </div>
              <div className="details-type" style={{display:'flex', alignItems:'center', gap:'4px'}}>{selectedLoc.type === 'hospital' ? <><Hospital size={14}/> Hospital</> : selectedLoc.type === 'iglesia' ? <><Church size={14}/> Iglesia</> : <><Package size={14}/> Centro de Acopio</>}</div>
              <h2 className="details-title">{selectedLoc.name}</h2>
              
              {isUnlocked && acopios.some(a => a.id === selectedLoc.id) && (
                <div className="admin-actions">
                  <button className="btn-admin-edit" onClick={() => startEditing(selectedLoc)}>Editar Punto</button>
                  <button className="btn-admin-delete" onClick={() => handleDelete(selectedLoc.id)}>Deshabilitar</button>
                </div>
              )}

              {selectedLoc.address && <p className="details-addr" style={{display:'flex', alignItems:'flex-start', gap:'4px'}}><MapPin size={16} style={{marginTop:'2px', flexShrink:0}}/> {selectedLoc.address}</p>}
              {distTo(selectedLoc.lat, selectedLoc.lng) !== null && (
                <div className="details-dist">A {fmtDist(distTo(selectedLoc.lat, selectedLoc.lng))} de ti</div>
              )}

              {/* Leader Info & Phone Buttons */}
              {(selectedLoc.leader_name || selectedLoc.leader_phone) && (
                <div className="details-leader">
                  <strong style={{display:'flex', alignItems:'center', gap:'4px'}}><User size={16} /> Contacto / Líder:</strong> {selectedLoc.leader_name || 'Sin nombre'}
                  
                  {selectedLoc.leader_phone && (
                    <div className="contact-buttons">
                      <button className="btn-call" onClick={() => window.open(`tel:${selectedLoc.leader_phone}`)}>
                        <Phone size={16} /> Llamar
                      </button>
                      <button className="btn-wa" onClick={() => window.open(formatWaLink(selectedLoc.leader_phone!), '_blank')}>
                        <MessageCircle size={16} /> WhatsApp
                      </button>
                    </div>
                  )}
                </div>
              )}

              {selectedLoc.needs && (
                <div className="details-needs">
                  <strong style={{display:'flex', alignItems:'center', gap:'4px'}}><ListIcon size={16} /> ¿Qué se necesita?</strong>
                  <p>{selectedLoc.needs}</p>
                </div>
              )}

              <hr className="border-t border-gray-200 my-4" style={{margin: '16px 0', border: 'none', borderTop: '1px solid var(--gray-200)'}} />

              <button 
                className={`btn-ghost-verify ${mockVerifications[selectedLoc.id + '_self'] ? 'verified' : ''}`}
                onClick={async () => {
                  const isVerified = mockVerifications[selectedLoc.id + '_self'] === 1;
                  
                  // Optimistic UI Update
                  setMockVerifications(prev => ({
                    ...prev, 
                    [selectedLoc.id + '_self']: isVerified ? 0 : 1,
                    [selectedLoc.id]: (prev[selectedLoc.id] || 0) + (isVerified ? -1 : 1)
                  }));

                  if (!isVerified) {
                    showToast('¡Validación registrada!', `Gracias por confirmar que ${selectedLoc.name} sigue activo.`, selectedLoc.id);
                    if (!isDemoMode && supabase) {
                      await supabase.from('validations').insert({
                        location_id: selectedLoc.id,
                        device_id: deviceId
                      });
                    }
                  } else {
                    if (!isDemoMode && supabase) {
                      await supabase.from('validations').delete().match({
                        location_id: selectedLoc.id,
                        device_id: deviceId
                      });
                    }
                  }
                }}
              >
                <CheckCircle2 size={16} /> {mockVerifications[selectedLoc.id + '_self'] ? 'Confirmado por ti' : 'Confirmar actividad hoy'}
              </button>

              <div className="ephemeral-feed">
                <div className="ephemeral-feed-title">Notas Recientes (24h)</div>

                {/* PROGRESIVE DISCLOSURE INPUT */}
                <div className="ephemeral-input-wrapper">
                  <input 
                    type="text" 
                    className="ephemeral-input-pill" 
                    placeholder="Agregar reporte rápido..." 
                    maxLength={60}
                    value={ephemeralText}
                    onChange={(e) => setEphemeralText(e.target.value)}
                    onFocus={() => setIsTyping(true)}
                  />
                  <button 
                    className="ephemeral-send-btn" 
                    disabled={ephemeralText.trim().length === 0}
                    onClick={async () => {
                      const textToSend = ephemeralText;
                      const roleToSend = ephemeralRole;
                      
                      recentSentNotes.current.add(textToSend);

                      // Optimistic UI
                      setMockNotes(prev => [{role: roleToSend, text: textToSend, time: 'Ahora', locId: selectedLoc.id}, ...prev]);
                      showToast(`Reporte en ${selectedLoc.name}`, 'Tu reporte ya es visible para las personas a menos de 10km.', selectedLoc.id);
                      setEphemeralText('');
                      setIsTyping(false);
                      
                      if (!isDemoMode && supabase) {
                        await supabase.from('ephemeral_notes').insert({
                          location_id: selectedLoc.id,
                          role: roleToSend,
                          content: textToSend
                        });
                      }
                    }}
                  >
                    <Send size={14} style={{marginLeft: '-2px'}} />
                  </button>
                  {isTyping && (
                    <div className="ephemeral-roles">
                      {['Civil', 'Médico', 'Rescatista'].map(role => (
                        <button 
                          key={role}
                          className={`role-chip ${ephemeralRole === role ? 'active' : ''}`}
                          onClick={() => setEphemeralRole(role)}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                {mockNotes.filter(n => n.locId === 'all' || n.locId === selectedLoc.id).map((note, i) => (
                  <div className="ephemeral-item" style={{marginTop: i === 0 ? '16px' : '0'}} key={i}>
                    <span className="ephemeral-role">{note.role}</span>
                    <div>
                      {note.text} <span className="ephemeral-time">• {note.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="details-footer">
              <button className="details-go-btn" onClick={() => window.open(gmapsUrl(userPos?.lat ?? null, userPos?.lng ?? null, selectedLoc.lat, selectedLoc.lng), '_blank')} style={{margin: 0}}>
                <MapIcon size={18} /> Abrir ruta en Google Maps
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOCATION CHOOSER MODAL */}
      {showLocationChooser && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowLocationChooser(false); }}>
          <div className="modal-sheet chooser-sheet">
            <div className="list-handle" />
            <div className="modal-header" style={{ paddingBottom: '8px' }}>
              <h2>¿Dónde está el centro?</h2>
              <button className="modal-close" onClick={() => setShowLocationChooser(false)}>✕</button>
            </div>
            <div className="chooser-body">
              <button className="chooser-btn gps" onClick={handleChooseGPS}>
                <span className="chooser-icon"><MapPin size={24} /></span>
                <div className="chooser-text">
                  <strong>Usar mi ubicación actual</strong>
                  <span>Es más rápido y preciso usando el GPS</span>
                </div>
              </button>
              <div className="chooser-or">O</div>
              <button className="chooser-btn map" onClick={handleChooseMap}>
                <span className="chooser-icon"><Pointer size={24} /></span>
                <div className="chooser-text">
                  <strong>Seleccionar en el mapa a mano</strong>
                  <span>Toca el punto exacto en el mapa tú mismo</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD FORM */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) cancelPlacing(); }}>
          <div className="modal-sheet">
            <div className="list-handle" />
            <div className="modal-header">
              <h2 style={{display:'flex', alignItems:'center', gap:'8px'}}>{editingId ? <><Hospital size={20} /> Editar Acopio</> : <><Package size={20} /> Nuevo Centro</>}</h2>
              <button className="modal-close" onClick={cancelPlacing}>✕</button>
            </div>
            <form className="modal-body" onSubmit={handleSubmit}>
              <div className="selected-location">
                <span className="selected-location-icon"><MapPin size={24} color="#ef4444" /></span>
                <div>
                  <div className="selected-location-label">Ubicación seleccionada</div>
                  <div className="selected-location-addr">{placedAddress || 'Obteniendo dirección...'}</div>
                </div>
                {!editingId && <button type="button" className="selected-location-change" onClick={() => { setShowForm(false); setPlacedPos(null); }}>Cambiar</button>}
              </div>

              <div className="field">
                <label style={{display:'flex', alignItems:'center', gap:'4px'}}><MapPin size={14} /> Nombre del Lugar</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej: Iglesia San José..." required />
              </div>

              <div className="field">
                <label style={{display:'flex', alignItems:'center', gap:'4px'}}><Package size={14} /> Tipo de Lugar</label>
                <select value={formType} onChange={(e) => setFormType(e.target.value as any)}>
                  <option value="centro_acopio">Centro de Acopio</option>
                  <option value="hospital">Hospital / Clínica</option>
                  <option value="iglesia">Iglesia / Centro Religioso</option>
                </select>
              </div>
              
              <div className="field-row">
                <div className="field" style={{ flex: 1 }}>
                  <label style={{display:'flex', alignItems:'center', gap:'4px'}}><User size={14} /> Nombre Contacto</label>
                  <input value={formLeader} onChange={(e) => setFormLeader(e.target.value)} placeholder="Ej: María Pérez" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label style={{display:'flex', alignItems:'center', gap:'4px'}}><Phone size={14} /> Teléfono</label>
                  <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="Ej: 0414..." />
                </div>
              </div>

              <div className="field">
                <label style={{display:'flex', alignItems:'center', gap:'4px'}}><ListIcon size={14} /> ¿Qué se necesita? (Opcional)</label>
                <textarea value={formNeeds} onChange={(e) => setFormNeeds(e.target.value)} placeholder="Agua, comida, medicinas, ropa..." />
              </div>

              <button type="submit" className="btn-submit" disabled={submitting || !formName}>
                {submitting ? 'Guardando...' : (editingId ? 'Guardar Cambios' : 'Confirmar y agregar')}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* NOTIFICATIONS HISTORY MODAL */}
      {showNotifications && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowNotifications(false); }}>
          <div className="modal-sheet notifications-sheet">
            <div className="modal-handle" />
            <div className="modal-header" style={{paddingBottom: '8px'}}>
              <h2>Buzón de Notificaciones</h2>
              <button className="btn-close" onClick={() => setShowNotifications(false)}>✕</button>
            </div>
            
            <div style={{overflowY: 'auto', flex: 1}}>
              {notificationsHistory.length === 0 ? (
                <div style={{padding: '40px 20px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '14px'}}>
                  No tienes notificaciones recientes.
                </div>
              ) : (
                notificationsHistory.map(n => (
                  <div 
                    key={n.id} 
                    className={`notification-item ${!n.read ? 'unread' : ''}`}
                    onClick={() => {
                      if(n.locId) {
                        const loc = acopios.find(a => a.id === n.locId);
                        if(loc) openDetails(loc);
                      }
                      setShowNotifications(false);
                    }}
                  >
                    <div className="notification-icon"><Bell size={16} /></div>
                    <div className="notification-text">
                      <strong>{n.title}</strong>
                      <p>{n.desc}</p>
                      <span>{n.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATIONS */}
      {activeToast && (
        <div className="toast-container">
          <div 
            className="toast-pill" 
            style={{cursor: activeToast.locId ? 'pointer' : 'default'}}
            onClick={() => {
              if(activeToast.locId) {
                const loc = acopios.find(a => a.id === activeToast.locId);
                if(loc) openDetails(loc);
                setActiveToast(null);
              }
            }}
          >
            <div className="toast-icon">
              <Bell size={14} />
            </div>
            <div className="toast-content">
              <span className="toast-title">{activeToast.title}</span>
              <span className="toast-desc">{activeToast.desc}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
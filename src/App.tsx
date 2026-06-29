import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SwipeableSheet } from './components/SwipeableSheet';
import { supabase, isDemoMode, DEMO_ACOPIOS, getDistanceKm, reverseGeocode, getUserState, searchLocation } from './lib/supabase';
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

// ========== MAIN APP ==========
function App() {
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [acopios, setAcopios] = useState<LocationRow[]>([]);
  
  // Refs para evitar re-suscripción en WebSockets
  const userPosRef = useRef(userPos);
  const acopiosRef = useRef(acopios);
  const recentSentNotes = useRef<Set<string>>(new Set());
  const userStateRef = useRef<string>('');

  useEffect(() => { userPosRef.current = userPos; }, [userPos]);
  useEffect(() => { acopiosRef.current = acopios; }, [acopios]);

  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [locating, setLocating] = useState(true);

  // Buscador autocompletado
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (val.length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const res = await searchLocation(val);
      setSearchResults(res);
      setIsSearching(false);
    }, 350);
  };

  const handleSelectResult = (r: any) => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    setFlyTarget({ lat, lng: lon, zoom: 16 });
    setPlacedPos({ lat, lng: lon });
    setPlacedAddress(r.display_name);
    setShowForm(true);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Access Code System
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Comunidad Ambiental
  const [networkPulse, setNetworkPulse] = useState<string | null>(null);
  const [globalStats, setGlobalStats] = useState<{ centros_operativos: number, validaciones_24h: number } | null>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authCode, setAuthCode] = useState('');
  
  // Help modal
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Volunteer Radar (MOCK STATE FOR TEST BRANCH)
  const [showRadarModal, setShowRadarModal] = useState(false);

  useEffect(() => {
    if (!isDemoMode && supabase && showRadarModal) {
      supabase.from('global_stats').select('*').single().then(({ data }) => {
        if (data) setGlobalStats(data as any);
      });
    }
  }, [showRadarModal]);
  const [volRole, setVolRole] = useState('Transporte');
  const [hasActiveOffer, setHasActiveOffer] = useState(false);

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
  
  // Toast & History — con cache por dispositivo
  const [activeToast, setActiveToast] = useState<{title: string, desc: string, id: number, locId?: string} | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsHistory, setNotificationsHistory] = useState<{id: number, title: string, desc: string, time: string, locId?: string, read: boolean}[]>(() => {
    try {
      const cached = localStorage.getItem('notif_history');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });

  // Persistir notificaciones al cambiar
  useEffect(() => {
    try {
      const toSave = notificationsHistory.slice(0, 50); // Máximo 50 en caché
      localStorage.setItem('notif_history', JSON.stringify(toSave));
    } catch { /* quota exceeded */ }
  }, [notificationsHistory]);

  const showToast = (title: string, desc: string, locId?: string) => {
    const id = Date.now();
    setActiveToast({title, desc, id, locId});
    
    // Add to history
    const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    setNotificationsHistory(prev => [{id, title, desc, time: timeStr, locId, read: false}, ...prev.slice(0, 49)]);

    setTimeout(() => {
      setActiveToast(prev => prev?.id === id ? null : prev);
    }, 4000);
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
    
    // Polling silencioso para Validations/Feed cada 2 minutos
    const interval = setInterval(() => {
      fetchSocialData();
    }, 120_000);

    // Configurar suscripción en tiempo real a Supabase
    let channel: any;
    let socialChannel: any;
    let telemetryChannel: any;
    if (!isDemoMode && supabase) {
      channel = supabase
        .channel('realtime:public:locations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, (payload) => {
          fetchAcopios();
          if (payload.eventType === 'INSERT') {
            const st = userStateRef.current;
            if (st && payload.new.address && payload.new.address.includes(st)) {
              showToast(`Nuevo punto en tu zona`, `Se ha agregado ${payload.new.name} cerca de ti.`, payload.new.id);
            }
          }
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
              // Filtro de ruido: Solo alertar por roles críticos (Médico/Rescatista)
              if (payload.new.role === 'Médico' || payload.new.role === 'Rescatista') {
                showToast(`⚠️ ${payload.new.role} en ${loc.name}`, `${payload.new.content}`, loc.id);
              }
            }
          }
        })
        .subscribe();
      telemetryChannel = supabase
        .channel('realtime:public:telemetry')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telemetry_events' }, (payload) => {
          setNetworkPulse(payload.new.message);
        })
        .subscribe();
    }
    
    const startTime = Date.now();
    const finishLocating = () => {
      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, 3000 - elapsed);
      setTimeout(() => setLocating(false), delay);
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setUserPos({ lat, lng });
          setFlyTarget({ lat, lng, zoom: 13 });
          finishLocating();
          const stateStr = await getUserState(lat, lng);
          if (stateStr) userStateRef.current = stateStr;
        },
        (err) => {
          console.warn('Geolocation error:', err.message);
          setUserPos({ lat: 10.4806, lng: -66.9036 });
          setFlyTarget({ lat: 10.4806, lng: -66.9036, zoom: 8 });
          finishLocating();
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setUserPos({ lat: 10.4806, lng: -66.9036 });
      setFlyTarget({ lat: 10.4806, lng: -66.9036, zoom: 8 });
      finishLocating();
    }

    return () => {
      clearInterval(interval);
      if (channel) supabase?.removeChannel(channel);
      if (socialChannel) supabase?.removeChannel(socialChannel);
      if (telemetryChannel) supabase?.removeChannel(telemetryChannel);
    };
  }, [fetchAcopios, fetchSocialData, deviceId]);

  const allLocations = useMemo(() => acopios, [acopios]);
  const filtered = allLocations;

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
  const formatWaLink = (phone: string, textMessage?: string) => {
    let cleanPhone = phone.replace(/[^0-9+]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '58' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('58') && !cleanPhone.startsWith('+58')) {
      // Assume it's a Venezuelan number if it's 10 digits
      if (cleanPhone.length === 10) cleanPhone = '58' + cleanPhone;
    }
    // Remove +
    cleanPhone = cleanPhone.replace('+', '');
    
    let url = `https://wa.me/${cleanPhone}`;
    if (textMessage) {
      url += `?text=${encodeURIComponent(textMessage)}`;
    }
    return url;
  };

  return (
    <div className="app">
      {locating && (
        <div className="loading-overlay" style={{ padding: '32px', textAlign: 'center', background: 'var(--white)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'pulse 1.5s infinite' }}>🇻🇪</div>
          <h3 style={{ margin: '0 0 12px 0', color: 'var(--gray-900)', fontSize: '22px', fontWeight: '800' }}>No estás solo.</h3>
          <p style={{ margin: '0 0 24px 0', color: 'var(--gray-600)', fontSize: '15px', lineHeight: '1.5', maxWidth: '280px' }}>
            Conectando con tu comunidad y ubicando los centros de apoyo a tu alrededor...
          </p>
          <div className="loading-spinner" style={{ margin: '0 auto', borderTopColor: 'var(--primary)' }} />
          <style>{`
            @keyframes pulse {
              0% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.1); opacity: 0.8; }
              100% { transform: scale(1); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* PLACING HEADER */}
      {placingMode && !showForm && (
        <div className="placing-header">
          <div className="placing-banner">
            <span>👆 Toca el mapa para fijar punto</span>
            <button className="placing-cancel" onClick={cancelPlacing}>Cancelar</button>
          </div>
          <div className="autocomplete-container">
            <div className="autocomplete-input-wrap">
              <MapPin size={16} className="autocomplete-icon" />
              <input 
                type="text" 
                placeholder="O busca una dirección específica..." 
                value={searchQuery}
                onChange={handleSearchChange}
              />
              {isSearching && <div className="autocomplete-spinner" />}
            </div>
            {searchResults.length > 0 && (
              <div className="autocomplete-results">
                {searchResults.map((r, i) => (
                  <div key={i} className="autocomplete-item" onClick={() => handleSelectResult(r)}>
                    <div className="ac-title">{r.display_name.split(',')[0]}</div>
                    <div className="ac-subtitle">{r.display_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
            <div className="brand-text">Acopio<span>Ven</span></div>
          </div>
          {networkPulse && (
            <div className="network-pulse">
              <div className="network-pulse-text">{networkPulse}</div>
            </div>
          )}
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
            <button className="btn-circle" onClick={handleLocate} title="Mi ubicación"><MapPin size={18} /></button>
            <button className="btn-circle" onClick={() => setShowHelpModal(true)} title="Cómo funciona"><HelpCircle size={18} /></button>
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION BAR (Option A) */}
      {!placingMode && !showList && (
        <div className="bottom-nav-bar">
          {isUnlocked && (
            <button className="nav-btn" onClick={startPlacing}>
              <Plus size={20} />
              <span>Registrar</span>
            </button>
          )}
          <button className="nav-btn primary" onClick={() => setShowRadarModal(true)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✋</div>
            <span>Quiero Ayudar</span>
          </button>
          <button className="nav-btn" onClick={() => setShowList(true)}>
            <ListIcon size={20} />
            <span>Directorio</span>
          </button>
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



      {/* AUTH MODAL */}
      <SwipeableSheet isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} className="auth-card">
            <div className="list-handle" />
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
      </SwipeableSheet>

      {/* HELP MODAL */}
      <SwipeableSheet isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} className="help-sheet">
            <div className="list-handle" />
            <div className="modal-header">
              <h2 style={{display:'flex', alignItems:'center', gap:'8px'}}><HelpCircle size={20} /> ¿Cómo funciona?</h2>
              <button className="modal-close" onClick={() => setShowHelpModal(false)}>✕</button>
            </div>
            <div className="help-body">
              <div className="help-step">
                <span className="help-step-icon"><User size={22} /></span>
                <p><strong>100% Comunitario:</strong> Todo el mapa es construido por personas reales. No hay datos automáticos de mapas, lo que ves es estrictamente lo que la gente ha reportado activo.</p>
              </div>
              <div className="help-step">
                <span className="help-step-icon"><MessageCircle size={22} /></span>
                <p><strong>Reportes y Alertas:</strong> Entra a cualquier punto para comentar qué se necesita o confirmar que sigue activo. Las alertas de Médicos y Rescatistas notifican instantáneamente a 20km.</p>
              </div>
              <div className="help-step">
                <span className="help-step-icon" style={{ color: 'var(--gray-900)' }}>✋</span>
                <p><strong>Quiero Ayudar:</strong> Si tienes transporte, medicina o fuerza física para aportar, usa el botón <strong>Quiero Ayudar</strong> en la barra inferior para conectar directamente con los centros que necesitan tu ayuda.</p>
              </div>
              <div className="help-step" style={{ background: 'rgba(37,211,102,0.1)', padding: '10px', borderRadius: '8px' }}>
                <span className="help-step-icon" style={{ color: '#25D366' }}><MessageCircle size={22} /></span>
                <p><strong>Soporte y Registro:</strong> Si deseas agregar tu centro de acopio o tienes dudas sobre la plataforma, contáctanos al <a href="https://wa.me/584241930273" target="_blank" rel="noopener noreferrer" style={{ color: '#25D366', fontWeight: 'bold', textDecoration: 'none' }}>+58 424-1930273</a>.</p>
              </div>
              <button className="help-close-btn" onClick={() => setShowHelpModal(false)}>Entendido</button>
            </div>
      </SwipeableSheet>

      {/* LIST PANEL */}
      <SwipeableSheet isOpen={showList} onClose={() => setShowList(false)} className="list-sheet">
            <div className="list-handle" />
            <div className="list-header">
              <h2 style={{display:'flex', alignItems:'center', gap:'8px'}}><ListIcon size={20} /> Todos los puntos cercanos</h2>
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
      </SwipeableSheet>

      {/* DETAILS MODAL */}
      <SwipeableSheet isOpen={!!selectedLoc} onClose={() => setSelectedLoc(null)} className="details-sheet">
          {selectedLoc && (<>
            
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
                      <button className="btn-wa" onClick={() => {
                        const defaultMsg = `Hola, te contacto desde *AcopioVen*. Quisiera saber si el centro *${selectedLoc.name}* está necesitando apoyo o insumos ahora mismo.`;
                        window.open(formatWaLink(selectedLoc.leader_phone!, defaultMsg), '_blank');
                      }}>
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
          </>)}
      </SwipeableSheet>

      {/* LOCATION CHOOSER MODAL */}
      <SwipeableSheet isOpen={showLocationChooser} onClose={() => setShowLocationChooser(false)} className="chooser-sheet">
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
      </SwipeableSheet>

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
      {/* RADAR OVERLAY (TEST BRANCH) */}
      {showRadarModal && (
        <div className="modal-overlay" style={{ background: 'white', zIndex: 9999 }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', maxWidth: '600px', margin: '0 auto', background: 'white' }}>
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--gray-200)', background: 'white' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', margin: 0 }}>✋ Quiero Ayudar</h2>
              <button onClick={() => setShowRadarModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            {globalStats && (
              <div className="global-stats-board">
                <div className="global-stats-val">{globalStats.centros_operativos}</div>
                <div className="global-stats-lbl">Centros Operativos</div>
              </div>
            )}
            <div style={{ padding: '16px', flex: 1, overflowY: 'auto', background: 'var(--gray-50)' }}>
              {!hasActiveOffer ? (
                <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid var(--gray-200)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ fontSize: '18px', margin: '0 0 8px 0', textAlign: 'center' }}>¿Quieres ayudar?</h3>
                  <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--gray-600)', textAlign: 'center' }}>Dinos qué ofreces y te conectaremos con los centros que te necesitan ahora mismo.</p>
                  
                  <select value={volRole} onChange={e => setVolRole(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '12px', borderRadius: '8px', border: '1px solid var(--gray-300)', fontSize: '15px', background: 'white' }}>
                    <option value="Transporte">🚚 Transporte (Camión/Moto)</option>
                    <option value="Médico">⚕️ Personal Médico / Rescate</option>
                    <option value="Logística">💪 Fuerza Física / Logística</option>
                  </select>
                  
                  <button 
                    style={{ width: '100%', background: 'var(--gray-900)', color: 'white', padding: '14px', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}
                    onClick={() => {
                      setHasActiveOffer(true); // Activa la vista de resultados
                    }}
                  >
                    Buscar centros cerca de mí
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: 'var(--gray-800)' }}>Centros que necesitan tu ayuda ({volRole})</p>
                    <button onClick={() => setHasActiveOffer(false)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>Cambiar rol</button>
                  </div>
                  
                  {acopios.filter(a => a.leader_phone).slice(0, 3).map(center => {
                    const dist = userPos ? distTo(center.lat, center.lng) : Math.random() * 5 + 1;
                    return (
                    <div key={center.id} style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid var(--gray-200)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '16px', color: 'var(--gray-900)' }}>{center.name}</div>
                        <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>A {typeof dist === 'number' ? dist.toFixed(1) : dist} km de tu ubicación</div>
                        {center.needs && <div style={{ fontSize: '13px', color: 'var(--gray-700)', marginTop: '4px' }}><strong>Necesitan:</strong> {center.needs}</div>}
                      </div>
                      <button 
                        style={{ background: '#25D366', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                        onClick={() => {
                          let cleanPhone = center.leader_phone!.replace(/[^0-9]/g, '');
                          const msg = `🆘 *AcopioVen — Nuevo Voluntario*\n\nHola, soy voluntario y estoy cerca de tu centro *${center.name}*.\n\nOfrezco: *${volRole}*\n\n¿Están necesitando apoyo ahora mismo?`;
                          window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
                        }}
                      >
                        <MessageCircle size={16} /> Enviar WhatsApp al Líder
                      </button>
                    </div>
                  )})}
                  
                  {acopios.filter(a => a.leader_phone).length === 0 && (
                     <div style={{ padding: '20px', textAlign: 'center', color: 'var(--gray-500)' }}>No hay centros con número de contacto en esta zona.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS HISTORY MODAL */}
      <SwipeableSheet isOpen={showNotifications} onClose={() => setShowNotifications(false)} className="notifications-sheet">
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
      </SwipeableSheet>

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
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, isDemoMode, HOSPITALS, DEMO_ACOPIOS, getDistanceKm, reverseGeocode } from './lib/supabase';
import { Lock, Plus, List as ListIcon, MapPin, HelpCircle, Hospital, Church, Package, Phone, MessageCircle, Map as MapIcon, User, Pointer } from 'lucide-react';
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

  // Check auth status on mount
  useEffect(() => {
    if (localStorage.getItem('sos_admin') === 'true') {
      setIsUnlocked(true);
    }
  }, []);

  const openDetails = (loc: LocationRow) => {
    setShowList(false);
    setSelectedLoc(loc);
    setMapFlyTo({ lat: loc.lat, lng: loc.lng });
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authCode === 'SOS-VZLA-2026') {
      setIsUnlocked(true);
      localStorage.setItem('sos_admin', 'true');
      setShowAuthModal(false);
      setAuthCode('');
      alert('✅ Modo Administrador desbloqueado. Ahora puedes agregar centros de acopio.');
    } else {
      alert('❌ Código incorrecto');
    }
  };

  const fetchAcopios = useCallback(async () => {
    if (isDemoMode || !supabase) { setAcopios(DEMO_ACOPIOS); return; }
    const { data, error } = await supabase.from('locations').select('*');
    if (error) console.error(error);
    else setAcopios(data || []);
  }, []);

  useEffect(() => {
    fetchAcopios();
    
    // Configurar suscripción en tiempo real a Supabase
    let channel: any;
    if (!isDemoMode && supabase) {
      channel = supabase
        .channel('realtime:public:locations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => {
          fetchAcopios();
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
    };
  }, [fetchAcopios]);

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
        const updateData = { ...rowData };
        delete (updateData as any).lat;
        delete (updateData as any).lng;
        delete (updateData as any).address;
        const { error } = await supabase.from('locations').update(updateData).eq('id', editingId);
        if (error) alert('Error actualizando: ' + error.message);
      } else {
        setAcopios(prev => prev.map(a => a.id === editingId ? { ...a, ...rowData, lat: a.lat, lng: a.lng, address: a.address } : a));
      }
    } else {
      if (!isDemoMode && supabase) {
        const { error } = await supabase.from('locations').insert([rowData]);
        if (error) alert('Error guardando: ' + error.message);
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
    if (!confirm('¿Seguro que deseas eliminar este punto de forma permanente?')) return;
    if (!isDemoMode && supabase) {
      const { error } = await supabase.from('locations').delete().eq('id', id);
      if (error) alert('Error eliminando: ' + error.message);
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
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
            attribution='&copy; OSM'
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
              <Marker key={loc.id} position={[loc.lat, loc.lng]} icon={makeIcon(loc.type, isNearest)}>
                <Popup>
                  <div className="popup-card">
                    <div className="popup-body">
                      <div className="popup-name">{loc.type === 'hospital' ? '🏥' : loc.type === 'iglesia' ? '⛪' : '📦'} {loc.name}</div>
                      <div className="popup-type">{loc.type === 'hospital' ? 'Hospital' : loc.type === 'iglesia' ? 'Iglesia' : 'Centro de Acopio'}</div>
                      {loc.address && <div className="popup-addr">📍 {loc.address}</div>}
                    </div>
                    <button className="popup-go" onClick={() => openDetails(loc)}>
                      Ver más info
                    </button>
                  </div>
                </Popup>
              </Marker>
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
              <div className="details-type" style={{display:'flex', alignItems:'center', gap:'4px'}}>{selectedLoc.type === 'hospital' ? <><Hospital size={14}/> Hospital</> : selectedLoc.type === 'iglesia' ? <><Church size={14}/> Iglesia</> : <><Package size={14}/> Centro de Acopio</>}</div>
              <h2 className="details-title">{selectedLoc.name}</h2>
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

              {isUnlocked && acopios.some(a => a.id === selectedLoc.id) && (
                <div className="admin-actions">
                  <button className="btn-admin-edit" onClick={() => startEditing(selectedLoc)}>Editar Punto</button>
                  <button className="btn-admin-delete" onClick={() => handleDelete(selectedLoc.id)}>Eliminar</button>
                </div>
              )}

              <button className="details-go-btn" onClick={() => window.open(gmapsUrl(userPos?.lat ?? null, userPos?.lng ?? null, selectedLoc.lat, selectedLoc.lng), '_blank')}>
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
    </div>
  );
}

export default App;
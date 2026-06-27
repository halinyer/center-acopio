import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, isDemoMode, HOSPITALS, DEMO_ACOPIOS, getDistanceKm, reverseGeocode } from './lib/supabase';
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

// COMPONENTE: Carga dinámica de hospitales al mover el mapa
function DynamicHospitals({ setOsmHospitals }: { setOsmHospitals: React.Dispatch<React.SetStateAction<LocationRow[]>> }) {
  const map = useMapEvents({
    moveend: async () => {
      // Evitar sobrecargar si el zoom es muy lejano
      if (map.getZoom() < 12) return; 
      
      const bounds = map.getBounds();
      const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
      
      // Query a Overpass API para hospitales, clínicas e iglesias cristianas
      const query = `[out:json][timeout:10];(
        node["amenity"~"hospital|clinic"](${bbox});
        way["amenity"~"hospital|clinic"](${bbox});
        node["amenity"="place_of_worship"]["religion"="christian"](${bbox});
        way["amenity"="place_of_worship"]["religion"="christian"](${bbox});
      );out center;`;
      const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
      
      try {
        const res = await fetch(url);
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
            name = el.tags?.amenity === 'clinic' ? 'Clínica' : 'Hospital';
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

        // Guardamos los hospitales evitando duplicados por ID
        setOsmHospitals(prev => {
          const map = new Map(prev.map(h => [h.id, h]));
          newHospitals.forEach(h => map.set(h.id, h));
          return Array.from(map.values());
        });
      } catch (err) {
        console.error('Error cargando hospitales OSM:', err);
      }
    }
  });
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

  // Placing mode
  const [showLocationChooser, setShowLocationChooser] = useState(false);
  const [placingMode, setPlacingMode] = useState(false);
  const [placedPos, setPlacedPos] = useState<{ lat: number; lng: number } | null>(null);
  const [placedAddress, setPlacedAddress] = useState('');
  const [showForm, setShowForm] = useState(false);
  
  // Form fields
  const [formName, setFormName] = useState('');
  const [formNeeds, setFormNeeds] = useState('');
  const [formLeader, setFormLeader] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPhoto, setFormPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Check auth status on mount
  useEffect(() => {
    if (localStorage.getItem('sos_admin') === 'true') {
      setIsUnlocked(true);
    }
  }, []);

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
    const { data, error } = await supabase.from('locations').select('*').eq('type', 'centro_acopio');
    if (error) console.error(error);
    else setAcopios(data || []);
  }, []);

  useEffect(() => {
    fetchAcopios();
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
    if (filter === 'hospital') return allHospitals.filter(h => h.type === 'hospital');
    if (filter === 'iglesia') return allHospitals.filter(h => h.type === 'iglesia');
    if (filter === 'acopio') return acopios;
    return allLocations;
  }, [filter, allLocations, acopios, allHospitals]);

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

  const startPlacing = () => { setShowLocationChooser(true); setPlacedPos(null); setPlacedAddress(''); setShowForm(false); setPlacingMode(false); };
  
  const cancelPlacing = () => { 
    setPlacingMode(false); setShowLocationChooser(false); setPlacedPos(null); setPlacedAddress(''); setShowForm(false); setFormName(''); setFormNeeds(''); setFormLeader(''); setFormPhone(''); setFormPhoto(null); 
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

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormPhoto(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !placedPos) return;

    const photoUrl = formPhoto ? URL.createObjectURL(formPhoto) : undefined;

    const newAcopio: LocationRow = {
      id: `local-${Date.now()}`, name: formName, type: 'centro_acopio',
      needs: formNeeds, address: placedAddress, 
      leader_name: formLeader, leader_phone: formPhone,
      photo_url: photoUrl, lat: placedPos.lat, lng: placedPos.lng,
      updated_at: new Date().toISOString(),
    };
    
    setSubmitting(true);
    
    if (!isDemoMode && supabase) {
      const session = await supabase.auth.getSession();
      const { error } = await supabase.from('locations').insert([{
        name: newAcopio.name, type: 'centro_acopio', needs: newAcopio.needs,
        leader_name: newAcopio.leader_name, leader_phone: newAcopio.leader_phone,
        lat: newAcopio.lat, lng: newAcopio.lng,
        created_by: session?.data?.session?.user?.id,
      }]);
      if (error) { alert(error.message); setSubmitting(false); return; }
      await fetchAcopios();
    } else {
      setAcopios((prev) => [...prev, newAcopio]);
    }
    
    cancelPlacing();
    setSubmitting(false);
    setFlyTarget({ lat: newAcopio.lat, lng: newAcopio.lng, zoom: 15 });
  };

  const fmtDist = (d: number | null) => {
    if (d === null) return '';
    return d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`;
  };

  const openDetails = (loc: LocationRow) => {
    setShowList(false);
    setSelectedLoc(loc);
  };

  // WhatsApp formatter
  const formatWaLink = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
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
        <MapContainer center={[10.4806, -66.9036]} zoom={8} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer 
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
            attribution='&copy; OSM'
            detectRetina={true}
          />
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
            <div className="brand-icon">📦</div>
            <div className="brand-text">Acopio<span>Venezuela</span></div>
          </div>
          <div className="top-actions">
            {!isUnlocked && (
              <button className="btn-circle" onClick={() => setShowAuthModal(true)} title="Acceso Líderes">🔒</button>
            )}
            {isUnlocked && (
              <button className="btn-pill btn-add-top" onClick={startPlacing}>➕ <span>Agregar</span></button>
            )}
            <button className="btn-pill" onClick={() => setShowList(true)}>📋 <span>Ver lista</span></button>
            <button className="btn-circle" onClick={handleLocate} title="Mi ubicación">📍</button>
            <button className="btn-circle" onClick={() => setShowHelpModal(true)} title="Cómo funciona">❓</button>
          </div>
        </div>
      )}

      {nearest && !placingMode && !showList && !selectedLoc && (
        <div className="nearest-chip" onClick={() => openDetails(nearest.location)}>
          <div className="chip-dot" />
          <div className="chip-info">
            <div className="chip-name">{nearest.location.name}</div>
            <div className="chip-dist">📦 Más cercano · {fmtDist(nearest.distance)}</div>
          </div>
        </div>
      )}

      {!placingMode && (
        <div className="bottom-bar-wrapper">
          <div className="bottom-bar-scroll">
            <button className={`filter-pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>🗺️ Todos</button>
            <button className={`filter-pill ${filter === 'hospital' ? 'active' : ''}`} onClick={() => setFilter('hospital')}>🏥 Hospitales</button>
            <button className={`filter-pill ${filter === 'iglesia' ? 'active' : ''}`} onClick={() => setFilter('iglesia')}>⛪ Iglesias</button>
            <button className={`filter-pill ${filter === 'acopio' ? 'active' : ''}`} onClick={() => setFilter('acopio')}>📦 Acopio</button>
          </div>
        </div>
      )}

      {/* AUTH MODAL */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}>
          <div className="auth-card">
            <h2>🔒 Acceso a Líderes</h2>
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
              <h2>❓ ¿Cómo funciona?</h2>
              <button className="modal-close" onClick={() => setShowHelpModal(false)}>✕</button>
            </div>
            <div className="help-body">
              <div className="help-step">
                <span className="help-step-icon">🏥 / ⛪</span>
                <p><strong>Hospitales e Iglesias:</strong> Se cargan automáticamente del mapa oficial libre de Venezuela al mover la pantalla. No tienes que agregarlos.</p>
              </div>
              <div className="help-step">
                <span className="help-step-icon">📦</span>
                <p><strong>Centros de Acopio (Rojos):</strong> Son los puntos de ayuda activos. Toca cualquiera para ver qué insumos necesitan y su teléfono.</p>
              </div>
              <div className="help-step">
                <span className="help-step-icon">📞 / 💬</span>
                <p><strong>Contacto Directo:</strong> Puedes llamar al líder del centro o enviarle un WhatsApp directo en 1 clic para coordinar tu entrega.</p>
              </div>
              <div className="help-step">
                <span className="help-step-icon">🔒</span>
                <p><strong>Agregar Puntos:</strong> Exclusivo para médicos, sacerdotes y líderes con código de autorización. Toca el candado e ingresa el código.</p>
              </div>
              <button className="help-close-btn" onClick={() => setShowHelpModal(false)}>Entendido</button>
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
              <h2>📋 {filter === 'all' ? 'Todos los puntos' : filter === 'hospital' ? 'Hospitales' : filter === 'iglesia' ? 'Iglesias' : 'Centros de Acopio'} cercanos</h2>
              <button className="list-close" onClick={() => setShowList(false)}>✕</button>
            </div>
            
            <div className="list-search-container">
              <input 
                type="text" 
                className="list-search-input" 
                placeholder="🔍 Buscar por nombre o dirección..." 
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
                      {loc.type === 'hospital' ? '🏥' : loc.type === 'iglesia' ? '⛪' : '📦'}
                    </div>
                    <div className="list-item-info">
                      <div className="list-item-name">{loc.name}</div>
                      <div className="list-item-addr">{loc.address || (loc.type === 'hospital' ? 'Hospital' : loc.type === 'iglesia' ? 'Iglesia' : 'Centro de Acopio')}</div>
                      {dist !== null && <div className="list-item-dist">📏 {fmtDist(dist)}</div>}
                    </div>
                    <button className="list-item-go">Info</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* DETAILS MODAL */}
      {selectedLoc && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedLoc(null); }}>
          <div className="modal-sheet details-sheet">
            <div className="list-handle" />
            
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
              <div className="details-type">{selectedLoc.type === 'hospital' ? '🏥 Hospital' : selectedLoc.type === 'iglesia' ? '⛪ Iglesia' : '📦 Centro de Acopio'}</div>
              <h2 className="details-title">{selectedLoc.name}</h2>
              {selectedLoc.address && <p className="details-addr">📍 {selectedLoc.address}</p>}
              {distTo(selectedLoc.lat, selectedLoc.lng) !== null && (
                <div className="details-dist">📏 A {fmtDist(distTo(selectedLoc.lat, selectedLoc.lng))} de ti</div>
              )}

              {/* Leader Info & Phone Buttons */}
              {(selectedLoc.leader_name || selectedLoc.leader_phone) && (
                <div className="details-leader">
                  <strong>👤 Contacto / Líder:</strong> {selectedLoc.leader_name || 'Sin nombre'}
                  
                  {selectedLoc.leader_phone && (
                    <div className="contact-buttons">
                      <button className="btn-call" onClick={() => window.open(`tel:${selectedLoc.leader_phone}`)}>
                        📞 Llamar
                      </button>
                      <button className="btn-wa" onClick={() => window.open(formatWaLink(selectedLoc.leader_phone!), '_blank')}>
                        💬 WhatsApp
                      </button>
                    </div>
                  )}
                </div>
              )}

              {selectedLoc.needs && (
                <div className="details-needs">
                  <strong>📝 ¿Qué se necesita?</strong>
                  <p>{selectedLoc.needs}</p>
                </div>
              )}

              <button className="details-go-btn" onClick={() => window.open(gmapsUrl(userPos?.lat ?? null, userPos?.lng ?? null, selectedLoc.lat, selectedLoc.lng), '_blank')}>
                🗺️ Abrir ruta en Google Maps
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
                <span className="chooser-icon">📍</span>
                <div className="chooser-text">
                  <strong>Usar mi ubicación actual</strong>
                  <span>Es más rápido y preciso usando el GPS</span>
                </div>
              </button>
              <div className="chooser-or">O</div>
              <button className="chooser-btn map" onClick={handleChooseMap}>
                <span className="chooser-icon">👆</span>
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
      {showForm && placedPos && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) cancelPlacing(); }}>
          <div className="modal-sheet">
            <div className="list-handle" />
            <div className="modal-header">
              <h2>📦 Nuevo Centro de Acopio</h2>
              <button className="modal-close" onClick={cancelPlacing}>✕</button>
            </div>
            <form className="modal-body" onSubmit={handleSubmit}>
              <div className="selected-location">
                <span className="selected-location-icon">📍</span>
                <div>
                  <div className="selected-location-label">Ubicación seleccionada</div>
                  <div className="selected-location-addr">{placedAddress || 'Obteniendo dirección...'}</div>
                </div>
                <button type="button" className="selected-location-change" onClick={() => { setShowForm(false); setPlacedPos(null); }}>Cambiar</button>
              </div>

              <div className="field">
                <label>Nombre del lugar *</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej: Iglesia San José..." required />
              </div>
              
              <div className="field-row">
                <div className="field" style={{ flex: 1 }}>
                  <label>👤 Nombre Contacto</label>
                  <input value={formLeader} onChange={(e) => setFormLeader(e.target.value)} placeholder="Ej: María Pérez" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>📞 Teléfono</label>
                  <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="Ej: 0414..." />
                </div>
              </div>

              <div className="field">
                <label>📝 ¿Qué se necesita? (Opcional)</label>
                <textarea value={formNeeds} onChange={(e) => setFormNeeds(e.target.value)} placeholder="Agua, comida, medicinas, ropa..." />
              </div>
              
              <div className="field">
                <label>📸 Foto del lugar (Opcional)</label>
                <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ padding: '8px' }} />
              </div>

              <button type="submit" className="btn-submit" disabled={submitting || !formName}>
                {submitting ? '⏳ Guardando...' : '✅ Confirmar y agregar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
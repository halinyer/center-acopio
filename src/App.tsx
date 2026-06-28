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

function App() {
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [acopios, setAcopios] = useState<LocationRow[]>([]);
  const [osmHospitals, setOsmHospitals] = useState<LocationRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'hospital' | 'acopio' | 'iglesia'>('all');
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [locating, setLocating] = useState(true);

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);

  const [showList, setShowList] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [selectedLoc, setSelectedLoc] = useState<LocationRow | null>(null);

  const [showLocationChooser, setShowLocationChooser] = useState(false);
  const [placingMode, setPlacingMode] = useState(false);
  const [placedPos, setPlacedPos] = useState<{ lat: number; lng: number } | null>(null);
  const [placedAddress, setPlacedAddress] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formName, setFormName] = useState('');
  const [formNeeds, setFormNeeds] = useState('');
  const [formLeader, setFormLeader] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPhoto, setFormPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      alert('✅ Modo Administrador desbloqueado.');
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

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return alert('El nombre es obligatorio');
    if (!placedPos && !editingId) return alert('Falta la ubicación');
    
    setSubmitting(true);
    
    const rowData = {
      name: formName,
      type: 'centro_acopio',
      needs: formNeeds,
      address: placedAddress,
      lat: placedPos?.lat || 0,
      lng: placedPos?.lng || 0,
      leader_name: formLeader,
      leader_phone: formPhone,
      updated_at: new Date().toISOString()
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
        setAcopios(prev => [...prev, { id: 'a' + Date.now(), ...rowData } as any]);
      }
    }
    
    setSubmitting(false);
    setShowForm(false);
    setPlacingMode(false);
    setPlacedPos(null);
    setEditingId(null);
    setSelectedLoc(null);
    await fetchAcopios();
  };

  const startEditing = (loc: LocationRow) => {
    setEditingId(loc.id);
    setFormName(loc.name);
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

  useEffect(() => {
    fetchAcopios();
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
    const map = new Map();
    HOSPITALS.forEach(h => map.set(h.id, h));
    osmHospitals.forEach(h => map.set(h.id, h));
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

  const startPlacing = () => { setShowLocationChooser(true); setPlacedPos(null); setPlacedAddress(''); setShowForm(false); setPlacingMode(false); setEditingId(null); };
  
  const cancelPlacing = () => { 
    setPlacingMode(false); setShowLocationChooser(false); setPlacedPos(null); setPlacedAddress(''); setShowForm(false); setFormName(''); setFormNeeds(''); setFormLeader(''); setFormPhone(''); setFormPhoto(null); setEditingId(null);
  };

  const handleChooseMap = () => {
    setShowLocationChooser(false);
    setPlacingMode(true);
  };

  const handleChooseGPS = () => {
    if (!navigator.geolocation) { alert("Tu navegador no soporta GPS"); return; }
    setShowLocationChooser(false);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPlacedPos({ lat, lng });
        const addr = await reverseGeocode(lat, lng);
        setPlacedAddress(addr || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        setLocating(false);
        setShowForm(true);
      },
      () => {
        setLocating(false);
        alert("No pudimos obtener tu ubicación actual.");
        handleChooseMap();
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

  const fmtDist = (d: number | null) => {
    if (d === null) return '';
    return d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`;
  };

  const openDetails = (loc: LocationRow) => {
    setShowList(false);
    setSelectedLoc(loc);
  };

  return (
    <div className="app">
      {locating && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">Obteniendo tu ubicación...</div>
        </div>
      )}

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
                    </div>
                    <button className="popup-go" onClick={() => openDetails(loc)}>Ver más info</button>
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
            {!isUnlocked && <button className="btn-circle" onClick={() => setShowAuthModal(true)} title="Acceso Líderes">🔒</button>}
            {isUnlocked && <button className="btn-pill btn-add-top" onClick={startPlacing}>➕ <span>Agregar</span></button>}
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

      {showAuthModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}>
          <div className="auth-card">
            <h2>🔒 Acceso a Líderes</h2>
            <form onSubmit={handleAuthSubmit}>
              <input type="password" value={authCode} onChange={(e) => setAuthCode(e.target.value)} placeholder="Código de acceso..." autoFocus />
              <div className="auth-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowAuthModal(false)}>Cancelar</button>
                <button type="submit" className="btn-submit-auth">Verificar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showHelpModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowHelpModal(false); }}>
          <div className="modal-sheet help-sheet">
            <div className="modal-header"><h2>❓ ¿Cómo funciona?</h2><button className="modal-close" onClick={() => setShowHelpModal(false)}>✕</button></div>
            <div className="help-body">
              <p>Carga los puntos de ayuda de Venezuela. Los administradores pueden gestionar centros.</p>
              <button className="help-close-btn" onClick={() => setShowHelpModal(false)}>Entendido</button>
            </div>
          </div>
        </div>
      )}

      {showList && (
        <div className="list-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowList(false); }}>
          <div className="list-sheet">
            <div className="list-header"><h2>📋 Lista de puntos</h2><button className="list-close" onClick={() => setShowList(false)}>✕</button></div>
            <div className="list-search-container"><input type="text" placeholder="🔍 Buscar..." value={listSearch} onChange={(e) => setListSearch(e.target.value)} /></div>
            <div className="list-body">
              {listItems.map((loc) => (
                <div key={loc.id} className="list-item" onClick={() => openDetails(loc)}>
                  <div className={`list-item-icon ${loc.type}`}>{loc.type === 'hospital' ? '🏥' : loc.type === 'iglesia' ? '⛪' : '📦'}</div>
                  <div className="list-item-info">
                    <div className="list-item-name">{loc.name}</div>
                    <div className="list-item-addr">{loc.address || 'Ubicación'}</div>
                  </div>
                  <button className="list-item-go">Info</button>
                </div>
              ))}
              <div className="powered-by">Powered by <strong>signalNote</strong></div>
            </div>
          </div>
        </div>
      )}

      {selectedLoc && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedLoc(null); }}>
          <div className="modal-sheet details-sheet">
            <div className="details-body">
              <h2 className="details-title">{selectedLoc.name}</h2>
              <p className="details-addr">📍 {selectedLoc.address}</p>
              {(selectedLoc.leader_name || selectedLoc.leader_phone) && (
                <div className="details-leader">
                  <strong>👤 Contacto:</strong> {selectedLoc.leader_name}
                  {selectedLoc.leader_phone && (
                    <div className="contact-buttons">
                      <a href={`tel:${selectedLoc.leader_phone.replace(/\D/g, '')}`} className="btn-call">📞 Llamar</a>
                      <a href={`https://wa.me/${selectedLoc.leader_phone.replace(/\D/g, '')}`} target="_blank" className="btn-wa">💬 WhatsApp</a>
                    </div>
                  )}
                </div>
              )}
              {selectedLoc.needs && <div className="details-needs"><strong>📝 Necesidades:</strong><p>{selectedLoc.needs}</p></div>}
              {isUnlocked && selectedLoc.type === 'centro_acopio' && (
                <div className="admin-actions">
                  <button className="btn-admin-edit" onClick={() => startEditing(selectedLoc)}>✏️ Editar</button>
                  <button className="btn-admin-delete" onClick={() => handleDelete(selectedLoc.id)}>🗑️ Borrar</button>
                </div>
              )}
              <button className="details-go-btn" onClick={() => window.open(gmapsUrl(userPos?.lat ?? null, userPos?.lng ?? null, selectedLoc.lat, selectedLoc.lng), '_blank')}>🗺️ Google Maps</button>
              
              <div className="powered-by">Powered by <strong>signalNote</strong></div>
            </div>
          </div>
        </div>
      )}

      {showLocationChooser && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowLocationChooser(false); }}>
          <div className="modal-sheet chooser-sheet">
            <div className="modal-header"><h2>¿Dónde está el centro?</h2><button className="modal-close" onClick={() => setShowLocationChooser(false)}>✕</button></div>
            <div className="chooser-body">
              <button className="chooser-btn" onClick={handleChooseGPS}>📍 Usar ubicación actual</button>
              <button className="chooser-btn" onClick={handleChooseMap}>👆 Seleccionar en mapa</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{editingId ? '✏️ Editar Acopio' : '📦 Nuevo Centro'}</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditingId(null); }}>✕</button>
            </div>
            <form className="form-body" onSubmit={handleFormSubmit}>
              <div className="field">
                <label>Nombre del lugar *</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </div>
              <div className="field">
                <label>📞 Teléfono</label>
                <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              </div>
              <div className="field">
                <label>📝 ¿Qué se necesita?</label>
                <textarea value={formNeeds} onChange={(e) => setFormNeeds(e.target.value)} />
              </div>
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? 'Guardando...' : (editingId ? '💾 Guardar Cambios' : '✅ Publicar')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, MapPin, Plus, HeartPulse, Box, List, Info, Loader2, CheckCircle } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';

// 1. Inicialización segura de Firebase
let app, auth, db, appId;
try {
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  appId = typeof __app_id !== 'undefined' ? __app_id : 'sos-venezuela-map';
} catch (e) {
  console.error("Error al inicializar Firebase:", e);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [view, setView] = useState('list'); // 'list' | 'add' | 'info'
  const [filter, setFilter] = useState('all'); // 'all' | 'hospital' | 'acopio'
  const [newMarkerCoords, setNewMarkerCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    type: 'centro_acopio',
    needs: ''
  });

  // Referencias para el mapa Leaflet
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerGroup = useRef(null);

  // 2. Autenticación (Requerido para Base de Datos)
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Error de autenticación:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // 3. Sincronización en Tiempo Real con Firestore
  useEffect(() => {
    if (!user || !db) return;

    // Ruta estricta de base de datos pública
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'locations');
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Ordenar localmente (los más recientes primero)
      data.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setLocations(data);
    }, (error) => {
      console.error("Error obteniendo datos de Firestore:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // 4. Inicialización e Inyección del Mapa Leaflet
  useEffect(() => {
    let isMounted = true;

    const initMap = () => {
      if (!mapRef.current || mapInstance.current) return;
      
      // Centro en Venezuela (Zona centro-norte)
      mapInstance.current = window.L.map(mapRef.current).setView([10.2353, -67.6253], 8);
      
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(mapInstance.current);

      markerGroup.current = window.L.layerGroup().addTo(mapInstance.current);

      // Evento global de clic en el mapa
      mapInstance.current.on('click', (e) => {
        setNewMarkerCoords([e.latlng.lat, e.latlng.lng]);
        setView('add'); // Cambiar a la vista de agregar automáticamente
      });

      renderMarkers();
    };

    const loadLeaflet = async () => {
      if (!window.L) {
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        if (!document.getElementById('leaflet-js')) {
          const script = document.createElement('script');
          script.id = 'leaflet-js';
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          document.head.appendChild(script);
          await new Promise(r => { script.onload = r; });
        } else {
          while (!window.L) await new Promise(r => setTimeout(r, 100));
        }
      }
      if (isMounted) initMap();
    };

    loadLeaflet();

    return () => {
      isMounted = false;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // 5. Renderizado Reactivo de Marcadores
  const renderMarkers = () => {
    if (!window.L || !markerGroup.current) return;
    markerGroup.current.clearLayers();

    // Filtrar marcadores existentes
    const visibleLocations = filter === 'all' ? locations : locations.filter(l => l.type === filter);

    visibleLocations.forEach(loc => {
      if (!loc.lat || !loc.lng) return;
      
      const emoji = loc.type === 'hospital' ? '🏥' : '📦';
      const color = loc.type === 'hospital' ? '#ef4444' : '#3b82f6';
      
      const icon = window.L.divIcon({
        html: `<div style="font-size: 20px; background: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 2px solid ${color};">${emoji}</div>`,
        className: 'custom-leaflet-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
      });

      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; min-width: 180px;">
          <h3 style="margin: 0 0 6px 0; font-weight: bold; font-size: 15px;">${loc.name}</h3>
          <span style="background: ${loc.type === 'hospital' ? '#fee2e2' : '#dbeafe'}; color: ${loc.type === 'hospital' ? '#991b1b' : '#1e40af'}; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; display: inline-block; margin-bottom: 8px; text-transform: uppercase;">
            ${loc.type === 'hospital' ? 'Hospital' : 'Centro de Acopio'}
          </span>
          <p style="margin: 0; font-size: 13px; color: #374151; line-height: 1.4;"><strong>Necesitan:</strong><br/>${loc.needs}</p>
        </div>
      `;

      window.L.marker([loc.lat, loc.lng], { icon })
        .bindPopup(popupHtml)
        .addTo(markerGroup.current);
    });

    // Renderizar marcador temporal de creación
    if (newMarkerCoords) {
      const draftIcon = window.L.divIcon({
        html: `<div style="font-size: 24px; animation: bounce 1s infinite;">📍</div>`,
        className: 'custom-leaflet-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });
      window.L.marker(newMarkerCoords, { icon: draftIcon })
        .bindPopup('<b>Nuevo Punto</b><br/>Completa el formulario.')
        .addTo(markerGroup.current)
        .openPopup();
    }
  };

  // Disparar renderizado de marcadores cuando cambia la data, el filtro o el nuevo marcador
  useEffect(() => {
    renderMarkers();
  }, [locations, filter, newMarkerCoords]);

  // Centrar mapa en un punto específico al hacer clic en la lista
  const focusOnMap = (lat, lng) => {
    if (mapInstance.current) {
      mapInstance.current.flyTo([lat, lng], 14, { duration: 1.5 });
    }
  };

  // 6. Manejo del Formulario
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newMarkerCoords) return;
    
    setLoading(true);
    setSuccessMsg('');

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'locations'), {
        name: formData.name,
        type: formData.type,
        needs: formData.needs,
        lat: newMarkerCoords[0],
        lng: newMarkerCoords[1],
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });

      setSuccessMsg('¡Punto registrado exitosamente!');
      setFormData({ name: '', type: 'centro_acopio', needs: '' });
      setNewMarkerCoords(null);
      
      // Volver a la lista después de un momento
      setTimeout(() => {
        setView('list');
        setSuccessMsg('');
      }, 2000);

    } catch (err) {
      console.error("Error guardando punto:", err);
      alert("Hubo un error al guardar el registro.");
    } finally {
      setLoading(false);
    }
  };

  const filteredLocations = filter === 'all' ? locations : locations.filter(l => l.type === filter);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-gray-100 overflow-hidden font-sans">
      
      {/* Panel Lateral (Sidebar) */}
      <div className="w-full md:w-[400px] lg:w-[450px] bg-white shadow-2xl z-[1000] flex flex-col h-[55vh] md:h-full order-2 md:order-1 relative">
        
        {/* Encabezado de Emergencia */}
        <div className="bg-red-600 text-white p-4 shadow-md flex-shrink-0">
          <h1 className="text-xl font-bold flex items-center">
            <AlertTriangle className="w-6 h-6 mr-2 animate-pulse" />
            SOS VENEZUELA
          </h1>
          <p className="text-red-100 text-sm mt-1">Mapa Colaborativo de Crisis y Acopio</p>
        </div>

        {/* Navegación por Pestañas */}
        <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <button 
            onClick={() => setView('list')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center transition-colors ${view === 'list' ? 'bg-white border-b-2 border-red-600 text-red-600' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <List className="w-4 h-4 mr-2" /> Directorio
          </button>
          <button 
            onClick={() => setView('add')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center transition-colors ${view === 'add' ? 'bg-white border-b-2 border-red-600 text-red-600' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Plus className="w-4 h-4 mr-2" /> Registrar Punto
          </button>
          <button 
            onClick={() => setView('info')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center transition-colors ${view === 'info' ? 'bg-white border-b-2 border-red-600 text-red-600' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Info className="w-4 h-4 mr-2" /> Ayuda
          </button>
        </div>

        {/* Contenido Dinámico del Panel */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 relative">
          
          {/* VISTA: LISTA DE PUNTOS */}
          {view === 'list' && (
            <div className="space-y-4">
              <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${filter === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-300'}`}>Todos</button>
                <button onClick={() => setFilter('hospital')} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center ${filter === 'hospital' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-white text-gray-600 border border-gray-300'}`}>🏥 Hospitales</button>
                <button onClick={() => setFilter('acopio')} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center ${filter === 'acopio' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-white text-gray-600 border border-gray-300'}`}>📦 Centros de Acopio</button>
              </div>

              {filteredLocations.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <MapPin className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                  <p>No hay puntos registrados aún.</p>
                  <button onClick={() => setView('add')} className="text-red-600 font-medium mt-2 hover:underline">Sé el primero en registrar uno</button>
                </div>
              ) : (
                filteredLocations.map(loc => (
                  <div 
                    key={loc.id} 
                    onClick={() => focusOnMap(loc.lat, loc.lng)}
                    className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden group"
                  >
                    <div className={`absolute top-0 left-0 w-1 h-full ${loc.type === 'hospital' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-gray-900 text-lg leading-tight pr-4">{loc.name}</h3>
                      <span title="Ver en mapa" className="text-gray-400 group-hover:text-gray-600"><MapPin className="w-5 h-5"/></span>
                    </div>
                    
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mb-3 ${loc.type === 'hospital' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                      {loc.type === 'hospital' ? <HeartPulse className="w-3 h-3 mr-1"/> : <Box className="w-3 h-3 mr-1"/>}
                      {loc.type === 'hospital' ? 'Hospital / Clínica' : 'Centro de Acopio'}
                    </span>
                    
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Se Necesita de Urgencia:</p>
                      <p className="text-sm text-gray-800 font-medium">{loc.needs || 'No especificado'}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* VISTA: FORMULARIO DE REGISTRO */}
          {view === 'add' && (
            <form onSubmit={handleSubmit} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-5">
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start">
                <Info className="w-5 h-5 text-amber-600 mt-0.5 mr-2 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  Ayuda a mantener la información precisa. <strong>Toca el mapa a la derecha (o arriba en móviles)</strong> para seleccionar la ubicación exacta antes de guardar.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre del Lugar</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej. Cruz Roja Sede Central"
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Instalación</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`border rounded-lg p-3 flex flex-col items-center justify-center cursor-pointer transition-colors ${formData.type === 'hospital' ? 'bg-red-50 border-red-500 ring-1 ring-red-500' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                    <input type="radio" name="type" value="hospital" className="sr-only" checked={formData.type === 'hospital'} onChange={(e) => setFormData({...formData, type: e.target.value})} />
                    <HeartPulse className={`w-6 h-6 mb-1 ${formData.type === 'hospital' ? 'text-red-600' : 'text-gray-400'}`} />
                    <span className={`text-xs font-semibold ${formData.type === 'hospital' ? 'text-red-800' : 'text-gray-600'}`}>Hospital</span>
                  </label>
                  <label className={`border rounded-lg p-3 flex flex-col items-center justify-center cursor-pointer transition-colors ${formData.type === 'centro_acopio' ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                    <input type="radio" name="type" value="centro_acopio" className="sr-only" checked={formData.type === 'centro_acopio'} onChange={(e) => setFormData({...formData, type: e.target.value})} />
                    <Box className={`w-6 h-6 mb-1 ${formData.type === 'centro_acopio' ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span className={`text-xs font-semibold ${formData.type === 'centro_acopio' ? 'text-blue-800' : 'text-gray-600'}`}>Acopio</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Insumos Necesitados</label>
                <textarea 
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm h-24 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
                  placeholder="Agua potable, alimentos no perecederos, mantas, analgésicos..."
                  value={formData.needs}
                  onChange={(e) => setFormData({...formData, needs: e.target.value})}
                ></textarea>
              </div>

              <div className={`p-3 rounded-lg border flex items-center justify-between ${newMarkerCoords ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200 border-dashed'}`}>
                <div className="flex items-center">
                  <MapPin className={`w-5 h-5 mr-2 ${newMarkerCoords ? 'text-green-600' : 'text-red-500'}`} />
                  <span className={`text-sm font-medium ${newMarkerCoords ? 'text-green-800' : 'text-red-700'}`}>
                    {newMarkerCoords ? 'Ubicación seleccionada' : 'Falta seleccionar ubicación'}
                  </span>
                </div>
                {newMarkerCoords && <CheckCircle className="w-5 h-5 text-green-600" />}
              </div>

              {successMsg && (
                <div className="p-3 bg-green-100 text-green-800 text-sm font-medium rounded-lg text-center flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 mr-2" /> {successMsg}
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading || !newMarkerCoords}
                className="w-full bg-red-600 text-white font-bold py-3.5 rounded-lg hover:bg-red-700 transition shadow-md flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Publicar en el Mapa'}
              </button>
            </form>
          )}

          {/* VISTA: INFORMACIÓN */}
          {view === 'info' && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4 text-gray-700 text-sm">
              <h2 className="text-lg font-bold text-gray-900 flex items-center mb-4">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-2"/>
                Cómo funciona esta app
              </h2>
              <p>Esta plataforma conecta a las personas afectadas con aquellos que desean ayudar durante la crisis.</p>
              
              <div className="space-y-3 mt-4">
                <div className="flex items-start">
                  <div className="bg-blue-100 p-2 rounded-full mr-3 mt-0.5"><MapPin className="w-4 h-4 text-blue-600"/></div>
                  <div>
                    <strong className="block text-gray-900">1. Encuentra ayuda o dona</strong>
                    <p className="text-xs mt-1">Explora el mapa o el directorio para ubicar centros de acopio y hospitales. Lee los insumos que necesitan y dirígete al punto.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="bg-red-100 p-2 rounded-full mr-3 mt-0.5"><Plus className="w-4 h-4 text-red-600"/></div>
                  <div>
                    <strong className="block text-gray-900">2. Registra nuevos puntos</strong>
                    <p className="text-xs mt-1">Si abriste un centro de acopio o estás en un hospital que requiere insumos, ve a "Registrar Punto", haz clic en el mapa para marcar la ubicación y llena los datos.</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="bg-gray-100 p-2 rounded-full mr-3 mt-0.5"><CheckCircle className="w-4 h-4 text-gray-600"/></div>
                  <div>
                    <strong className="block text-gray-900">3. Sincronización Inmediata</strong>
                    <p className="text-xs mt-1">Todos los datos son procesados en tiempo real. Lo que publicas aparecerá al instante en los dispositivos de otras personas conectadas.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Área del Mapa */}
      <div className="flex-1 w-full h-[45vh] md:h-full relative order-1 md:order-2 bg-gray-200 z-0">
        
        {/* Instrucción Flotante en Móvil */}
        {!newMarkerCoords && view === 'add' && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[500] bg-gray-900 bg-opacity-80 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg backdrop-blur-sm flex items-center animate-bounce">
            <MapPin className="w-4 h-4 mr-2" /> Toca el mapa para ubicar el punto
          </div>
        )}

        <div id="leaflet-map-container" ref={mapRef} className="absolute inset-0 w-full h-full"></div>
      </div>
    </div>
  );
}
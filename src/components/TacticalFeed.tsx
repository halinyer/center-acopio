import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Check, MoreHorizontal, Share, MessageCircle, Trash2 } from 'lucide-react';
import { getTacticalFeed, subscribeToTacticalFeed, supabase, getDistanceKm, deleteTacticalReport } from '../lib/supabase';
import type { TacticalPost, LocationRow } from '../lib/supabase';

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora mismo';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

type TacticalFeedProps = {
  filter: 'todo' | 'alertas';
  userLat?: number;
  userLng?: number;
  onCenterClick?: (c: string) => void;
  locations?: LocationRow[];
  authUser?: any;
  onRequestLogin?: () => void;
  onScrollDir?: (dir: 'up' | 'down') => void;
  onNotify?: (title: string, desc: string, type?: 'info'|'warning'|'error') => void;
};

export const TacticalFeed = memo(({ 
  filter,
  userLat,
  userLng, 
  onCenterClick, 
  locations,
  authUser,
  onRequestLogin,
  onScrollDir,
  onNotify
}: TacticalFeedProps) => {
  const [posts, setPosts] = useState<TacticalPost[]>([]);
  const [newPostsQueue, setNewPostsQueue] = useState<TacticalPost[]>([]);
  const [outbox, setOutbox] = useState<TacticalPost[]>([]);
  const [viewerPost, setViewerPost] = useState<TacticalPost | null>(null);
  const [optionsPostId, setOptionsPostId] = useState<string | null>(null);
  
  const [supportedPosts, setSupportedPosts] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('tactical_supported') || '{}'); } catch { return {}; }
  });

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Coordenadas reales del usuario
  const lat = userLat ?? 10.4806;
  const lng = userLng ?? -66.9036;

  const handleDelete = async (id: string) => {
    if (confirm('¿Seguro que quieres eliminar este reporte?')) {
      const success = await deleteTacticalReport(id);
      if (success) {
        setPosts(prev => prev.filter(p => p.id !== id));
      } else {
        alert('Error al eliminar. Revisa tu conexión.');
      }
    }
  };

  // Infinite Scroll Observer
  const observer = useRef<IntersectionObserver | null>(null);
  const lastScrollY = useRef(0);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;
    if (currentScrollY > lastScrollY.current + 20 && currentScrollY > 50) {
      onScrollDir?.('down');
      lastScrollY.current = currentScrollY;
    } else if (currentScrollY < lastScrollY.current - 20) {
      onScrollDir?.('up');
      lastScrollY.current = currentScrollY;
    }
  };

  const lastPostElementRef = useCallback((node: HTMLDivElement) => {
    if (loading || loadingMore || !hasMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setLoadingMore(true);
      }
    }, { rootMargin: '400px' }); // Gatillar cuando falten 3-4 tarjetas
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  // Initial Fetch & Realtime Subscription
  useEffect(() => {
    getTacticalFeed(lat, lng, undefined, undefined, undefined, 15).then(data => {
      setPosts(data);
      setHasMore(data.length === 15);
      setLoading(false);
    });

    const syncOutbox = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (!supabase) return;
      const raw = localStorage.getItem('tactical_outbox');
      if (!raw) return;
      try {
        const pending = JSON.parse(raw);
        if (pending.length === 0) return;
        let failedCount = 0;
        for (const p of pending) {
          const { id, created_at, supports_count, relevance_score, distance_km, ...cleanPost } = p;
          const { error } = await supabase.from('tactical_feed').insert([cleanPost]);
          if (error) failedCount++;
        }
        
        // Purga incondicional de los fantasmas (evita bucles de error por sesión expirada)
        localStorage.removeItem('tactical_outbox');
        setOutbox([]);
        getTacticalFeed(lat, lng, undefined, undefined, undefined, 15).then(data => setPosts(data));
        
        if (failedCount > 0) {
          onNotify?.(
            'Error en Buzón de Salida',
            `${failedCount} reporte(s) fallaron la validación del servidor (probablemente tu sesión expiró o faltaban datos) y fueron descartados.`,
            'error'
          );
        }
      } catch (e) {}
    };

    const loadOutbox = () => {
      const raw = localStorage.getItem('tactical_outbox');
      if (raw) {
        try { setOutbox(JSON.parse(raw)); } catch {}
      }
    };

    const handleNewLocalPost = (e: Event) => {
      const customEvent = e as CustomEvent<TacticalPost>;
      if (customEvent.detail) {
        // Enforce immediate UI injection at the top (Friction Zero)
        setPosts(prev => [customEvent.detail, ...prev]);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    loadOutbox();
    window.addEventListener('online', syncOutbox);
    window.addEventListener('tactical_outbox_updated', loadOutbox);
    window.addEventListener('new_tactical_post', handleNewLocalPost);

    const unsubscribe = subscribeToTacticalFeed((newPost) => {
      // 1. Anti-Eco Reforzado: ignorar posts propios (por ID o por Nombre como fallback)
      if (authUser && (newPost.user_id === authUser.id || newPost.author_name === authUser?.user_metadata?.full_name)) return;
      
      // 2. Sensor Quirúrgico: Calcular distancia y Score localmente
      const dist = getDistanceKm(lat, lng, newPost.lat, newPost.lng);
      
      let relScore = 1;
      if (newPost.is_critical && dist <= 20) relScore = 4;
      else if (!newPost.is_critical && dist <= 20) relScore = 3;
      else if (newPost.is_critical && dist > 20) relScore = 2;

      // 3. Solo pre-encolar si es local o crítico
      if (relScore >= 2) {
        const enrichedPost = { ...newPost, relevance_score: relScore, distance_km: dist };
        setNewPostsQueue(prev => [enrichedPost, ...prev]);
      }
    });
    return () => {
      unsubscribe();
      window.removeEventListener('online', syncOutbox);
      window.removeEventListener('tactical_outbox_updated', loadOutbox);
      window.removeEventListener('new_tactical_post', handleNewLocalPost);
    };
  }, [lat, lng]);

  // Load More Effect
  useEffect(() => {
    if (loadingMore) {
      const last = posts[posts.length - 1];
      if (!last) return;
      getTacticalFeed(lat, lng, last.relevance_score, last.created_at, last.id, 15).then(data => {
        setPosts(prev => {
          // Filtramos duplicados por seguridad en el edge case del realtime
          const newIds = new Set(prev.map(p => p.id));
          return [...prev, ...data.filter(d => !newIds.has(d.id))];
        });
        setHasMore(data.length === 15);
        setLoadingMore(false);
      });
    }
  }, [loadingMore, lat, lng]); // posts is read inside, but only triggers when loadingMore turns true

  const handleShare = async (post: TacticalPost) => {
    const shareUrl = `https://www.acopioven.com/`;
    const shareText = `🚨 Reporte en AcopioVen:\n"${post.content}"\n\n📍 ${post.zone ? `Zona: ${post.zone}` : 'Venezuela'}\n⏱️ ${timeAgo(post.created_at)}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Reporte en AcopioVen',
          text: shareText,
          url: shareUrl
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(`${shareText}\n\n🔗 Enlace: ${shareUrl}`);
      if (onNotify) {
        onNotify("Enlace Copiado", "El texto y enlace se copiaron al portapapeles", "info");
      } else {
        alert("Enlace copiado al portapapeles");
      }
    }
  };

  const formatWaLink = (phone: string, textMessage?: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const base = `https://wa.me/${cleanPhone}`;
    return textMessage ? `${base}?text=${encodeURIComponent(textMessage)}` : base;
  };

  const handleHelpCenter = (post: TacticalPost) => {
    if (post.contact_phone) {
      const msg = `Hola, vi tu reporte urgente en AcopioVen sobre la zona de ${post.zone || 'tu comunidad'}. ¡Quiero ayudar!`;
      window.location.href = formatWaLink(post.contact_phone, msg);
      return;
    }

    const center = locations?.find(l => l.id === post.linked_center_id);
    if (center && center.leader_phone) {
      const msg = `Hola, vi en AcopioVen que necesitan apoyo en ${center.name}. ¡Quiero ayudar!`;
      window.location.href = formatWaLink(center.leader_phone, msg);
    } else {
      alert('Este reporte o centro no tiene un número de contacto registrado.');
    }
  };

  const handleContactAuthor = (post: TacticalPost) => {
    if (post.contact_phone) {
      const msg = `Hola, vi tu reporte urgente en AcopioVen sobre la zona de ${post.zone}. ¿Cómo te puedo ayudar?`;
      window.location.href = formatWaLink(post.contact_phone, msg);
    }
  };

  if (loading) {
    return <div className="tactical-feed-container" style={{paddingTop: '2rem', textAlign: 'center', color: 'var(--gray-500)'}}>Cargando radar logístico...</div>;
  }

  const displayedPosts = filter === 'alertas' ? posts.filter(p => p.is_critical) : posts;
  const visibleQueue = filter === 'alertas' ? newPostsQueue.filter(p => p.is_critical) : newPostsQueue;

  if (displayedPosts.length === 0 && visibleQueue.length === 0) {
    return <div className="tactical-feed-container" style={{paddingTop: '2rem', textAlign: 'center', color: 'var(--gray-500)'}}>No hay reportes recientes en tu zona.</div>;
  }

  return (
    <div className="tactical-feed-container" onScroll={handleScroll} style={{ position: 'relative' }}>
      
      {/* Píldora de Realtime (Protocolo Burbuja) */}
      {visibleQueue.length > 0 && (
        <div style={{ position: 'sticky', top: '16px', zIndex: 50, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <button 
            onClick={() => {
              setPosts(prev => {
                const combined = [...newPostsQueue, ...prev];
                // Fricción Cero: Ordenamiento 100% cronológico, sin enterrar posts por score.
                
                // Evitar duplicados
                const uniqueIds = new Set();
                return combined.filter(p => {
                  if (uniqueIds.has(p.id)) return false;
                  uniqueIds.add(p.id);
                  return true;
                });
              });
              setNewPostsQueue([]);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            style={{
              pointerEvents: 'auto', background: 'var(--blue)', color: 'white', border: 'none', 
              padding: '8px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: '600', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            ↑ {visibleQueue.length} Nuevo{visibleQueue.length > 1 ? 's' : ''} Reporte{visibleQueue.length > 1 ? 's' : ''}
          </button>
        </div>
      )}

      <div className="feed-list">
        {outbox.map((post) => (
          <div key={post.id} className="feed-card" style={{ opacity: 0.6 }}>
            <div className="feed-left-col">
              <img src={post.author_avatar || 'https://i.pravatar.cc/150?u=anon'} alt="avatar" className="feed-avatar" />
            </div>
            <div className="feed-right-col">
              <div className="feed-header">
                <div className="feed-author-meta">
                  <div className="feed-author-name">
                    {post.author_name}
                    {post.is_critical && <span className="feed-critical-dot" title="Alerta Crítica" />}
                  </div>
                  <span style={{ color: '#536471' }}>&middot;</span>
                  <div className="feed-time-zone">
                    Enviando... {post.zone ? `· ${post.zone}` : ''}
                  </div>
                </div>
              </div>
              <p className="feed-content">{post.content}</p>
            {post.image_url && (
              <div className="feed-media-container">
                <img src={post.image_url} alt="media" className="feed-media" />
              </div>
            )}
            </div>
          </div>
        ))}

        {displayedPosts.map((post, index) => {
          const isLastPost = index === displayedPosts.length - 1;
          return (
            <div 
              key={post.id} 
              className="feed-card"
              ref={isLastPost ? lastPostElementRef : null}
            >
              <div className="feed-left-col">
                <img src={post.author_avatar || 'https://i.pravatar.cc/150?u=anon'} alt="avatar" className="feed-avatar" />
              </div>
              <div className="feed-right-col">
                <div className="feed-header">
                  <div className="feed-author-meta">
                    <div className="feed-author-name">
                      {post.author_name}
                      {post.is_critical && <span className="feed-critical-dot" title="Alerta Crítica" />}
                    </div>
                    <span style={{ color: '#536471' }}>&middot;</span>
                    <div className="feed-time-zone">
                      {timeAgo(post.created_at)} {post.zone ? `· ${post.zone}` : ''}
                    </div>
                  </div>
                  <div style={{ position: 'relative' }}>
                  <button 
                    className="feed-options-btn" 
                    title="Opciones"
                    onClick={() => setOptionsPostId(optionsPostId === post.id ? null : post.id)}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  
                  {optionsPostId === post.id && (
                    <div style={{ position: 'absolute', right: 0, top: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '4px', zIndex: 10, boxShadow: 'var(--shadow-md)', minWidth: '150px' }}>
                      {authUser && (post.user_id === authUser.id || post.author_name === authUser?.user_metadata?.full_name) ? (
                        <button 
                          onClick={() => { handleDelete(post.id); setOptionsPostId(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '12px', background: 'transparent', border: 'none', color: 'var(--red)', fontWeight: '500', cursor: 'pointer', textAlign: 'left', borderRadius: '8px' }}
                        >
                          <Trash2 size={16} /> Eliminar
                        </button>
                      ) : (
                        <button 
                          onClick={() => { alert('Función de reportar próximamente'); setOptionsPostId(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '12px', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontWeight: '500', cursor: 'pointer', textAlign: 'left', borderRadius: '8px' }}
                        >
                          Reportar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <p className="feed-content">{post.content}</p>
              
              {post.image_url && (
                <div 
                  className="feed-media-container"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setViewerPost(post)}
                >
                  <img src={post.image_url} alt="Evidencia" className="feed-media" />
                </div>
              )}
              
              {post.linked_center_id && (
                <div className="feed-linked-badge" onClick={() => onCenterClick?.(post.linked_center_id!)} style={{cursor: 'pointer'}}>
                  <MapPin size={12} /> {locations?.find(l => l.id === post.linked_center_id)?.name || `Vincular Centro`}
                </div>
              )}
              
              <div className="feed-card-actions">
                <div style={{ display: 'flex', gap: '16px' }}>
                  <button 
                    className="action-btn-subtle"
                    style={{ color: supportedPosts[post.id] ? 'var(--blue)' : 'inherit', fontWeight: supportedPosts[post.id] ? '600' : '500' }}
                    onClick={() => {
                      if (!authUser) {
                        onRequestLogin?.();
                        return;
                      }
                      if (supportedPosts[post.id]) return; // Already supported locally
                      
                      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, supports_count: (p.supports_count || 0) + 1 } : p));
                      
                      const newSupported = { ...supportedPosts, [post.id]: true };
                      setSupportedPosts(newSupported);
                      localStorage.setItem('tactical_supported', JSON.stringify(newSupported));
                      
                      // Enviar a Supabase para que sea permanente
                      if (supabase) {
                        supabase.rpc('increment_support', { p_post_id: post.id }).then(({ error }) => {
                          if (error) console.error(error);
                        });
                        if (authUser && post.user_id && post.user_id !== authUser.id) {
                          supabase.from('tactical_notifications').insert([{
                            user_id: post.user_id,
                            actor_name: authUser.user_metadata?.full_name || 'Un voluntario',
                            post_id: post.id,
                            type: 'support'
                          }]).then();
                        }
                      }
                    }}
                  >
                    <Check size={16} /> Respaldar {post.supports_count > 0 ? `(${post.supports_count})` : ''}
                  </button>
                  <button className="action-btn-subtle" onClick={() => handleShare(post)}>
                    <Share size={16} /> Compartir
                  </button>
                </div>
                
                {post.linked_center_id ? (
                  <button 
                    className="action-btn-subtle" 
                    style={{ color: 'var(--blue)', fontWeight: '600' }}
                    onClick={() => handleHelpCenter(post)}
                  >
                    <MessageCircle size={16} /> Ayudar
                  </button>
                ) : post.is_critical && post.contact_phone ? (
                  <button 
                    className="action-btn-subtle" 
                    style={{ color: 'var(--red)', fontWeight: '600' }}
                    onClick={() => handleContactAuthor(post)}
                  >
                    <MessageCircle size={16} /> Contactar
                  </button>
                ) : null}
              </div>
              </div>
            </div>
          );
        })}
        
        {loadingMore && (
          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--gray-500)', fontSize: '14px' }}>
            Escaneando radar...
          </div>
        )}
        
        {!hasMore && displayedPosts.length > 0 && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--gray-500)', fontSize: '14px', borderTop: '1px solid var(--gray-200)', marginTop: '1rem' }}>
            No hay más reportes recientes (48h). Todo está en calma en el radar.
          </div>
        )}
      </div>

      {viewerPost && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', color: 'white', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src={viewerPost.author_avatar || 'https://i.pravatar.cc/150?u=anon'} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{viewerPost.author_name}</div>
                <div style={{ fontSize: '12px', color: '#ccc' }}>{timeAgo(viewerPost.created_at)}</div>
              </div>
            </div>
            <button onClick={() => setViewerPost(null)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer', padding: '4px 12px' }}>✕</button>
          </div>
          
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: '-60px' }}>
            <img src={viewerPost.image_url} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>

          <div style={{ padding: '24px 16px 48px 16px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', zIndex: 2 }}>
            <p style={{ color: 'white', fontSize: '15px', marginBottom: '16px', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{viewerPost.content}</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.15)', color: 'white', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                onClick={() => {
                  if (!authUser) { onRequestLogin?.(); return; }
                  const supported = JSON.parse(localStorage.getItem('tactical_supported') || '{}');
                  if (supported[viewerPost.id]) return;
                  setPosts(prev => prev.map(p => p.id === viewerPost.id ? { ...p, supports_count: p.supports_count + 1 } : p));
                  supported[viewerPost.id] = true;
                  localStorage.setItem('tactical_supported', JSON.stringify(supported));
                  if (supabase) supabase.rpc('increment_support', { p_post_id: viewerPost.id }).then(({error}) => { if(error) console.error(error); });
                  setViewerPost(prev => prev ? { ...prev, supports_count: prev.supports_count + 1 } : null);
                }}
              >
                <Check size={18} /> {viewerPost.supports_count}
              </button>
              <button 
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.15)', color: 'white', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                onClick={() => handleShare(viewerPost)}
              >
                <Share size={18} />
              </button>
              {viewerPost.linked_center_id ? (
                <button 
                  style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: 'var(--blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                  onClick={() => handleHelpCenter(viewerPost)}
                >
                  <MessageCircle size={18} /> Ayudar
                </button>
              ) : viewerPost.contact_phone ? (
                <button 
                  style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#25D366', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                  onClick={() => handleContactAuthor(viewerPost)}
                >
                  <MessageCircle size={18} /> WhatsApp
                </button>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

import { useEffect, useState } from 'react';
import { Clock, MapPin, Check, MoreHorizontal, Share } from 'lucide-react';
import { getTacticalFeed } from '../lib/supabase';
import type { TacticalPost, LocationRow } from '../lib/supabase';

// Helper para parsear la fecha a formato relativo ("Hace 5 min")
function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora mismo';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

export const TacticalFeed = ({ filter, onCenterClick, locations }: { filter: 'todo' | 'alertas', onCenterClick?: (c: string) => void, locations?: LocationRow[] }) => {
  const [posts, setPosts] = useState<TacticalPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: En el futuro tomar lat/lng del GPS real si está disponible
    // Simulamos que estamos en Caracas para el query
    const lat = 10.4806;
    const lng = -66.9036;

    getTacticalFeed(lat, lng, 100).then(data => {
      setPosts(data);
      setLoading(false);
    });
  }, []);

  const displayedPosts = filter === 'alertas' ? posts.filter(p => p.is_critical) : posts;

  const handleShare = (post: TacticalPost) => {
    const text = `🚨 Alerta en ${post.zone}:\n"${post.content}"\n⏱️ ${timeAgo(post.created_at)}\n🔗 Reportado vía AcopioVen`;
    if (navigator.share) {
      navigator.share({ title: 'AcopioVen', text }).catch(console.error);
    } else {
      navigator.clipboard.writeText(text);
      alert('Copiado al portapapeles');
    }
  };

  if (loading) {
    return <div className="tactical-feed-container" style={{paddingTop: '2rem', textAlign: 'center', color: 'var(--gray-500)'}}>Cargando reportes...</div>;
  }

  if (displayedPosts.length === 0) {
    return <div className="tactical-feed-container" style={{paddingTop: '2rem', textAlign: 'center', color: 'var(--gray-500)'}}>No hay reportes recientes en tu zona.</div>;
  }

  return (
    <div className="tactical-feed-container">
      <div className="feed-list">
        {displayedPosts.map((post) => (
          <div key={post.id} className="feed-card">
            <div className="feed-card-top">
              <div className="feed-author-block">
                <img src={post.author_avatar || 'https://i.pravatar.cc/150?u=anon'} alt="avatar" className="feed-avatar" />
                <div className="feed-author-meta">
                  <div className="feed-author-name">
                    {post.author_name} 
                    {post.is_critical && <span className="feed-critical-dot" title="Alerta Crítica" />}
                  </div>
                  <div className="feed-time-zone">
                    <Clock size={12} /> {timeAgo(post.created_at)} &middot; {post.zone}
                  </div>
                </div>
              </div>
              <button className="feed-options-btn" title="Opciones (Reportar como falso)"><MoreHorizontal size={18} /></button>
            </div>
            
            <p className="feed-content">{post.content}</p>
            
            {post.linked_center_id && (
              <div className="feed-linked-badge" onClick={() => onCenterClick?.(post.linked_center_id!)} style={{cursor: 'pointer'}}>
                <MapPin size={12} /> {locations?.find(l => l.id === post.linked_center_id)?.name || `Vincular Centro (${post.linked_center_id.slice(0,4)})`}
              </div>
            )}
            
            <div className="feed-card-actions">
              <button className="action-btn-subtle">
                <Check size={16} /> Respaldar ({post.supports_count})
              </button>
              <button className="action-btn-subtle" onClick={() => handleShare(post)}>
                <Share size={16} /> Compartir
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

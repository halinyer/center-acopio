import { Clock, MapPin, Check, MoreHorizontal, Share } from 'lucide-react';

const mockPosts = [
  {
    id: 1,
    authorName: 'Carlos',
    authorAvatar: 'https://i.pravatar.cc/150?u=carlos',
    zone: 'Charallave, Miranda',
    content: 'La vía principal hacia Cúa está trancada por escombros, usen el desvío por la variante.',
    time: 'Hace 5 min',
    isCritical: true,
    linkedCenter: null,
    supports: 12
  },
  {
    id: 2,
    authorName: 'Dr. Mendoza',
    authorAvatar: 'https://i.pravatar.cc/150?u=mendoza',
    zone: 'Valencia, Carabobo',
    content: 'Actualización: En el centro CHET ya no necesitamos ropa, urgen antibióticos pediátricos.',
    time: 'Hace 12 min',
    isCritical: false,
    linkedCenter: 'Hospital CHET',
    supports: 45
  },
  {
    id: 3,
    authorName: 'Ana V.',
    authorAvatar: 'https://i.pravatar.cc/150?u=ana',
    zone: 'Petare, Caracas',
    content: 'Sigue lloviendo muy fuerte en la zona, el punto de recolección de la iglesia se movió al salón parroquial techado.',
    time: 'Hace 22 min',
    isCritical: false,
    linkedCenter: 'Iglesia San José (Petare)',
    supports: 8
  }
];

export const TacticalFeed = ({ filter, onCenterClick }: { filter: 'todo' | 'alertas', onCenterClick?: (c: string) => void }) => {
  const displayedPosts = filter === 'alertas' ? mockPosts.filter(p => p.isCritical) : mockPosts;

  const handleShare = (post: any) => {
    const text = `🚨 Alerta en ${post.zone}:\n"${post.content}"\n⏱️ ${post.time}\n🔗 Reportado vía AcopioVen`;
    if (navigator.share) {
      navigator.share({ title: 'AcopioVen', text }).catch(console.error);
    } else {
      navigator.clipboard.writeText(text);
      alert('Copiado al portapapeles');
    }
  };

  return (
    <div className="tactical-feed-container">
      <div className="feed-list">
        {displayedPosts.map((post) => (
          <div key={post.id} className="feed-card">
            <div className="feed-card-top">
              <div className="feed-author-block">
                <img src={post.authorAvatar} alt="avatar" className="feed-avatar" />
                <div className="feed-author-meta">
                  <div className="feed-author-name">
                    {post.authorName} 
                    {post.isCritical && <span className="feed-critical-dot" title="Alerta Crítica" />}
                  </div>
                  <div className="feed-time-zone">
                    <Clock size={12} /> {post.time} &middot; {post.zone}
                  </div>
                </div>
              </div>
              <button className="feed-options-btn" title="Opciones (Reportar como falso)"><MoreHorizontal size={18} /></button>
            </div>
            
            <p className="feed-content">{post.content}</p>
            
            {post.linkedCenter && (
              <div className="feed-linked-badge" onClick={() => onCenterClick?.(post.linkedCenter)} style={{cursor: 'pointer'}}>
                <MapPin size={12} /> {post.linkedCenter}
              </div>
            )}
            
            <div className="feed-card-actions">
              <button className="action-btn-subtle">
                <Check size={16} /> Respaldar ({post.supports})
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

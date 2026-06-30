import { useState } from 'react';
import { Clock, MapPin, Check, MoreHorizontal } from 'lucide-react';

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
  }
];

export const TacticalFeed = () => {
  const [filter, setFilter] = useState<'todo' | 'alertas'>('todo');
  const displayedPosts = filter === 'alertas' ? mockPosts.filter(p => p.isCritical) : mockPosts;

  return (
    <div className="tactical-feed-container">
      <div className="feed-header-blur">
        <div className="feed-filter-pills">
          <button className={`feed-pill ${filter === 'todo' ? 'active' : ''}`} onClick={() => setFilter('todo')}>Todo</button>
          <button className={`feed-pill ${filter === 'alertas' ? 'active' : ''}`} onClick={() => setFilter('alertas')}>Alertas</button>
        </div>
      </div>

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
              <div className="feed-linked-badge">
                <MapPin size={12} /> {post.linkedCenter}
              </div>
            )}
            
            <div className="feed-card-actions">
              <button className="action-btn-subtle">
                <Check size={16} /> Respaldar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

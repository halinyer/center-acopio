import { useState } from 'react';
import { AlertTriangle, Clock, MapPin, ThumbsUp, ThumbsDown } from 'lucide-react';

const mockPosts = [
  {
    id: 1,
    author: 'Carlos',
    zone: 'Charallave, Miranda',
    content: 'La vía principal hacia Cúa está trancada por escombros, usen el desvío por la variante.',
    time: 'Hace 5 min',
    isCritical: true,
    linkedCenter: null,
    upvotes: 12,
    downvotes: 0
  },
  {
    id: 2,
    author: 'Médico Voluntario',
    zone: 'Valencia, Carabobo',
    content: 'Actualización: En el centro CHET ya no necesitamos ropa, urgen antibióticos pediátricos.',
    time: 'Hace 12 min',
    isCritical: false,
    linkedCenter: 'Hospital CHET',
    upvotes: 45,
    downvotes: 1
  },
  {
    id: 3,
    author: 'Ana',
    zone: 'Petare, Caracas',
    content: 'Sigue lloviendo muy fuerte en la zona, el punto de recolección de la iglesia se movió al salón parroquial techado.',
    time: 'Hace 22 min',
    isCritical: false,
    linkedCenter: 'Iglesia San José (Petare)',
    upvotes: 8,
    downvotes: 0
  }
];

export const TacticalFeed = () => {
  // Nota: El filtro Todo/Alertas puede ir también en el DynamicBottomNav, 
  // pero para diseño brutalista lo probamos en el top de la lista.
  const [filter, setFilter] = useState<'todo' | 'alertas'>('todo');
  
  const displayedPosts = filter === 'alertas' ? mockPosts.filter(p => p.isCritical) : mockPosts;

  return (
    <div className="tactical-feed-container">
      <div className="feed-filter-tabs">
        <button className={`feed-tab ${filter === 'todo' ? 'active' : ''}`} onClick={() => setFilter('todo')}>Todo</button>
        <button className={`feed-tab ${filter === 'alertas' ? 'active alert' : ''}`} onClick={() => setFilter('alertas')}>
          <AlertTriangle size={14} /> Alertas
        </button>
      </div>

      <div className="feed-list">
        {displayedPosts.map((post) => (
          <div key={post.id} className={`feed-card ${post.isCritical ? 'critical' : ''}`}>
            {post.isCritical && (
              <div className="feed-card-badge-critical">
                <AlertTriangle size={12} /> CRÍTICO
              </div>
            )}
            
            <div className="feed-card-header">
              <span className="author">{post.author}</span>
              <span className="time"><Clock size={12}/> {post.time}</span>
            </div>
            
            <p className="feed-content">{post.content}</p>
            
            <div className="feed-card-footer">
              <div className="feed-zone">
                <MapPin size={14} /> {post.zone}
              </div>
              {post.linkedCenter && (
                <div className="feed-linked-center">
                  📍 {post.linkedCenter}
                </div>
              )}
            </div>
            
            <div className="feed-card-actions">
              <button className="action-btn confirm"><ThumbsUp size={16} /> Confirmar</button>
              <button className="action-btn fake"><ThumbsDown size={16} /> Falso</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

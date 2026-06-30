import { useState } from 'react';
import { SwipeableSheet } from './SwipeableSheet';
import { AlertTriangle, MapPin, Image as ImageIcon } from 'lucide-react';

type ReportEditorProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (content: string, isCritical: boolean, linkedCenter?: string, contactPhone?: string) => void;
  contextLocation?: string; 
};

export const ReportEditor = ({ isOpen, onClose, onSubmit, contextLocation }: ReportEditorProps) => {
  const [content, setContent] = useState('');
  const [isCritical, setIsCritical] = useState(false);
  const [contactPhone, setContactPhone] = useState('');
  const [linkedCenter, setLinkedCenter] = useState<string | undefined>(contextLocation);

  const handleSubmit = () => {
    if (!content.trim()) return;
    onSubmit(content, isCritical, linkedCenter, isCritical ? contactPhone.trim() : undefined);
    setContent('');
    setIsCritical(false);
    setContactPhone('');
    onClose();
  };

  return (
    <SwipeableSheet isOpen={isOpen} onClose={onClose} className="report-editor-sheet">
      <div className="report-editor-container">
        
        <div className="editor-header">
          <button className="editor-submit-btn-small" onClick={() => onClose()} style={{background: 'transparent', color: 'var(--gray-500)', padding: 0}}>Cancelar</button>
          <div className="editor-title">Nuevo Reporte</div>
          <button 
            className="editor-submit-btn-small" 
            onClick={handleSubmit}
            disabled={!content.trim()}
          >
            Publicar
          </button>
        </div>
        
        <div className="editor-body">
          <img src="https://i.pravatar.cc/150?u=current" alt="Avatar" className="editor-avatar" />
          
          <div className="editor-input-area">
            <textarea 
              className="editor-textarea"
              placeholder="Reporta el estado de las vías, novedades de tu zona o necesidades urgentes..."
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 280))}
              autoFocus={false}
            />
            
            {isCritical && (
              <div style={{ marginTop: '8px', padding: '8px', background: '#fee2e2', borderRadius: '12px', border: '1px solid #fecaca' }}>
                <input 
                  type="tel"
                  placeholder="📞 Teléfono de contacto (Opcional)"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  style={{
                    background: 'transparent', border: 'none', outline: 'none', 
                    width: '100%', fontSize: '14px', color: 'var(--red)', fontWeight: '500'
                  }}
                />
              </div>
            )}

            {linkedCenter ? (
              <div className="editor-context-chip" onClick={() => setLinkedCenter(undefined)} style={{ marginTop: '4px' }}>
                <MapPin size={14} /> {linkedCenter} ✕
              </div>
            ) : (
              <div className="editor-context-chip" style={{background: 'transparent', color: '#8E8E93', padding: '0'}}>
                📍 Charallave, Miranda (Solo ciudad)
              </div>
            )}
          </div>
        </div>

        <div className="editor-toolbar">
          <div className="editor-tools-left">
            <button className="editor-tool-btn" title="Vincular Centro de Acopio" onClick={() => setLinkedCenter('Iglesia San José')}>
              <MapPin size={20} />
            </button>
            <button className="editor-tool-btn" title="Adjuntar Imagen (Próximamente)">
              <ImageIcon size={20} />
            </button>
            <button 
              className={`editor-tool-btn critical ${isCritical ? 'active' : ''}`}
              title="Marcar como Crítico"
              onClick={() => setIsCritical(!isCritical)}
            >
              <AlertTriangle size={20} />
            </button>
          </div>
          <div className="editor-char-count">{content.length}/280</div>
        </div>

      </div>
    </SwipeableSheet>
  );
};

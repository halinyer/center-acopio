import { useState } from 'react';
import { SwipeableSheet } from './SwipeableSheet';
import { AlertTriangle, MapPin, Image as ImageIcon } from 'lucide-react';

type ReportEditorProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (content: string, isCritical: boolean, linkedCenter?: string) => void;
  contextLocation?: string; 
};

export const ReportEditor = ({ isOpen, onClose, onSubmit, contextLocation }: ReportEditorProps) => {
  const [content, setContent] = useState('');
  const [isCritical, setIsCritical] = useState(false);
  const [linkedCenter, setLinkedCenter] = useState<string | undefined>(contextLocation);

  const handleSubmit = () => {
    if (!content.trim()) return;
    onSubmit(content, isCritical, linkedCenter);
    setContent('');
    setIsCritical(false);
    onClose();
  };

  return (
    <SwipeableSheet isOpen={isOpen} onClose={onClose} className="report-editor-sheet">
      <div className="report-editor-container">
        
        <div className="editor-header">
          <button className="editor-submit-btn-small" onClick={() => onClose()} style={{background: 'transparent', color: '#8E8E93', padding: 0}}>Cancelar</button>
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
              placeholder="¿Qué está pasando?"
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 280))}
              autoFocus={false}
            />
            
            {linkedCenter ? (
              <div className="editor-context-chip" onClick={() => setLinkedCenter(undefined)}>
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

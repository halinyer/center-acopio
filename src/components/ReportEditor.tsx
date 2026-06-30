import { useState } from 'react';
import { SwipeableSheet } from './SwipeableSheet';
import { AlertTriangle, Send } from 'lucide-react';

type ReportEditorProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (content: string, isCritical: boolean) => void;
  contextLocation?: string; 
};

export const ReportEditor = ({ isOpen, onClose, onSubmit, contextLocation }: ReportEditorProps) => {
  const [content, setContent] = useState('');
  const [isCritical, setIsCritical] = useState(false);

  const handleSubmit = () => {
    if (!content.trim()) return;
    onSubmit(content, isCritical);
    setContent('');
    setIsCritical(false);
    onClose();
  };

  return (
    <SwipeableSheet isOpen={isOpen} onClose={onClose} className="report-editor-sheet">
      <div className="report-editor-container">
        <h3 className="editor-title">Nuevo Reporte</h3>
        
        {contextLocation ? (
          <div className="editor-context">📍 Sobre: {contextLocation}</div>
        ) : (
          <div className="editor-context">📍 Desde tu ubicación GPS</div>
        )}
        
        <textarea 
          className="editor-textarea"
          placeholder="¿Qué está pasando ahora mismo?"
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, 280))}
          autoFocus={false}
        />
        <div className="editor-char-count">{content.length}/280</div>
        
        <div className="editor-options">
          <button 
            className={`critical-toggle ${isCritical ? 'active' : ''}`}
            onClick={() => setIsCritical(!isCritical)}
          >
            <AlertTriangle size={16} />
            Marcar como Emergencia
          </button>
        </div>
        
        <button 
          className="editor-submit-btn" 
          onClick={handleSubmit}
          disabled={!content.trim()}
        >
          <Send size={18} />
          Publicar Reporte
        </button>
      </div>
    </SwipeableSheet>
  );
};

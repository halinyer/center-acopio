import { useState, useRef } from 'react';
import { SwipeableSheet } from './SwipeableSheet';
import { AlertTriangle, MapPin, Image as ImageIcon } from 'lucide-react';

import type { LocationRow } from '../lib/supabase';

type ReportEditorProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (content: string, isCritical: boolean, linkedCenter?: string, contactPhone?: string, imageFile?: File) => void;
  contextLocation?: string; 
  locations?: LocationRow[];
  authUser?: any;
};

export const ReportEditor = ({ isOpen, onClose, onSubmit, contextLocation, locations = [], authUser }: ReportEditorProps) => {
  const [content, setContent] = useState('');
  const [isCritical, setIsCritical] = useState(false);
  const [contactPhone, setContactPhone] = useState('');
  const [linkedCenter, setLinkedCenter] = useState<string | undefined>(contextLocation);
  
  const [showCenterSearch, setShowCenterSearch] = useState(false);
  const [centerSearchQuery, setCenterSearchQuery] = useState('');

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const max = 800;
          
          if (width > height && width > max) {
            height *= max / width;
            width = max;
          } else if (height > max) {
            width *= max / height;
            height = max;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject('No ctx');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(new File([blob], 'compressed.webp', { type: 'image/webp' }));
            } else {
              reject('Blob failed');
            }
          }, 'image/webp', 0.8);
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCompressing(true);
      try {
        const compressed = await compressImage(file);
        setImageFile(compressed);
        setImagePreview(URL.createObjectURL(compressed));
      } catch (err) {
        console.error('Error compressing image', err);
      }
      setIsCompressing(false);
    }
  };

  const handleSubmit = () => {
    if (!content.trim() && !imagePreview) return;
    onSubmit(content, isCritical, linkedCenter, isCritical ? contactPhone.trim() : undefined, imageFile || undefined);
    setContent('');
    setIsCritical(false);
    setContactPhone('');
    setShowCenterSearch(false);
    setCenterSearchQuery('');
    setImagePreview(null);
    setImageFile(null);
    onClose();
  };

  const filteredCenters = locations.filter(l => l.name.toLowerCase().includes(centerSearchQuery.toLowerCase())).slice(0, 5);

  return (
    <SwipeableSheet isOpen={isOpen} onClose={onClose} className="report-editor-sheet">
      <div className="report-editor-container">
        
        <div className="editor-header">
          <button className="editor-submit-btn-small" onClick={() => onClose()} style={{background: 'transparent', color: 'var(--gray-500)', padding: 0}}>Cancelar</button>
          <div className="editor-title">Nuevo Reporte</div>
          <button 
            className="editor-submit-btn-small" 
            onClick={handleSubmit}
            disabled={(!content.trim() && !imagePreview) || isCompressing}
          >
            {isCompressing ? 'Procesando...' : 'Publicar'}
          </button>
        </div>
        
        <div className="editor-body" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: '12px', width: '100%', opacity: showCenterSearch ? 0 : 1, pointerEvents: showCenterSearch ? 'none' : 'auto' }}>
            <img src={authUser?.user_metadata?.avatar_url || 'https://i.pravatar.cc/150?u=current'} alt="Avatar" className="editor-avatar" />
            
            <div className="editor-input-area">
              <textarea 
                className="editor-textarea"
                placeholder="Reporta el estado de las vías, novedades de tu zona o necesidades urgentes..."
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, 280))}
                autoFocus={false}
              />
              
              {imagePreview && (
                <div style={{ position: 'relative', marginTop: '4px', borderRadius: '12px', overflow: 'hidden' }}>
                  <img src={imagePreview} alt="Preview" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover' }} />
                  <button 
                    onClick={() => setImagePreview(null)}
                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >✕</button>
                </div>
              )}

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
                <div className="editor-context-chip" style={{background: 'transparent', color: '#8E8E93', padding: '0', pointerEvents: 'none'}}>
                  📍 Charallave, Miranda (Solo ciudad)
                </div>
              )}
            </div>
          </div>
          
          {showCenterSearch && !linkedCenter && (
            <div style={{ 
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
              background: 'var(--white)', zIndex: 10, display: 'flex', flexDirection: 'column'
            }}>
              <input 
                type="text" 
                placeholder="Buscar centro por nombre..." 
                value={centerSearchQuery}
                onChange={(e) => setCenterSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--gray-200)', outline: 'none', fontSize: '15px', fontWeight: '500' }}
                autoFocus
              />
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredCenters.map(center => (
                  <div 
                    key={center.id}
                    onClick={() => { setLinkedCenter(center.name); setShowCenterSearch(false); setCenterSearchQuery(''); }}
                    style={{ padding: '12px', fontSize: '14px', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)' }}
                  >
                    <strong>{center.name}</strong>
                  </div>
                ))}
                {filteredCenters.length === 0 && centerSearchQuery && (
                  <div style={{ padding: '12px', fontSize: '14px', color: 'var(--gray-500)' }}>No se encontraron centros</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="editor-toolbar">
          <div className="editor-tools-left">
            <button 
              className={`editor-tool-btn ${showCenterSearch || linkedCenter ? 'active' : ''}`} 
              title="Vincular Centro de Acopio" 
              onClick={() => {
                if (linkedCenter) {
                  setLinkedCenter(undefined);
                } else {
                  setShowCenterSearch(!showCenterSearch);
                }
              }}
              style={{ background: showCenterSearch || linkedCenter ? '#eff6ff' : 'transparent' }}
            >
              <MapPin size={20} />
            </button>
            <button className="editor-tool-btn" title="Adjuntar Imagen" onClick={() => fileInputRef.current?.click()}>
              <ImageIcon size={20} />
            </button>
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleImageSelect} 
            />
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

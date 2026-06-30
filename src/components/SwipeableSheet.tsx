import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

interface SwipeableSheetProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}

export function SwipeableSheet({ isOpen, onClose, className = '', children }: SwipeableSheetProps) {
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{ touchAction: 'none', zIndex: 99999 }}
        >
          <motion.div
            className={`modal-sheet ${className}`}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 350, mass: 0.8 }}
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 80 || info.velocity.y > 300) onClose();
            }}
            style={{ touchAction: 'none', willChange: 'transform' }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

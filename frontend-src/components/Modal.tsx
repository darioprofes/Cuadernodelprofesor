
import React, { ReactNode, useState, useRef, useEffect } from 'react';
import IconButton from './IconButton';
import {
  MODAL_SIZE_CLASSES,
  modalBodyClassName,
  modalHeaderClassName,
  modalOverlayClassName,
  modalPanelClassName,
  modalTitleClassName,
  type ModalSize,
} from '../theme/components/Modal';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: ModalSize;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'lg' }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Reset position when modal opens
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  // Handle global mouse events for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      dragStartPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only allow dragging from the header area
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  if (!isOpen) return null;

  return (
    <div className={modalOverlayClassName}>
      <div
        ref={modalRef}
        className={`${modalPanelClassName} ${MODAL_SIZE_CLASSES[size]}`}
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
            className={modalHeaderClassName}
            onMouseDown={handleMouseDown}
        >
          <h3 className={modalTitleClassName}>{title}</h3>
          <IconButton label="Cerrar" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </IconButton>
        </div>
        <div className={modalBodyClassName}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;

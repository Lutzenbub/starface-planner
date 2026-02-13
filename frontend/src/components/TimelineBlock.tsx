import React, { useState, useEffect, useRef } from 'react';
import { EvaluatedBlock, Conflict } from '../types';
import { minutesToTime } from '../utils';
import { AlertTriangle, ArrowRightCircle, Mic, Voicemail, Phone } from 'lucide-react';

interface TimelineBlockProps {
  block: EvaluatedBlock;
  conflicts: Conflict[];
  onUpdate: (block: EvaluatedBlock, newStart: number, newEnd: number) => void;
  onEdit: () => void;
  totalWidth: number; // width of container in px
}

export const TimelineBlock: React.FC<TimelineBlockProps> = ({ block, conflicts, onUpdate, onEdit, totalWidth }) => {
  const isConflict = conflicts.some(c => 
    (c.higher.moduleId === block.moduleId && c.higher.originalIntervalId === block.originalIntervalId && c.higher.startMinutes === block.startMinutes) ||
    (c.lower.moduleId === block.moduleId && c.lower.originalIntervalId === block.originalIntervalId && c.lower.startMinutes === block.startMinutes)
  );
  
  const isConflictLoser = conflicts.some(c => 
    c.lower.moduleId === block.moduleId && c.lower.originalIntervalId === block.originalIntervalId && c.lower.startMinutes === block.startMinutes
  );

  const startPercent = (block.startMinutes / 1440) * 100;
  const widthPercent = ((block.endMinutes - block.startMinutes) / 1440) * 100;

  // Simple drag logic
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [initialStartMin, setInitialStartMin] = useState(0);

  const blockRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    setDragStartX(e.clientX);
    setInitialStartMin(block.startMinutes);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - dragStartX;
      const deltaMinutes = (deltaX / totalWidth) * 1440;
      
      const newStart = Math.max(0, Math.min(1440 - (block.endMinutes - block.startMinutes), initialStartMin + deltaMinutes));
      const duration = block.endMinutes - block.startMinutes;
      const newEnd = newStart + duration;

      // Snap to 15 mins
      const snappedStart = Math.round(newStart / 15) * 15;
      const snappedEnd = snappedStart + duration;

      if (snappedStart !== block.startMinutes) {
        onUpdate(block, snappedStart, snappedEnd);
      }
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
  }, [isDragging, dragStartX, initialStartMin, block, totalWidth, onUpdate]);

  // Construct Forwarding Label
  const getForwardingLabel = () => {
    if (!block.forwardingTarget) return null;
    
    // Determine Icon
    let icon = <ArrowRightCircle size={10} className="inline mr-1 flex-shrink-0" />;
    if (block.forwardingTarget.includes('Mailbox')) icon = <Voicemail size={10} className="inline mr-1 flex-shrink-0" />;
    else if (block.forwardingTarget.includes('Audio') || block.forwardingTarget.includes('Ansage')) icon = <Mic size={10} className="inline mr-1 flex-shrink-0" />;
    else if (block.forwardingTarget.includes('Nummer')) icon = <Phone size={10} className="inline mr-1 flex-shrink-0" />;

    // Determine Display Text
    const details = [];
    
    // Logic: If target implies a specific value, show that value.
    if ((block.forwardingTarget.includes('Audio') || block.forwardingTarget.includes('Ansage')) && block.forwardingAnnouncement) {
        details.push(block.forwardingAnnouncement);
    }
    if ((block.forwardingTarget.includes('Nummer') || block.forwardingTarget.includes('Rufnummer')) && block.forwardingNumber) {
        details.push(block.forwardingNumber);
    }
    if (block.forwardingTarget.includes('Mailbox') && block.forwardingMailbox) {
        details.push(block.forwardingMailbox);
    }

    const detailString = details.join(' + ');
    const label = detailString ? `${block.forwardingTarget}: ${detailString}` : block.forwardingTarget;

    const textShadowStyle = { textShadow: '0 1px 3px rgba(0,0,0,0.8)' };

    return (
      <div className="flex items-center text-[10px] opacity-95 w-full overflow-hidden mt-0.5" title={label} style={textShadowStyle}>
        {icon}
        <span className="truncate">{label}</span>
      </div>
    );
  };

  const textShadowStyle = { textShadow: '0 1px 3px rgba(0,0,0,0.8)' };

  return (
    <div
      ref={blockRef}
      className={`absolute h-10 rounded-md flex flex-col justify-center px-2 text-xs font-medium border shadow-sm cursor-grab active:cursor-grabbing group overflow-hidden transition-all duration-200 ${isConflictLoser ? 'opacity-50 grayscale' : ''}`}
      style={{
        left: `${startPercent}%`,
        width: `${widthPercent}%`,
        backgroundColor: block.color,
        borderColor: 'rgba(255,255,255,0.2)',
        zIndex: isDragging ? 50 : 10
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
    >
      {/* Tooltip Hover Bubble */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs bg-gray-900 border border-gray-700 text-white text-xs rounded shadow-lg p-3 z-50 pointer-events-none">
        <div className="font-bold border-b border-gray-700 pb-1 mb-2 text-primary-400">{block.moduleName}</div>
        <div className="mb-2"><span className="text-gray-400">Zeit:</span> {minutesToTime(block.startMinutes)} - {minutesToTime(block.endMinutes)}</div>
        
        {block.forwardingTarget && (
           <div className="pt-1 border-t border-gray-800">
             <div className="font-semibold mb-1 text-gray-300">Ziel: {block.forwardingTarget}</div>
             <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-gray-400">
                {block.forwardingNumber && <><span>Rufnummer:</span><span className="text-white">{block.forwardingNumber}</span></>}
                {block.forwardingMailbox && <><span>Mailbox:</span><span className="text-white">{block.forwardingMailbox}</span></>}
                {block.forwardingAnnouncement && <><span>Ansage:</span><span className="text-white italic">{block.forwardingAnnouncement}</span></>}
             </div>
           </div>
        )}
        {/* Arrow for tooltip */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-700"></div>
      </div>

      {isConflict && (
        <div className="absolute right-1 top-1 text-yellow-300 animate-pulse bg-black/50 rounded-full p-0.5">
          <AlertTriangle size={12} />
        </div>
      )}
      
      <div className="truncate text-white pointer-events-none leading-tight" style={textShadowStyle}>
        <span className="font-bold mr-1">{block.moduleName}</span>
        {/* Hide time if block is very small to prioritize name */}
        <span className="opacity-90 hidden sm:inline">({minutesToTime(block.startMinutes)} - {minutesToTime(block.endMinutes)})</span>
      </div>
      
      {/* Forwarding Line - Truncates automatically if no space */}
      {getForwardingLabel()}

      {/* Resize handles */}
      <div className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-white/30" />
      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-white/30" />
    </div>
  );
};
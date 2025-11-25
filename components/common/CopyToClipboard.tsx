
import React, { useState } from 'react';

interface CopyToClipboardProps {
  children: React.ReactNode;
  valueToCopy: string | number | 'N/A' | 'Error';
  className?: string;
}

const CopyToClipboard: React.FC<CopyToClipboardProps> = ({ children, valueToCopy, className = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault(); // Essential to stop propagation to row
    e.stopPropagation();
    
    // Validate value before processing
    if (
        valueToCopy === 'N/A' || 
        valueToCopy === 'Error' || 
        valueToCopy === null || 
        valueToCopy === undefined || 
        Number.isNaN(valueToCopy)
    ) return;

    const textToCopy = String(valueToCopy).replace(/[^0-9.-]/g, '');
    if(textToCopy === '') return;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  return (
    <div 
        onClick={handleCopy} 
        className={`relative cursor-pointer group inline-block ${className}`}
        title="Click to copy value"
        role="button"
        tabIndex={0}
    >
      {children}
      {copied && (
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap pointer-events-none">
          Copied!
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></span>
        </span>
      )}
    </div>
  );
};

export default CopyToClipboard;

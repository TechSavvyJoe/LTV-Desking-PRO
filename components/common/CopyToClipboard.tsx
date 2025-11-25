
import React, { useState } from 'react';

interface CopyToClipboardProps {
  children: React.ReactNode;
  valueToCopy: string | number | 'N/A' | 'Error';
  className?: string;
}

const CopyToClipboard: React.FC<CopyToClipboardProps> = ({ children, valueToCopy, className }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (valueToCopy === 'N/A' || valueToCopy === 'Error' || valueToCopy === null || valueToCopy === undefined) return;

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
    <span onClick={handleCopy} className={`relative cursor-pointer group ${className}`} title="Click to copy value">
      {children}
      {copied && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded-md z-10 animate-fade-in-out">
          Copied!
        </span>
      )}
      <style>{`
        @keyframes fade-in-out {
          0% { opacity: 0; transform: translate(-50%, -5px); }
          20% { opacity: 1; transform: translate(-50%, 0); }
          80% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -5px); }
        }
        .animate-fade-in-out {
          animation: fade-in-out 1.5s ease-in-out;
        }
      `}</style>
    </span>
  );
};

export default CopyToClipboard;

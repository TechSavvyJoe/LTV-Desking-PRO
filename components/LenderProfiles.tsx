
import React, { useState, useCallback } from 'react';
import type { LenderProfile, LenderTier } from '../types';
import Button from './common/Button';
import LenderProfileModal from './LenderProfileModal';
import { generateLenderCheatSheetPdf } from '../services/pdfGenerator';
import * as Icons from './common/Icons';

interface LenderProfilesProps {
  profiles: LenderProfile[];
  onUpdate: React.Dispatch<React.SetStateAction<LenderProfile[]>>;
}

const getRange = (tiers: LenderTier[], key: keyof LenderTier): string => {
    if (!tiers || !Array.isArray(tiers) || tiers.length === 0) return 'N/A';
    // Filter out potential null/undefined entries in the array
    const validTiers = tiers.filter(t => t);
    if (validTiers.length === 0) return 'N/A';

    const values = validTiers.map(t => t[key] as number).filter(v => typeof v === 'number' && v > 0);
    if (values.length === 0) return 'N/A';
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? `${min}` : `${min} - ${max}`;
};

const TierDetail = ({ label, value }: { label: string, value: string | number | undefined | null }) => {
    if (value === undefined || value === null || value === '') return null;
    return <div className="text-xs"><span className="text-slate-400">{label}: </span><span className="font-medium text-slate-100">{value}</span></div>;
};

const LenderProfiles: React.FC<LenderProfilesProps> = ({ profiles, onUpdate }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<LenderProfile | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const handleAddNew = () => {
    setEditingProfile(null);
    setIsModalOpen(true);
  };

  const handleEdit = (profile: LenderProfile) => {
    setEditingProfile(profile);
    setIsModalOpen(true);
  };

  const handleSave = (profileToSave: LenderProfile) => {
    onUpdate(prev => {
      const exists = prev.some(p => p.id === profileToSave.id);
      if (exists) {
        return prev.map(p => p.id === profileToSave.id ? profileToSave : p);
      }
      return [...prev, { ...profileToSave, id: `new_${Date.now()}` }];
    });
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this lender profile?')) {
        onUpdate(prev => prev.filter(p => p.id !== id));
    }
  };
  
  const toggleRowExpansion = useCallback((id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const handleDownloadCheatSheet = async () => {
    if (profiles.length === 0) {
      alert("No lender profiles to generate a cheat sheet for.");
      return;
    }
    try {
      const blob = await generateLenderCheatSheetPdf(profiles);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error("Failed to generate lender cheat sheet PDF:", error);
      alert("Sorry, there was an error creating the cheat sheet. Please try again.");
    }
  };
  
  const ExpandedRow = ({ profile }: { profile: LenderProfile }) => {
    const tiers = (profile?.tiers && Array.isArray(profile.tiers)) ? profile.tiers : [];
    return (
        <td colSpan={6} className="p-0">
            <div className="p-4 bg-x-hover-dark">
                <h4 className="font-semibold text-x-text-primary mb-2">Lending Tiers</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                    {tiers.length > 0 ? tiers.map((tier, index) => {
                        if (!tier) return null;
                        return (
                        <div key={index} className="border border-x-border rounded-lg p-3 space-y-1">
                            <p className="font-bold text-x-blue">{tier.name}</p>
                            <TierDetail label="FICO" value={tier.minFico ? `${tier.minFico}${tier.maxFico ? ` - ${tier.maxFico}`: '+'}` : (tier.maxFico ? `Up to ${tier.maxFico}` : null)} />
                            <TierDetail label="Year" value={tier.minYear ? `${tier.minYear}${tier.maxYear ? ` - ${tier.maxYear}`: '+'}` : (tier.maxYear ? `Up to ${tier.maxYear}` : null)} />
                            <TierDetail label="Mileage" value={tier.minMileage ? `Over ${tier.minMileage.toLocaleString()}` : (tier.maxMileage ? `Up to ${tier.maxMileage.toLocaleString()}` : null)} />
                            <TierDetail label="Term" value={tier.minTerm ? `${tier.minTerm} - ${tier.maxTerm}mo` : (tier.maxTerm ? `Up to ${tier.maxTerm}mo` : null)} />
                            <TierDetail label="LTV" value={tier.maxLtv ? `Up to ${tier.maxLtv}%` : null} />
                            <TierDetail label="Fin. Amt" value={tier.minAmountFinanced ? `$${tier.minAmountFinanced.toLocaleString()}${tier.maxAmountFinanced ? ` - $${tier.maxAmountFinanced.toLocaleString()}`: '+'}` : (tier.maxAmountFinanced ? `Up to $${tier.maxAmountFinanced.toLocaleString()}`: null)} />
                        </div>
                        )}) : <p className="text-slate-400 text-sm italic">No tiers defined.</p>}
                </div>
            </div>
        </td>
    )
  };

  // Ensure we are working with a valid array and valid objects
  const safeProfiles = (Array.isArray(profiles) ? profiles : []).filter(p => p && typeof p === 'object');

  return (
    <div className="my-8 bg-slate-950 border border-slate-800 rounded-2xl shadow-xl p-5">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
        <h2 className="text-xl font-bold text-white">Manage Lender Profiles</h2>
        <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleDownloadCheatSheet}>
                <Icons.PdfIcon />
                <span className="ml-2">Download Cheat Sheet</span>
            </Button>
            <Button variant="secondary" onClick={handleAddNew}>Add New Lender</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-200">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900">
              {['Name', 'FICO Range', 'Max LTV Range', 'Book Source', 'Tiers', 'Action'].map(header => (
                <th key={header} className="p-3 font-semibold text-slate-400 text-left">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {safeProfiles.map(profile => (
             <React.Fragment key={profile.id}>
              <tr 
                className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900 cursor-pointer"
                onClick={() => toggleRowExpansion(profile.id)}
              >
                <td className="p-3 font-medium text-white">{profile.name}</td>
                <td className="p-3">{getRange(profile.tiers, 'minFico')}</td>
                <td className="p-3">{getRange(profile.tiers, 'maxLtv')}%</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${profile.bookValueSource === 'Retail' ? 'bg-blue-900/60 text-blue-200' : 'bg-slate-800 text-slate-300'}`}>
                    {profile.bookValueSource || 'Trade'}
                  </span>
                </td>
                <td className="p-3">{profile.tiers && Array.isArray(profile.tiers) ? profile.tiers.length : 0}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={(e) => {e.stopPropagation(); handleEdit(profile)}}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={(e) => {e.stopPropagation(); handleDelete(profile.id)}}>Delete</Button>
                  </div>
                </td>
              </tr>
              {expandedRows.has(profile.id) && <tr className="border-b border-slate-800"><ExpandedRow profile={profile} /></tr>}
             </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      
      {isModalOpen && (
        <LenderProfileModal
            profile={editingProfile}
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSave={handleSave}
        />
      )}
    </div>
  );
};

export default LenderProfiles;

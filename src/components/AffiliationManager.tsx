import React from 'react';
import { MemberAffiliation } from '../types';
import { Plus, Trash2, Shield, Building, Award, Check } from 'lucide-react';

interface AffiliationManagerProps {
  affiliations: MemberAffiliation[];
  onChange: (affiliations: MemberAffiliation[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const PRESET_AFFILIATIONS = [
  { name: 'Senior Citizen ID', type: 'Senior Citizen', placeholder: 'SC-2026-0000', icon: '🧓' },
  { name: 'PWD ID', type: 'PWD', placeholder: 'PWD-072251-000', icon: '♿' },
  { name: '4Ps / DSWD Beneficiary', type: '4Ps / DSWD', placeholder: '4PS-07-22-0000', icon: '🏠' },
  { name: 'FCCT Cooperative Member', type: 'Cooperative', placeholder: 'FCCT-MBR-0000', icon: '🌾' },
  { name: 'PCA Coconut Farmers (CFIDP)', type: 'Government Agency', placeholder: 'PCA-NCFRS-0000', icon: '🥥' },
  { name: 'Tuburan Coffee Growers Association', type: 'Farmers Association', placeholder: 'TCGA-2026-000', icon: '☕' },
  { name: 'Irrigators Association (IA / NIA)', type: 'Farmers Association', placeholder: 'NIA-IA-0000', icon: '🚜' },
  { name: 'Agrarian Reform Beneficiary (ARBO)', type: 'Government Agency', placeholder: 'DAR-ARB-0000', icon: '📜' },
  { name: 'PhilHealth Member', type: 'Government Agency', placeholder: 'PHIC-12-000000000-0', icon: '🏥' },
  { name: 'Barangay ID / Resident ID', type: 'Government Agency', placeholder: 'BRGY-ALEGRIA-000', icon: '🏛️' }
];

export default function AffiliationManager({
  affiliations = [],
  onChange,
  disabled = false,
  compact = false
}: AffiliationManagerProps) {
  const handleAddAffiliation = (name = '', type = 'Other', placeholder = '') => {
    const newAffiliation: MemberAffiliation = {
      id: `aff-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name,
      idNumber: '',
      type
    };
    onChange([...affiliations, newAffiliation]);
  };

  const handleUpdateAffiliation = (id: string, field: keyof MemberAffiliation, value: string) => {
    const updated = affiliations.map(a => (a.id === id ? { ...a, [field]: value } : a));
    onChange(updated);
  };

  const handleRemoveAffiliation = (id: string) => {
    const updated = affiliations.filter(a => a.id !== id);
    onChange(updated);
  };

  const handleQuickAdd = (preset: typeof PRESET_AFFILIATIONS[number]) => {
    // Check if already added
    const existing = affiliations.find(a => a.name.toLowerCase() === preset.name.toLowerCase());
    if (existing) return;

    handleAddAffiliation(preset.name, preset.type, preset.placeholder);
  };

  return (
    <div className="space-y-3 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-[#D5CFC1] pb-2">
        <div>
          <label className="text-xs font-black text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5">
            <Award className="w-4 h-4 text-[#2D6A4F]" />
            <span>Ubang mga ID ug Organisasyon (Other IDs & Organizations)</span>
          </label>
          <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium">
            Gawas sa RSBSA, idugang ang mga ID ug kapunongan nga gisakopan sa mag-uuma (Senior Citizen, PWD, 4Ps, FCCT Co-op, PCA, ubp.)
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleAddAffiliation('', 'Other')}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1B4332] hover:bg-[#143326] text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>+ Magdugang og ID / Organisasyon (Add More)</span>
        </button>
      </div>

      {/* Quick Select Preset Pills */}
      {!disabled && (
        <div className="space-y-1.5 bg-[#FAF8F5] p-2.5 rounded-xl border border-[#D5CFC1]">
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-wide block">
            Daling Pagpili (Quick Select Suggestions):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_AFFILIATIONS.map((preset) => {
              const isSelected = affiliations.some(a => a.name.toLowerCase() === preset.name.toLowerCase());
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleQuickAdd(preset)}
                  disabled={isSelected}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 opacity-60 cursor-not-allowed'
                      : 'bg-white hover:bg-[#D8F3DC] text-[#1B4332] border border-[#D5CFC1] hover:border-[#1B4332]'
                  }`}
                  title={isSelected ? 'Na-add na kini' : `Idugang ang ${preset.name}`}
                >
                  <span>{preset.icon}</span>
                  <span>{preset.name}</span>
                  {isSelected && <Check className="w-3 h-3 text-emerald-600 ml-0.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Current Affiliations List */}
      {affiliations.length > 0 ? (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {affiliations.map((aff, index) => (
            <div
              key={aff.id || index}
              className="bg-[#FAF8F5] border-2 border-[#D5CFC1] hover:border-[#1B4332]/50 rounded-xl p-2.5 sm:p-3 transition-all flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3"
            >
              <div className="w-6 h-6 rounded-lg bg-[#EAF4EC] text-[#1B4332] font-black text-xs flex items-center justify-center shrink-0 border border-[#2D6A4F]/20">
                {index + 1}
              </div>

              {/* Organization / ID Name */}
              <div className="flex-1 w-full sm:w-auto">
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5 sm:hidden">
                  Ngalan sa ID / Organisasyon
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Citizen ID, FCCT Member, PWD..."
                  value={aff.name}
                  onChange={(e) => handleUpdateAffiliation(aff.id, 'name', e.target.value)}
                  disabled={disabled}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D5CFC1] rounded-lg text-slate-900 font-bold focus:outline-none focus:border-[#1B4332]"
                />
              </div>

              {/* ID / Control Number */}
              <div className="flex-1 w-full sm:w-auto">
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5 sm:hidden">
                  Koda / ID Number (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. SC-072251-1234 (ID / Control No.)"
                  value={aff.idNumber || ''}
                  onChange={(e) => handleUpdateAffiliation(aff.id, 'idNumber', e.target.value)}
                  disabled={disabled}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D5CFC1] rounded-lg text-[#BF360C] font-mono font-bold focus:outline-none focus:border-[#1B4332]"
                />
              </div>

              {/* Delete Button */}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemoveAffiliation(aff.id)}
                  className="p-1.5 text-rose-600 hover:text-white hover:bg-rose-600 rounded-lg border border-rose-200 transition-colors cursor-pointer shrink-0 self-end sm:self-center"
                  title="Tangtanga kini nga ID / organisasyon"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}

          <div className="pt-1 flex justify-center sm:justify-start">
            <button
              type="button"
              onClick={() => handleAddAffiliation('', 'Other')}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EAF4EC] hover:bg-[#D8F3DC] text-[#1B4332] text-xs font-black rounded-xl border border-[#2D6A4F]/30 transition-all cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 text-[#1B4332]" />
              <span>+ Idugang Pa (Add More)</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-[#FAF8F5] border-2 border-dashed border-[#D5CFC1] rounded-xl text-center space-y-2">
          <p className="text-xs text-slate-600 font-semibold">
            Wala pay laing ID o organisasyon nga narehistro gawas sa RSBSA.
          </p>
          <button
            type="button"
            onClick={() => handleAddAffiliation('', 'Other')}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1B4332] hover:bg-[#143326] text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Idugang ang Unang ID / Organisasyon (Add ID/Org)</span>
          </button>
        </div>
      )}
    </div>
  );
}

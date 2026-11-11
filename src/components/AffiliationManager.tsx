import React from 'react';
import { MemberAffiliation } from '../types';
import { Plus, Trash2, Award, Check } from 'lucide-react';

interface AffiliationManagerProps {
  affiliations: MemberAffiliation[];
  onChange: (affiliations: MemberAffiliation[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

export interface PresetAffiliation {
  name: string;
  type: MemberAffiliation['type'];
  placeholder: string;
  icon: string;
}

export const PRESET_AFFILIATIONS: ReadonlyArray<PresetAffiliation> = [
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
] as const;

/** Case-insensitive lookup used by the preset pills and the quick-add guard. */
export function isPresetSelected(
  affiliations: ReadonlyArray<Pick<MemberAffiliation, 'name'>>,
  name: string
): boolean {
  const target = name.trim().toLowerCase();
  return affiliations.some(a => (a.name || '').trim().toLowerCase() === target);
}

interface PresetPillsProps {
  selectedNames: ReadonlySet<string>;
  onAdd: (preset: PresetAffiliation) => void;
}

function PresetPills({ selectedNames, onAdd }: PresetPillsProps) {
  return (
    <div className="space-y-1.5 bg-[#FAF8F5] p-2.5 rounded-xl border border-[#D5CFC1]">
      <span className="text-[10px] font-black text-slate-600 uppercase tracking-wide block">
        Quick Selection:
      </span>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_AFFILIATIONS.map((preset) => {
          const isSelected = selectedNames.has(preset.name.toLowerCase());
          return (
            <button
              key={preset.name}
              type="button"
              onClick={() => onAdd(preset)}
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
  );
}

interface AffiliationRowProps {
  aff: MemberAffiliation;
  index: number;
  disabled: boolean;
  onChange: (id: string, field: 'name' | 'idNumber', value: string) => void;
  onRemove: (id: string) => void;
}

function AffiliationRow({ aff, index, disabled, onChange, onRemove }: AffiliationRowProps) {
  return (
    <div className="bg-[#FAF8F5] border-2 border-[#D5CFC1] hover:border-[#1B4332]/50 rounded-xl p-2.5 sm:p-3 transition-all flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
      <div className="w-6 h-6 rounded-lg bg-[#EAF4EC] text-[#1B4332] font-black text-xs flex items-center justify-center shrink-0 border border-[#2D6A4F]/20">
        {index + 1}
      </div>

      {/* Organization / ID Name */}
      <div className="flex-1 w-full sm:w-auto">
        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5 sm:hidden">
          Organization Name
        </label>
        <input
          type="text"
          required
          placeholder="Senior Citizen ID, FCCT Member, PWD..."
          value={aff.name}
          onChange={(e) => onChange(aff.id, 'name', e.target.value)}
          disabled={disabled}
          className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D5CFC1] rounded-lg text-slate-900 font-bold focus:outline-none focus:border-[#1B4332]"
        />
      </div>

      {/* ID / Control Number */}
      <div className="flex-1 w-full sm:w-auto">
        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5 sm:hidden">
          ID Number
        </label>
        <input
          type="text"
          placeholder="SC-072251-1234 (ID / Control No.)"
          value={aff.idNumber || ''}
          onChange={(e) => onChange(aff.id, 'idNumber', e.target.value)}
          disabled={disabled}
          className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D5CFC1] rounded-lg text-[#BF360C] font-mono font-bold focus:outline-none focus:border-[#1B4332]"
        />
      </div>

      {/* Delete Button */}
      {!disabled && (
        <button
          type="button"
          onClick={() => onRemove(aff.id)}
          className="p-1.5 text-rose-600 hover:text-white hover:bg-rose-600 rounded-lg border border-rose-200 transition-colors cursor-pointer shrink-0 self-end sm:self-center"
          title="Tangtanga kini nga ID / organisasyon"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default function AffiliationManager({
  affiliations = [],
  onChange,
  disabled = false,
  compact = false
}: AffiliationManagerProps) {
  // Rows restored from storage may be missing an id; assign a stable one so they stay editable/removable.
  const rows = React.useMemo(
    () => affiliations.map((aff, index) => (aff.id ? aff : { ...aff, id: `aff-legacy-${index}` })),
    [affiliations]
  );

  const handleAddAffiliation = (name = '', type: MemberAffiliation['type'] = 'Other') => {
    const newAffiliation: MemberAffiliation = {
      id: `aff-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name,
      idNumber: '',
      type
    };
    onChange([...rows, newAffiliation]);
  };

  const handleUpdateAffiliation = (
    id: string,
    field: 'name' | 'idNumber',
    value: string
  ) => {
    const updated = rows.map(a => (a.id === id ? { ...a, [field]: value } : a));
    onChange(updated);
  };

  const handleRemoveAffiliation = (id: string) => {
    const updated = rows.filter(a => a.id !== id);
    onChange(updated);
  };

  const selectedNames = React.useMemo(
    () => new Set(rows.map(a => (a.name || '').trim().toLowerCase()).filter(Boolean)),
    [rows]
  );

  const handleQuickAdd = (preset: PresetAffiliation) => {
    if (isPresetSelected(rows, preset.name)) return;
    handleAddAffiliation(preset.name, preset.type);
  };

  return (
    <div className="space-y-3 text-left">
      <div className="border-b border-[#D5CFC1] pb-2">
        <label className="text-xs font-black text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5">
          <Award className="w-4 h-4 text-[#2D6A4F]" />
          <span>Ubang mga ID ug Organisasyon</span>
        </label>
      </div>

      {/* Quick Select Preset Pills */}
      {!disabled && <PresetPills selectedNames={selectedNames} onAdd={handleQuickAdd} />}

      {/* Add button is always available so an empty list can still grow */}
      {!disabled && (
        <div className="pt-1 flex justify-center sm:justify-start">
          <button
            type="button"
            onClick={() => handleAddAffiliation('', 'Other')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EAF4EC] hover:bg-[#D8F3DC] text-[#1B4332] text-xs font-black rounded-xl border border-[#2D6A4F]/30 transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#1B4332]" />
            <span>Add More</span>
          </button>
        </div>
      )}

      {/* Current Affiliations List */}
      {rows.length > 0 && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {rows.map((aff, index) => (
            <AffiliationRow
              key={aff.id}
              aff={aff}
              index={index}
              disabled={disabled}
              onChange={handleUpdateAffiliation}
              onRemove={handleRemoveAffiliation}
            />
          ))}
        </div>
      )}
    </div>
  );
}

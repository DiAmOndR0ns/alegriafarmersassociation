import React, { useState, useEffect } from 'react';
import { Member } from '../types';
import { 
  CheckCircle2, XCircle, AlertCircle, Search, 
  MapPin, Check, RefreshCw, Star, HelpCircle, 
  Users, UserCheck, UserX, UserMinus, ShieldAlert
} from 'lucide-react';

interface RollCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingTitle: string;
  members: Member[];
  initialRecord?: Record<string, 'Present' | 'Absent' | 'Excused'>;
  onSave: (record: Record<string, 'Present' | 'Absent' | 'Excused'>) => void;
}

export default function RollCallModal({
  isOpen,
  onClose,
  meetingTitle,
  members,
  initialRecord,
  onSave
}: RollCallModalProps) {
  const [record, setRecord] = useState<Record<string, 'Present' | 'Absent' | 'Excused'>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSitio, setSelectedSitio] = useState('All');

  // Load or initialize record when modal opens or members/initialRecord change
  useEffect(() => {
    if (isOpen) {
      const activeMembers = members.filter(m => m.status === 'Active');
      const defaultRecord: Record<string, 'Present' | 'Absent' | 'Excused'> = {};
      
      activeMembers.forEach(member => {
        if (initialRecord && initialRecord[member.id]) {
          defaultRecord[member.id] = initialRecord[member.id];
        } else {
          // Default to 'Present' or unset (we'll default to 'Present' for easier bulk marking, or leave undefined to force action)
          // Let's default to 'Present' to make it faster for the secretary, or let them click. Let's default to 'Present'
          defaultRecord[member.id] = 'Present';
        }
      });
      setRecord(defaultRecord);
    }
  }, [isOpen, initialRecord, members]);

  if (!isOpen) return null;

  const activeMembers = members.filter(m => m.status === 'Active');

  // Filter members based on search and sitio
  const filteredMembers = activeMembers.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          m.farmLocation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSitio = selectedSitio === 'All' || m.farmLocation.includes(selectedSitio);
    return matchesSearch && matchesSitio;
  });

  // Unique Sitios for filtering
  const sitios = ['All', ...Array.from(new Set(activeMembers.map(m => {
    // Extract a cleaner Sitio name if possible, or just use the full string
    const match = m.farmLocation.match(/Sitio\s+[^,]+/i);
    return match ? match[0] : m.farmLocation;
  })))];

  const handleMarkStatus = (memberId: string, status: 'Present' | 'Absent' | 'Excused') => {
    setRecord(prev => ({
      ...prev,
      [memberId]: status
    }));
  };

  const handleMarkAll = (status: 'Present' | 'Absent' | 'Excused') => {
    const updated = { ...record };
    filteredMembers.forEach(m => {
      updated[m.id] = status;
    });
    setRecord(updated);
  };

  const handleSave = () => {
    onSave(record);
    onClose();
  };

  // Stats calculation
  const totalCount = activeMembers.length;
  const presentCount = Object.values(record).filter(v => v === 'Present').length;
  const absentCount = Object.values(record).filter(v => v === 'Absent').length;
  const excusedCount = Object.values(record).filter(v => v === 'Excused').length;
  
  const presentPercent = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
  const absentPercent = totalCount > 0 ? Math.round((absentCount / totalCount) * 100) : 0;
  const excusedPercent = totalCount > 0 ? Math.round((excusedCount / totalCount) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fade-in text-left">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* MODAL HEADER */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-600/10 p-2 rounded-xl border border-emerald-500/20 text-emerald-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Digital Roll Call Attendance</h3>
              <p className="text-xs text-slate-400">
                Recording for: <span className="text-emerald-400 font-semibold">{meetingTitle || 'New Meeting/Assembly'}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all font-bold text-xl"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* STATS & SUMMARY DASHBOARD */}
        <div className="bg-slate-950/40 border-b border-slate-800 p-4 shrink-0 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Active Association Members</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-white">{totalCount}</span>
              <span className="text-xs text-slate-400">farmers registered</span>
            </div>
          </div>

          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-emerald-500 block">Present (Pirme / Nitambong)</span>
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">{presentPercent}%</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black text-emerald-400">{presentCount}</span>
              <span className="text-xs text-slate-400">/ {totalCount}</span>
            </div>
          </div>

          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-rose-500 block">Absent (Wala / Absent)</span>
              <span className="text-xs font-semibold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-md">{absentPercent}%</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black text-rose-400">{absentCount}</span>
              <span className="text-xs text-slate-400">/ {totalCount}</span>
            </div>
          </div>

          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-amber-500 block">Excused (May Rason)</span>
              <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md">{excusedPercent}%</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black text-amber-400">{excusedCount}</span>
              <span className="text-xs text-slate-400">/ {totalCount}</span>
            </div>
          </div>
        </div>

        {/* SEARCH, FILTER & BULK ACTIONS */}
        <div className="p-4 bg-slate-950/20 border-b border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between shrink-0">
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search member name or sitio..."
                className="w-full bg-slate-900 text-xs text-white pl-9 pr-3.5 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-emerald-500 transition-all font-sans"
              />
            </div>

            {/* Sitio Filter */}
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={selectedSitio}
                onChange={(e) => setSelectedSitio(e.target.value)}
                className="bg-slate-900 text-xs text-slate-300 px-2.5 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-emerald-500 font-sans"
              >
                {sitios.map(s => (
                  <option key={s} value={s}>{s === 'All' ? 'All Sitios' : s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bulk Action Buttons */}
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => handleMarkAll('Present')}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/30 text-emerald-400 border border-emerald-900/50 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Mark Filtered Present</span>
            </button>
            <button
              type="button"
              onClick={() => handleMarkAll('Absent')}
              className="flex items-center gap-1 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/30 text-rose-400 border border-rose-900/50 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Mark Filtered Absent</span>
            </button>
          </div>
        </div>

        {/* MEMBERS LIST SCROLLABLE GRID */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-0 bg-slate-900/20">
          {filteredMembers.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6">
              <Users className="w-10 h-10 text-slate-600 mx-auto stroke-[1.25] mb-2" />
              <p className="text-sm font-semibold text-slate-400">No active association members found</p>
              <p className="text-xs text-slate-500 mt-1">Try resetting your search filters or add new members under the roster tab.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredMembers.map((member, idx) => {
                const currentStatus = record[member.id] || 'Present';
                
                return (
                  <div 
                    key={member.id} 
                    className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      currentStatus === 'Present' 
                        ? 'bg-slate-900/60 border-emerald-500/15 hover:border-emerald-500/25'
                        : currentStatus === 'Absent'
                        ? 'bg-slate-900/60 border-rose-500/15 hover:border-rose-500/25'
                        : 'bg-slate-900/60 border-amber-500/15 hover:border-amber-500/25'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-slate-850 border border-slate-750 flex items-center justify-center text-xs font-black text-slate-400 select-none shrink-0 font-mono">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate leading-tight uppercase tracking-wide">{member.name}</h4>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                          <span className="flex items-center gap-0.5 font-sans truncate">
                            <MapPin className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                            {member.farmLocation}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Roll Call Markers */}
                    <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMarkStatus(member.id, 'Present')}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-0.5 ${
                          currentStatus === 'Present'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Present (Nitambong)"
                      >
                        <Check className="w-2.5 h-2.5" />
                        <span className="hidden sm:inline">Present</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMarkStatus(member.id, 'Absent')}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-0.5 ${
                          currentStatus === 'Absent'
                            ? 'bg-rose-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Absent (Wala)"
                      >
                        <XCircle className="w-2.5 h-2.5" />
                        <span className="hidden sm:inline">Absent</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMarkStatus(member.id, 'Excused')}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-0.5 ${
                          currentStatus === 'Excused'
                            ? 'bg-amber-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Excused (May Rason)"
                      >
                        <AlertCircle className="w-2.5 h-2.5" />
                        <span className="hidden sm:inline">Excused</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MODAL FOOTER ACTION BAR */}
        <div className="bg-slate-950 px-5 py-4 border-t border-slate-800 flex justify-between items-center shrink-0">
          <div className="text-[11px] text-slate-400 max-w-[50%] hidden sm:block">
            Attendance count of <span className="font-bold text-white">{presentCount}</span> will be auto-saved and applied to the meeting record.
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition-all cursor-pointer"
            >
              Discard Changes
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 sm:flex-initial px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Save & Apply Roll Call</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

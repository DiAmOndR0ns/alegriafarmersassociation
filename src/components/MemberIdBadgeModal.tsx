import React, { useState } from 'react';
import { Member } from '../types';
import { 
  Printer, X, ShieldCheck, CheckCircle2, AlertCircle, 
  MapPin, Phone, Calendar, User, QrCode, Tag, Award
} from 'lucide-react';

interface MemberIdBadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member | null;
  allMembers?: Member[];
}

export default function MemberIdBadgeModal({
  isOpen,
  onClose,
  member,
  allMembers = []
}: MemberIdBadgeModalProps) {
  const [printMode, setPrintMode] = useState<'single' | 'all'>('single');
  const [fontSizeOption, setFontSizeOption] = useState<'normal' | 'large'>('normal');

  if (!isOpen || !member) return null;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const membersToPrint = printMode === 'all' && allMembers.length > 0 ? allMembers : [member];

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>AFA Official Member Registration ID Cards</title>
          <style>
            @page { size: portrait; margin: 15mm; }
            body { font-family: 'Inter', system-ui, sans-serif; background: #fff; color: #111; padding: 10px; margin: 0; }
            .grid-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
            .id-card { 
              border: 2px solid #1B4332; 
              border-radius: 12px; 
              overflow: hidden; 
              page-break-inside: avoid; 
              background: #FAF8F5;
              box-shadow: none;
              position: relative;
            }
            .id-header { 
              background: #1B4332; 
              color: #fff; 
              padding: 10px 14px; 
              text-align: center;
              border-bottom: 2px solid #D8F3DC;
            }
            .id-header h3 { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
            .id-header p { margin: 2px 0 0; font-size: 8px; color: #D8F3DC; }
            .id-body { padding: 12px; display: grid; grid-template-columns: 80px 1fr; gap: 12px; }
            .photo-box { 
              width: 80px; 
              height: 90px; 
              border: 1.5px solid #1B4332; 
              border-radius: 8px; 
              background: #E8F5E9; 
              display: flex; 
              flex-direction: column;
              align-items: center; 
              justify-content: center; 
              text-align: center;
              font-size: 8px;
              font-weight: bold;
              color: #1B4332;
              overflow: hidden;
            }
            .photo-box img { width: 100%; height: 100%; object-fit: cover; }
            .info-fields { font-size: 10px; line-height: 1.4; }
            .member-name { font-size: 13px; font-weight: 900; color: #1B4332; margin-bottom: 4px; text-transform: uppercase; }
            .field-row { margin-bottom: 3px; }
            .field-label { font-size: 8px; text-transform: uppercase; color: #666; font-weight: bold; }
            .field-val { font-weight: bold; color: #222; }
            .rsbsa-badge { 
              background: #E8F5E9; 
              border: 1px solid #2D6A4F; 
              color: #1B4332; 
              font-size: 8px; 
              font-weight: bold; 
              padding: 2px 6px; 
              border-radius: 4px; 
              display: inline-block;
              margin-top: 4px;
            }
            .id-footer { 
              background: #F0EBE1; 
              padding: 6px 12px; 
              border-top: 1px dashed #CCC; 
              display: flex; 
              justify-content: space-between; 
              align-items: center;
              font-size: 8px;
              color: #555;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="grid-cards">
            ${membersToPrint.map(m => `
              <div class="id-card">
                <div class="id-header">
                  <h3>Alegria Farmers Association</h3>
                  <p>Tuburan, Cebu • DOLE Registered Rural Workers Association • RSBSA Accredited</p>
                </div>
                <div class="id-body">
                  <div class="photo-box">
                    ${m.avatarUrl ? `<img src="${m.avatarUrl}" alt="Photo" />` : `<span>2x2 ID PHOTO</span><span style="font-size:7px; color:#666; margin-top:2px;">AFA SEAL</span>`}
                  </div>
                  <div class="info-fields">
                    <div class="member-name">${m.name}</div>
                    <div class="field-row">
                      <span class="field-label">Member ID:</span> 
                      <span class="field-val" style="font-family:monospace; color:#1B4332;">${m.memberIdNumber || 'AFA-2026-000'}</span>
                    </div>
                    <div class="field-row">
                      <span class="field-label">Sitio Address:</span> 
                      <span class="field-val">${m.farmLocation}</span>
                    </div>
                    <div class="field-row">
                      <span class="field-label">Contact No:</span> 
                      <span class="field-val">${m.contactNumber}</span>
                    </div>
                    <div class="field-row">
                      <span class="field-label">Primary Crops / IGP:</span> 
                      <span class="field-val">${m.primaryCrops.join(', ')}</span>
                    </div>
                    <div>
                      <span class="rsbsa-badge">
                        ${m.isRsbsaRegistered ? `✓ RSBSA: ${m.rsbsaNumber || 'REGISTERED'}` : '⚠ RSBSA PENDING'}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="id-footer">
                  <span>Joined: ${m.joinedDate}</span>
                  <span style="font-weight:bold; color:#1B4332;">OFFICIAL FARMER MEMBER</span>
                </div>
              </div>
            `).join('')}
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border-2 border-[#1B4332] overflow-hidden text-slate-800">
        
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 bg-[#1B4332] text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Award className="w-5 h-5 text-[#95D5B2]" />
            </div>
            <div>
              <h3 className="text-base font-black font-display tracking-wide">
                Official Farmer Registration Badge
              </h3>
              <p className="text-[11px] text-emerald-200">
                AFA Member ID & RSBSA Basic Sector Credentials
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY: ID CARD PREVIEW */}
        <div className="p-5 sm:p-6 space-y-5 bg-[#FAF8F5]">
          
          {/* THE ID BADGE CARD PREVIEW */}
          <div className="bg-white rounded-2xl border-2 border-[#1B4332] overflow-hidden shadow-lg">
            {/* Badge Top Bar */}
            <div className="bg-[#1B4332] text-white p-3 text-center border-b-2 border-emerald-400">
              <span className="text-[9px] font-black tracking-widest uppercase text-emerald-200 block">
                Republic of the Philippines • Tuburan, Cebu
              </span>
              <h4 className="text-xs sm:text-sm font-black uppercase tracking-wide mt-0.5">
                Alegria Farmers Association
              </h4>
              <span className="text-[9px] text-slate-200 block">DOLE Registered Rural Workers Association</span>
            </div>

            {/* Badge Details Grid */}
            <div className="p-4 flex gap-4 items-start">
              {/* Photo Box */}
              <div className="w-24 h-28 shrink-0 rounded-xl border-2 border-[#1B4332] bg-emerald-50 overflow-hidden flex flex-col items-center justify-center text-center p-1 relative shadow-inner">
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-emerald-800">
                    <User className="w-8 h-8 opacity-70" />
                    <span className="text-[8px] font-black uppercase mt-1">Farmer Photo</span>
                  </div>
                )}
              </div>

              {/* Information Column */}
              <div className="space-y-1.5 flex-1 min-w-0">
                <div>
                  <span className="text-[9px] font-black uppercase text-slate-400 block">Rehistradong Mag-uuma:</span>
                  <h3 className="text-sm sm:text-base font-black text-[#1B4332] truncate uppercase">
                    {member.name}
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 block uppercase">Member ID:</span>
                    <span className="font-mono font-black text-emerald-800 text-[11px]">
                      {member.memberIdNumber || 'AFA-2026-000'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 block uppercase">Status:</span>
                    <span className={`font-black text-[10px] px-1.5 py-0.5 rounded-full inline-block ${
                      member.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {member.status}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Sitio Address:</span>
                  <span className="font-bold text-slate-700 text-xs flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-700 shrink-0" />
                    <span className="truncate">{member.farmLocation}</span>
                  </span>
                </div>

                <div>
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Contact Number:</span>
                  <span className="font-mono font-bold text-slate-700 text-xs">
                    {member.contactNumber}
                  </span>
                </div>
              </div>
            </div>

            {/* RSBSA Banner inside Badge */}
            <div className="bg-emerald-50 border-t border-emerald-200 px-4 py-2 flex justify-between items-center text-xs">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span className="font-black text-emerald-900 text-[11px]">
                  RSBSA Registry: {member.isRsbsaRegistered ? member.rsbsaNumber || 'Verified Registered' : 'Not Registered'}
                </span>
              </div>
              <span className="text-[9px] font-mono text-slate-500 font-bold">
                Joined: {member.joinedDate}
              </span>
            </div>
          </div>

          {/* PRINT CONTROLS */}
          <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2 text-xs">
            <label className="font-bold text-slate-700 uppercase text-[10px] block">Print Selection:</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                <input 
                  type="radio" 
                  name="printMode" 
                  checked={printMode === 'single'} 
                  onChange={() => setPrintMode('single')}
                  className="accent-[#1B4332]"
                />
                <span>Print Single Badge ({member.name.split(' ')[0]})</span>
              </label>

              {allMembers.length > 1 && (
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input 
                    type="radio" 
                    name="printMode" 
                    checked={printMode === 'all'} 
                    onChange={() => setPrintMode('all')}
                    className="accent-[#1B4332]"
                  />
                  <span>Print All ({allMembers.length} Members Batch)</span>
                </label>
              )}
            </div>
          </div>

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-white border-t border-slate-200 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            I-close
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-md cursor-pointer transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>I-print ang Member ID Badge</span>
          </button>
        </div>

      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Member } from '../types';
import { Printer, Download, Copy, X, Settings, Check, FileText, Sprout, Landmark, Users, Calendar, MapPin } from 'lucide-react';

interface PrintAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
}

export default function PrintAttendanceModal({ isOpen, onClose, members }: PrintAttendanceModalProps) {
  const [showSettings, setShowSettings] = useState(true);
  const [copied, setCopied] = useState(false);
  
  // Customization Options
  const [documentType, setDocumentType] = useState('Physical Meeting Attendance Sheet');
  const [meetingTitle, setMeetingTitle] = useState('Monthly General Assembly');
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [meetingVenue, setMeetingVenue] = useState('Alegria Multi-Purpose Center');
  const [presidingOfficer, setPresidingOfficer] = useState('Zenaida A. Elbiña (President)');
  const [sheetType, setSheetType] = useState<'blank' | 'prepopulated'>('blank');
  const [blankRowsCount, setBlankRowsCount] = useState(25);
  const [showWatermark, setShowWatermark] = useState(true);
  const [showLetterhead, setShowLetterhead] = useState(true);
  const [customNotes, setCustomNotes] = useState('');

  if (!isOpen) return null;

  // Filter only active members for the pre-populated checklist
  const activeMembers = members.filter(m => m.status === 'Active');

  // Helper to trigger standard printing
  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `AFA_Attendance_Sheet_${meetingDate.replace(/-/g, '')}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  // Helper to copy plain text to clipboard
  const handleCopyToClipboard = () => {
    const divider = '='.repeat(60);
    let tableContent = '';
    
    if (sheetType === 'prepopulated') {
      tableContent = activeMembers.map((member, index) => 
        `${(index + 1).toString().padEnd(4)} | ${member.name.padEnd(25)} | ${member.farmLocation.padEnd(22)} | ${member.contactNumber.padEnd(14)} | [ Signature ]`
      ).join('\n');
    } else {
      tableContent = Array.from({ length: blankRowsCount }).map((_, index) => 
        `${(index + 1).toString().padEnd(4)} | _________________________ | ______________________ | ______________ | [ Signature ]`
      ).join('\n');
    }

    const textContent = `
REPUBLIC OF THE PHILIPPINES
PROVINCE OF CEBU
MUNICIPALITY OF TUBURAN
BARANGAY ALEGRIA

ALEGRIA FARMERS ASSOCIATION (AFA)
${divider}
${documentType.toUpperCase()}
${divider}

MEETING / PURPOSE:   ${meetingTitle || '___________________________'}
DATE OF ASSEMBLY:    ${meetingDate || '___________________________'}
VENUE / LOCATION:    ${meetingVenue || '___________________________'}
PRESIDING OFFICER:   ${presidingOfficer || '___________________________'}

ATTENDANCE REGISTRY:
No.  | Name of Farmer            | Sitio / Farm Location  | Contact No.    | Signature/Lagda
-----+---------------------------+------------------------+----------------+----------------
${tableContent}

${customNotes ? `\nREMARKS / INSTRUCTIONS:\n${customNotes}\n` : ''}
${divider}
CERTIFIED TRUE AND CORRECT BY:

Prepared by:
   Jennylyn S Lumactao
   Secretary, AFA

Attested by:
   ${presidingOfficer.split('(')[0].trim() || 'Zenaida A. Elbiña'}
   President, AFA
`;

    navigator.clipboard.writeText(textContent.trim()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Helper to download as text file
  const handleDownloadTxt = () => {
    const divider = '='.repeat(60);
    let tableContent = '';
    
    if (sheetType === 'prepopulated') {
      tableContent = activeMembers.map((member, index) => 
        `${(index + 1).toString().padEnd(4)} | ${member.name.padEnd(25)} | ${member.farmLocation.padEnd(22)} | ${member.contactNumber.padEnd(14)} | [ Signature ]`
      ).join('\n');
    } else {
      tableContent = Array.from({ length: blankRowsCount }).map((_, index) => 
        `${(index + 1).toString().padEnd(4)} | _________________________ | ______________________ | ______________ | [ Signature ]`
      ).join('\n');
    }

    const textContent = `
REPUBLIC OF THE PHILIPPINES
PROVINCE OF CEBU
MUNICIPALITY OF TUBURAN
BARANGAY ALEGRIA

ALEGRIA FARMERS ASSOCIATION (AFA)
${divider}
${documentType.toUpperCase()}
${divider}

MEETING / PURPOSE:   ${meetingTitle || '___________________________'}
DATE OF ASSEMBLY:    ${meetingDate || '___________________________'}
VENUE / LOCATION:    ${meetingVenue || '___________________________'}
PRESIDING OFFICER:   ${presidingOfficer || '___________________________'}

ATTENDANCE REGISTRY:
No.  | Name of Farmer            | Sitio / Farm Location  | Contact No.    | Signature/Lagda
-----+---------------------------+------------------------+----------------+----------------
${tableContent}

${customNotes ? `\nREMARKS / INSTRUCTIONS:\n${customNotes}\n` : ''}
${divider}
CERTIFIED TRUE AND CORRECT BY:

Prepared by:
   Jennylyn S Lumactao
   Secretary, AFA

Attested by:
   ${presidingOfficer.split('(')[0].trim() || 'Zenaida A. Elbiña'}
   President, AFA
`;

    const element = document.createElement("a");
    const file = new Blob([textContent.trim()], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `AFA_Blank_Attendance_Sheet.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in no-print text-left">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-6xl h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* MODAL ACTION BAR */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-600/10 p-1.5 rounded-lg border border-emerald-500/20 text-emerald-400">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Attendance Sheet Generator</h3>
              <p className="text-[10px] text-slate-400">Generate blank or member checklist print-outs for assemblies.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                showSettings 
                  ? 'bg-emerald-600 border-emerald-500 text-white' 
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{showSettings ? 'Hide Options' : 'Configure Form'}</span>
            </button>

            <button
              onClick={handleCopyToClipboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Plain' : 'Copy Text'}</span>
            </button>

            <button
              onClick={handleDownloadTxt}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .txt</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            <div className="w-[1px] h-6 bg-slate-800 mx-1" />

            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* SIDEBAR SETTINGS */}
          {showSettings && (
            <div className="w-80 bg-slate-950 border-r border-slate-800 p-4 overflow-y-auto space-y-4 shrink-0 animate-fade-in">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                Sheet Settings
              </h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Sheet Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSheetType('blank')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center ${
                        sheetType === 'blank'
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Blank Rows
                    </button>
                    <button
                      type="button"
                      onClick={() => setSheetType('prepopulated')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center ${
                        sheetType === 'prepopulated'
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Active Members ({activeMembers.length})
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Sheet Header Title</label>
                  <input
                    type="text"
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none"
                    placeholder="e.g. Attendance Sheet"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Meeting Purpose</label>
                  <input
                    type="text"
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none"
                    placeholder="e.g. Monthly Assembly"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Date</label>
                    <input
                      type="text"
                      value={meetingDate}
                      onChange={(e) => setMeetingDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none font-sans"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Presiding Officer</label>
                    <input
                      type="text"
                      value={presidingOfficer}
                      onChange={(e) => setPresidingOfficer(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none font-sans"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Venue</label>
                  <input
                    type="text"
                    value={meetingVenue}
                    onChange={(e) => setMeetingVenue(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none"
                  />
                </div>

                {sheetType === 'blank' && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Number of Blank Rows</label>
                    <select
                      value={blankRowsCount}
                      onChange={(e) => setBlankRowsCount(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none"
                    >
                      <option value="15">15 Rows</option>
                      <option value="20">20 Rows</option>
                      <option value="25">25 Rows</option>
                      <option value="30">30 Rows</option>
                      <option value="40">40 Rows</option>
                      <option value="50">50 Rows</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Remarks / Note on footer</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Please sign legibly..."
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none font-sans"
                  />
                </div>

                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showLetterhead}
                      onChange={(e) => setShowLetterhead(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="text-xs text-slate-300">Show Barangay Letterhead</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showWatermark}
                      onChange={(e) => setShowWatermark(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="text-xs text-slate-300">Subtle Draft Watermark</span>
                  </label>
                </div>
              </div>

              <div className="p-3 bg-emerald-950/20 border border-emerald-500/15 rounded-lg text-[10px] text-emerald-400 leading-relaxed">
                <strong>💡 Quick Tip:</strong> If printing empty rows, choose the "Blank Rows" option. If printing a verification list, choose "Active Members" to save time writing down names.
              </div>
            </div>
          )}

          {/* DOCUMENT PREVIEW CONTAINER */}
          <div className="flex-1 bg-slate-950 p-6 md:p-10 overflow-y-auto flex justify-center">
            
            {/* PAPER SHEET */}
            <div 
              id="print-area"
              className="print-area-root bg-white text-slate-900 w-[210mm] min-h-[297mm] p-[15mm] md:p-[20mm] shadow-2xl relative overflow-hidden flex flex-col justify-between text-left font-serif leading-relaxed border border-slate-200"
            >
              
              {/* WATERMARK */}
              {showWatermark && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                  <div className="text-[100px] font-sans font-black text-slate-100/35 rotate-[-35deg] uppercase tracking-widest border-8 border-dashed border-slate-100/30 px-10 rounded-[50px]">
                    ATTENDANCE
                  </div>
                </div>
              )}

              {/* CORE CONTENT */}
              <div className="relative z-10 space-y-6">
                
                {/* LETTERHEAD */}
                {showLetterhead && (
                  <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
                    <Landmark className="w-12 h-12 text-slate-700 shrink-0 stroke-[1.25]" />
                    
                    <div className="text-center flex-1">
                      <p className="text-[10px] tracking-[0.15em] font-sans text-slate-500 uppercase leading-normal">Republic of the Philippines</p>
                      <p className="text-[10px] tracking-[0.12em] font-sans text-slate-500 uppercase leading-normal">Province of Cebu • Municipality of Tuburan</p>
                      <p className="text-[11px] tracking-[0.08em] font-sans font-bold text-slate-700 uppercase leading-normal">Barangay Alegria Portal</p>
                      
                      <h4 className="text-base font-bold font-sans tracking-wide text-emerald-800 uppercase mt-1 leading-none">
                        Alegria Farmers Association (AFA)
                      </h4>
                      <p className="text-[9px] font-sans text-slate-400 mt-1 italic">
                        Established 2024 • Registered NGO • Tuburan, Cebu, Philippines
                      </p>
                    </div>

                    <Sprout className="w-12 h-12 text-emerald-700 shrink-0 stroke-[1.25]" />
                  </div>
                )}

                {/* TITLE */}
                <div className="text-center space-y-1">
                  <h2 className="text-base font-bold uppercase tracking-wide text-slate-800 underline decoration-double underline-offset-4">
                    {documentType}
                  </h2>
                  <p className="text-[11px] text-slate-600 font-sans">
                    Official General Assembly Attendance Log Registry
                  </p>
                </div>

                {/* SPECS GRID */}
                <div className="border border-slate-400 font-sans text-[11px]">
                  <div className="grid grid-cols-2 border-b border-slate-300">
                    <div className="p-2 border-r border-slate-300 bg-slate-50/50">
                      <span className="text-slate-500 font-bold block uppercase text-[8px] tracking-wide">Meeting / Purpose:</span>
                      <span className="text-slate-900 font-bold text-xs">{meetingTitle || '_____________________________________________'}</span>
                    </div>
                    <div className="p-2 bg-slate-50/50">
                      <span className="text-slate-500 font-bold block uppercase text-[8px] tracking-wide">Date & Time:</span>
                      <span className="text-slate-900 font-bold text-xs">{meetingDate || '_____________________________________________'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2">
                    <div className="p-2 border-r border-slate-300">
                      <span className="text-slate-500 font-bold block uppercase text-[8px] tracking-wide">Venue:</span>
                      <span className="text-slate-800">{meetingVenue || '_____________________________________________'}</span>
                    </div>
                    <div className="p-2">
                      <span className="text-slate-500 font-bold block uppercase text-[8px] tracking-wide">Presiding Officer:</span>
                      <span className="text-slate-800">{presidingOfficer.replace(/\([^)]*\)/, '') || '_____________________________________________'}</span>
                    </div>
                  </div>
                </div>

                {/* SIGNATURE REGISTRY TABLE */}
                <div className="overflow-hidden border border-slate-400 rounded-sm">
                  <table className="w-full text-left border-collapse font-sans text-[10px] leading-relaxed">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-400 text-slate-700 font-extrabold uppercase">
                        <th className="px-2 py-1.5 border-r border-slate-400 w-8 text-center">No.</th>
                        <th className="px-3 py-1.5 border-r border-slate-400">Name of Farmer (Pangalan sa Mag-uuma)</th>
                        <th className="px-3 py-1.5 border-r border-slate-400 w-44">Sitio / Farm Location</th>
                        <th className="px-3 py-1.5 border-r border-slate-400 w-32">Contact No.</th>
                        <th className="px-3 py-1.5 w-32 text-center">Signature (Lagda / Pirma)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {sheetType === 'prepopulated' ? (
                        activeMembers.map((member, index) => (
                          <tr key={member.id} className="border-b border-slate-300">
                            <td className="px-2 py-2 border-r border-slate-300 text-center text-slate-600 font-bold font-mono">
                              {index + 1}
                            </td>
                            <td className="px-3 py-2 border-r border-slate-300 font-bold text-slate-800 uppercase">
                              {member.name}
                            </td>
                            <td className="px-3 py-2 border-r border-slate-300 text-slate-600">
                              {member.farmLocation}
                            </td>
                            <td className="px-3 py-2 border-r border-slate-300 font-mono text-slate-500">
                              {member.contactNumber}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {/* Blank line for signature */}
                              <div className="w-full border-b border-dashed border-slate-400 h-4 mt-1" />
                            </td>
                          </tr>
                        ))
                      ) : (
                        Array.from({ length: blankRowsCount }).map((_, index) => (
                          <tr key={index} className="border-b border-slate-300">
                            <td className="px-2 py-3.5 border-r border-slate-300 text-center text-slate-400 font-semibold font-mono">
                              {index + 1}
                            </td>
                            <td className="px-3 py-3.5 border-r border-slate-300">
                              <div className="w-full border-b border-dashed border-slate-200 h-4" />
                            </td>
                            <td className="px-3 py-3.5 border-r border-slate-300">
                              <div className="w-full border-b border-dashed border-slate-200 h-4" />
                            </td>
                            <td className="px-3 py-3.5 border-r border-slate-300">
                              <div className="w-full border-b border-dashed border-slate-200 h-4" />
                            </td>
                            <td className="px-3 py-3.5">
                              <div className="w-full border-b border-dashed border-slate-300 h-4" />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* CUSTOM REMARKS */}
                {customNotes && (
                  <div className="p-3 border border-slate-300 bg-slate-50 rounded text-[10px] font-sans">
                    <strong className="block text-slate-700 uppercase tracking-wide">Instructions / Special Remarks:</strong>
                    <p className="text-slate-600 whitespace-pre-line mt-1 italic font-medium">{customNotes}</p>
                  </div>
                )}

              </div>

              {/* CERTIFICATION FOOTER */}
              <div className="pt-8 border-t border-slate-300">
                <div className="grid grid-cols-2 gap-10 text-[10px] font-sans">
                  <div className="space-y-10">
                    <p className="text-slate-500">Prepared and Circulated by:</p>
                    <div>
                      <div className="w-full border-b border-slate-400 h-1" />
                      <p className="font-bold text-slate-800 uppercase mt-1">Jennylyn S Lumactao</p>
                      <p className="text-[9px] text-slate-500">Secretary, Alegria Farmers Association (AFA)</p>
                    </div>
                  </div>

                  <div className="space-y-10">
                    <p className="text-slate-500">Attested and Noted Correct by:</p>
                    <div>
                      <div className="w-full border-b border-slate-400 h-1" />
                      <p className="font-bold text-slate-800 uppercase mt-1">
                        {presidingOfficer.split('(')[0].trim() || 'Zenaida A. Elbiña'}
                      </p>
                      <p className="text-[9px] text-slate-500 font-sans">President, Alegria Farmers Association (AFA)</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 text-center text-[8px] text-slate-400 font-sans">
                  Alegria Farmers Association Registry Sheet • Formatted for Official Record Keeping
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

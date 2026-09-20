import React, { useState, useRef } from 'react';
import { Meeting } from '../types';
import { Printer, Download, Copy, X, Settings, Check, FileText, Sprout, Landmark } from 'lucide-react';

interface PrintMinutesModalProps {
  meeting: Meeting | null;
  onClose: () => void;
}

export default function PrintMinutesModal({ meeting, onClose }: PrintMinutesModalProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Customization Options
  const [documentType, setDocumentType] = useState('Minutes of the General Assembly');
  const [presidingOfficer, setPresidingOfficer] = useState('Zenaida A. Elbiña (President)');
  const [secretaryName, setSecretaryName] = useState('Jennylyn S Lumactao (Secretary)');
  const [timeCommenced, setTimeCommenced] = useState('09:00 AM');
  const [timeAdjourned, setTimeAdjourned] = useState('11:45 AM');
  const [showWatermark, setShowWatermark] = useState(true);
  const [showLetterhead, setShowLetterhead] = useState(true);
  const [customNotes, setCustomNotes] = useState('');

  if (!meeting) return null;

  // Split agenda and minutes into lines/paragraphs for cleaner formatting
  const agendaList = meeting.agenda
    ? meeting.agenda.split('\n').filter(line => line.trim().length > 0)
    : [];

  const minutesParagraphs = meeting.minutes
    ? meeting.minutes.split('\n\n').filter(p => p.trim().length > 0)
    : [meeting.minutes];

  // Helper to trigger standard printing
  const handlePrint = () => {
    // Briefly change tab title for print filename and restore it
    const originalTitle = document.title;
    const dateStr = meeting.date.replace(/-/g, '');
    document.title = `AFA_Meeting_Minutes_${dateStr}`;
    
    window.print();
    
    // Restore title
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  // Helper to copy clean text version to clipboard
  const handleCopyToClipboard = () => {
    const divider = '='.repeat(60);
    const textContent = `
REPUBLIC OF THE PHILIPPINES
PROVINCE OF CEBU
MUNICIPALITY OF TUBURAN
BARANGAY ALEGRIA

ALEGRIA FARMERS ASSOCIATION (AFA)
${divider}
${documentType.toUpperCase()}
${divider}

MEETING TITLE:  ${meeting.title}
DATE:           ${meeting.date}
VENUE:          ${meeting.location}
ATTENDANCE:     ${meeting.attendanceCount} members present

PRESIDING:      ${presidingOfficer}
RECORDED BY:    ${secretaryName}
TIME COMMENCED: ${timeCommenced}
TIME ADJOURNED: ${timeAdjourned}

I. MEETING AGENDA:
${agendaList.map((item, index) => `   ${index + 1}. ${item.replace(/^\d+[\.\-\s]*/, '')}`).join('\n') || '   No agenda specified.'}

II. SUMMARY OF DISCUSSION & MINUTES:
${minutesParagraphs.map(p => `   ${p}`).join('\n\n')}
${customNotes ? `\nADDITIONAL NOTES:\n   ${customNotes}` : ''}

III. ADJOURNMENT:
   The meeting was adjourned formally at ${timeAdjourned}.

${divider}
CERTIFICATION
${divider}

Prepared by:
   ${secretaryName.split('(')[0].trim()}
   Secretary, AFA

Attested by:
   ${presidingOfficer.split('(')[0].trim()}
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
    const textContent = `
REPUBLIC OF THE PHILIPPINES
PROVINCE OF CEBU
MUNICIPALITY OF TUBURAN
BARANGAY ALEGRIA

ALEGRIA FARMERS ASSOCIATION (AFA)
${divider}
${documentType.toUpperCase()}
${divider}

MEETING TITLE:  ${meeting.title}
DATE:           ${meeting.date}
VENUE:          ${meeting.location}
ATTENDANCE:     ${meeting.attendanceCount} members present

PRESIDING:      ${presidingOfficer}
RECORDED BY:    ${secretaryName}
TIME COMMENCED: ${timeCommenced}
TIME ADJOURNED: ${timeAdjourned}

I. MEETING AGENDA:
${agendaList.map((item, index) => `   ${index + 1}. ${item.replace(/^\d+[\.\-\s]*/, '')}`).join('\n') || '   No agenda specified.'}

II. SUMMARY OF DISCUSSION & MINUTES:
${minutesParagraphs.map(p => `   ${p}`).join('\n\n')}
${customNotes ? `\nADDITIONAL NOTES:\n   ${customNotes}` : ''}

III. ADJOURNMENT:
   The meeting was adjourned formally at ${timeAdjourned}.

${divider}
CERTIFICATION
${divider}

Prepared by:
   ${secretaryName.split('(')[0].trim()}
   Secretary, AFA

Attested by:
   ${presidingOfficer.split('(')[0].trim()}
   President, AFA
`;

    const element = document.createElement("a");
    const file = new Blob([textContent.trim()], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `AFA_Minutes_${meeting.date}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in no-print">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* MODAL ACTION BAR */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-600/10 p-1.5 rounded-lg border border-emerald-500/20 text-emerald-400">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Meeting Minutes Print Suite</h3>
              <p className="text-[10px] text-slate-400">Generate, customize, and print official documents.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="toggle-settings-btn"
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                showSettings 
                  ? 'bg-emerald-600 border-emerald-500 text-white' 
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{showSettings ? 'Hide Options' : 'Configure Document'}</span>
            </button>

            <button
              id="copy-text-btn"
              onClick={handleCopyToClipboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Plain' : 'Copy Text'}</span>
            </button>

            <button
              id="download-text-btn"
              onClick={handleDownloadTxt}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .txt</span>
            </button>

            <button
              id="trigger-print-btn"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            <div className="w-[1px] h-6 bg-slate-800 mx-1" />

            <button 
              id="close-print-modal"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all"
              aria-label="Close print preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WORKSPACE AREA: SIDEBAR SETTINGS + LIVE PREVIEW */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* SIDEBAR DYNAMIC CUSTOMIZATION SETTINGS */}
          {showSettings && (
            <div className="w-80 bg-slate-950 border-r border-slate-800 p-4 overflow-y-auto space-y-4 shrink-0 animate-fade-in text-left">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                Document Settings
              </h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Document Header Title</label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none"
                  >
                    <option value="Minutes of the General Assembly">General Assembly Minutes</option>
                    <option value="Minutes of the Board of Officers Meeting">Officers Board Minutes</option>
                    <option value="Minutes of the Special Assembly">Special Meeting Minutes</option>
                    <option value="Official Association Resolutions & Minutes">Joint Resolutions & Minutes</option>
                  </select>
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

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Prepared By (Secretariat)</label>
                  <input
                    type="text"
                    value={secretaryName}
                    onChange={(e) => setSecretaryName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Time Started</label>
                    <input
                      type="text"
                      value={timeCommenced}
                      onChange={(e) => setTimeCommenced(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none font-sans font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Time Ended</label>
                    <input
                      type="text"
                      value={timeAdjourned}
                      onChange={(e) => setTimeAdjourned(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none font-sans font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Additional Notes / Remarks</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Next GA scheduled on..."
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
                <strong>💡 Printing Tip:</strong> When the browser print window opens, check "Background Graphics" under "More Settings" to preserve the lines, seals, and watermark styling.
              </div>
            </div>
          )}

          {/* DOCUMENT PRINT CONTAINER (SCROLLABLE IN APP, EXACT SHEET ON PAPER) */}
          <div className="flex-1 bg-slate-950 p-6 md:p-10 overflow-y-auto flex justify-center">
            
            {/* PAPER SHEET: White Background, Dark Slate text representing physical paper sheet */}
            <div 
              id="print-area"
              className="print-area-root bg-white text-slate-900 w-[210mm] min-h-[297mm] p-[15mm] md:p-[20mm] shadow-2xl relative overflow-hidden flex flex-col justify-between text-left font-serif leading-relaxed border border-slate-200"
            >
              
              {/* SUBTLE BACKGROUND WATERMARK */}
              {showWatermark && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                  <div className="text-[120px] font-sans font-black text-slate-100/35 rotate-[-35deg] uppercase tracking-widest border-8 border-dashed border-slate-100/30 px-10 rounded-[50px]">
                    OFFICIAL
                  </div>
                </div>
              )}

              {/* CORE CONTENT */}
              <div className="relative z-10 space-y-6">
                
                {/* OFFICIAL GOVERNMENT LETTERHEAD */}
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
                        Established 2024 • Email: afa.alegria@gmail.com • Contact: +63 917 123 4567
                      </p>
                    </div>

                    <Sprout className="w-12 h-12 text-emerald-700 shrink-0 stroke-[1.25]" />
                  </div>
                )}

                {/* DOCUMENT MAIN METADATA & TITLE */}
                <div className="text-center space-y-2 pt-2">
                  <h2 className="text-lg font-bold uppercase tracking-wide text-slate-800 underline decoration-double underline-offset-4">
                    {documentType}
                  </h2>
                  <p className="text-xs text-slate-600 font-sans">
                    Date Compiled & Executed: <strong className="text-slate-900">{meeting.date}</strong>
                  </p>
                </div>

                {/* MEETING SPECS GRID (Bordered Table Style) */}
                <div className="border border-slate-400 font-sans text-xs">
                  <div className="grid grid-cols-2 border-b border-slate-300">
                    <div className="p-2 border-r border-slate-300 bg-slate-50/50">
                      <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-wide">Assembly Title:</span>
                      <span className="text-slate-900 font-semibold text-sm">{meeting.title}</span>
                    </div>
                    <div className="p-2 bg-slate-50/50">
                      <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-wide">Venue of Discussion:</span>
                      <span className="text-slate-900 font-semibold">{meeting.location}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 border-b border-slate-300">
                    <div className="p-2 border-r border-slate-300">
                      <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-wide">Presiding Officer:</span>
                      <span className="text-slate-800">{presidingOfficer.replace(/\([^)]*\)/, '')}</span>
                    </div>
                    <div className="p-2 border-r border-slate-300">
                      <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-wide">Recording Secretary:</span>
                      <span className="text-slate-800">{secretaryName.replace(/\([^)]*\)/, '')}</span>
                    </div>
                    <div className="p-2">
                      <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-wide">Attendance Registry:</span>
                      <span className="text-emerald-800 font-bold">{meeting.attendanceCount} Farmers present</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2">
                    <div className="p-2 border-r border-slate-300">
                      <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-wide">Time Commenced:</span>
                      <span className="text-slate-800">{timeCommenced}</span>
                    </div>
                    <div className="p-2">
                      <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-wide">Time Adjourned:</span>
                      <span className="text-slate-800">{timeAdjourned}</span>
                    </div>
                  </div>
                </div>

                {/* I. MEETING AGENDA */}
                <div className="space-y-2.5">
                  <h3 className="text-sm font-bold tracking-wide uppercase text-slate-800 font-sans border-b border-slate-300 pb-1 flex items-center gap-1.5">
                    <span className="bg-slate-800 text-white w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-mono shrink-0">I</span>
                    <span>Approved Meeting Agenda</span>
                  </h3>
                  
                  {agendaList.length > 0 ? (
                    <ul className="list-decimal list-inside pl-2 space-y-1 text-slate-800 text-xs md:text-sm">
                      {agendaList.map((item, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {/* Remove numbers in case they were typed in directly in the text */}
                          {item.replace(/^\d+[\.\-\s]*/, '')}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 italic pl-2">No structured agenda recorded.</p>
                  )}
                </div>

                {/* II. DISCUSSION DETAILS & PROCEEDINGS */}
                <div className="space-y-2.5">
                  <h3 className="text-sm font-bold tracking-wide uppercase text-slate-800 font-sans border-b border-slate-300 pb-1 flex items-center gap-1.5">
                    <span className="bg-slate-800 text-white w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-mono shrink-0">II</span>
                    <span>Minutes of Discussion & Agreements</span>
                  </h3>

                  <div className="pl-2 space-y-4 text-xs md:text-sm text-slate-850 text-justify">
                    {minutesParagraphs.map((paragraph, idx) => (
                      <p key={idx} className="indent-8 leading-relaxed">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>

                {/* OPTIONAL CUSTOM REMARKS / RESOLUTION TRANSCRIPTS */}
                {customNotes && (
                  <div className="space-y-2 bg-slate-50 border border-slate-300 p-3 rounded-lg">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide font-sans">
                      Secretariat Remarks & Notes:
                    </h4>
                    <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed italic">
                      {customNotes}
                    </p>
                  </div>
                )}

                {/* III. ADJOURNMENT BLOCK */}
                <div className="space-y-1 pl-2 text-xs text-slate-600">
                  <p>
                    <strong>III. Adjournment:</strong> There being no other businesses to transact, the meeting was adjourned formally by the Presiding Officer at <span className="font-semibold text-slate-800">{timeAdjourned}</span>.
                  </p>
                </div>

              </div>

              {/* OFF-SITE TRUST ASSURANCES / SIGNATURE CERTIFICATION */}
              <div className="pt-12 mt-8 border-t border-slate-300 relative z-10">
                <div className="grid grid-cols-2 gap-10 text-xs">
                  <div className="space-y-12">
                    <p className="text-slate-600">Prepared and Filed by:</p>
                    <div className="space-y-1">
                      <div className="w-full border-b border-slate-400 h-1" />
                      <p className="font-bold uppercase tracking-wide text-slate-800 font-sans">
                        {secretaryName.split('(')[0].trim()}
                      </p>
                      <p className="text-[10px] text-slate-500 font-sans">Secretary, Alegria Farmers Association</p>
                      <p className="text-[9px] text-slate-400 font-sans">Date Signed: ____________________</p>
                    </div>
                  </div>

                  <div className="space-y-12">
                    <p className="text-slate-600">Attested and Certified Correct by:</p>
                    <div className="space-y-1">
                      <div className="w-full border-b border-slate-400 h-1" />
                      <p className="font-bold uppercase tracking-wide text-slate-800 font-sans">
                        {presidingOfficer.split('(')[0].trim()}
                      </p>
                      <p className="text-[10px] text-slate-500 font-sans">President, Alegria Farmers Association</p>
                      <p className="text-[9px] text-slate-400 font-sans">Date Signed: ____________________</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 text-center text-[9px] text-slate-400 font-sans flex items-center justify-center gap-1">
                  <span>Alegria Farmers Association Ledger Registry • Official Record • Formatted on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

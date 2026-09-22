import React, { useState } from 'react';
import { Member, Resolution } from '../types';
import { 
  FileText, Printer, CheckCircle, Copy, Download, 
  Send, Sparkles, X, ChevronRight, Building, Award, ShieldCheck
} from 'lucide-react';

interface SecretaryTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  resolutions: Resolution[];
  onAddResolution?: (resolution: Omit<Resolution, 'id' | 'status'>) => void;
}

type TemplateType = 'loi' | 'resolution' | 'request';

export default function SecretaryTemplatesModal({
  isOpen,
  onClose,
  members,
  resolutions,
  onAddResolution
}: SecretaryTemplatesModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('loi');
  const [copied, setCopied] = useState(false);

  // Form states for Letter of Intent (LOI)
  const [loiTargetAgency, setLoiTargetAgency] = useState('Department of Agriculture - Region VII (DA-RFO 7)');
  const [loiOfficerName, setLoiOfficerName] = useState('Hon. Angel C. Enriquez, CESO III');
  const [loiOfficerPosition, setLoiOfficerPosition] = useState('Regional Executive Director');
  const [loiProjectTitle, setLoiProjectTitle] = useState('Establishment of Communal Corn Storage & Solar Dryer Facility');
  const [loiEstimatedCost, setLoiEstimatedCost] = useState('350,000');
  const [loiBeneficiariesCount, setLoiBeneficiariesCount] = useState(String(members.length || 42));

  // Form states for Board Resolution
  const [resNumber, setResNumber] = useState(`Res. No. 2026-00${resolutions.length + 1}`);
  const [resTitle, setResTitle] = useState('A RESOLUTION REQUESTING FINANCIAL AND LIVELIHOOD ASSISTANCE UNDER THE SUSTAINABLE LIVELIHOOD PROGRAM (SLP)');
  const [resWhereas1, setResWhereas1] = useState('WHEREAS, the Alegria Farmers Association (AFA) is a duly registered rural workers organization composed of smallholder farmers residing in Barangay Alegria, Tuburan, Cebu;');
  const [resWhereas2, setResWhereas2] = useState('WHEREAS, the association actively engages in agriculture, livestock rearing, and communal hog raising to uplift the socio-economic condition of its members;');
  const [resWhereas3, setResWhereas3] = useState('WHEREAS, there is an urgent need to augment the revolving working capital for organic feeds, livestock dispersal, and post-harvest facilities;');
  const [resResolved, setResResolved] = useState('NOW THEREFORE, on motion of Hon. Anselna B. Arnado, duly seconded by Hon. Maria Alcoser, BE IT RESOLVED, as it is hereby resolved, to formally submit this request and authorize the Association President to sign all necessary documents.');
  const [resMovedBy, setResMovedBy] = useState('Anselna B. Arnado');
  const [resSecondedBy, setResSecondedBy] = useState('Maria Alcoser');
  const [resVoteFavor, setResVoteFavor] = useState(String(members.length || 42));
  const [resVoteAgainst, setResVoteAgainst] = useState('0');
  const [resVoteAbstain, setResVoteAbstain] = useState('0');

  // Form states for Project / Letter Request
  const [reqRecipient, setReqRecipient] = useState('Hon. Aljun Diamante, Municipal Mayor');
  const [reqOffice, setReqOffice] = useState('Office of the Municipal Mayor & Municipal Agriculture Office (MAO)');
  const [reqAddress, setReqAddress] = useState('Municipality of Tuburan, Cebu Province');
  const [reqSubject, setReqSubject] = useState('Request for Allocation of 100 Bags Organic Fertilizer & High-Yield Hybrid Corn Seeds');
  const [reqItems, setReqItems] = useState('1. 100 Bags of Certified Organic Fertilizer (50kg/bag)\n2. 50 Bags of Hybrid Yellow Corn Seedlings (Pioneer/Dekalb)\n3. 1 Unit Communal Knapsack Sprayer with Solar Charging Battery\n4. Veterinary Dewormer and Multi-Vitamins for Hog Raising IGP');
  const [reqJustification, setReqJustification] = useState('Our 42 registered smallholder farmers across the 4 official sitios in Barangay Alegria (Sitio Tapon, Sitio Pundok 1, Sitio Pundok 2, Sitio Lamak) are preparing for the upcoming wet cropping season and need certified farm inputs to sustain food productivity.');

  if (!isOpen) return null;

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveResolutionToSystem = () => {
    if (onAddResolution) {
      onAddResolution({
        resolutionNumber: resNumber,
        title: resTitle,
        description: `${resWhereas1}\n\n${resWhereas2}\n\n${resWhereas3}\n\n${resResolved}`,
        dateAgreed: new Date().toISOString().split('T')[0],
        movedBy: resMovedBy,
        secondedBy: resSecondedBy,
        voteInFavor: parseInt(resVoteFavor) || 0,
        voteAgainst: parseInt(resVoteAgainst) || 0,
        voteAbstain: parseInt(resVoteAbstain) || 0
      });
      alert(`Resolution ${resNumber} has been recorded into the official AFA Legislative Archive!`);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let contentHtml = '';

    if (selectedTemplate === 'loi') {
      contentHtml = `
        <div class="header">
          <p style="margin:0; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#555;">Republic of the Philippines • Province of Cebu • Municipality of Tuburan</p>
          <h2 style="margin:4px 0; color:#1B4332; font-size:18px; font-weight:900;">ALEGRIA FARMERS ASSOCIATION (AFA)</h2>
          <p style="margin:0; font-size:11px; color:#666;">DOLE Registered Rural Workers Association • Barangay Alegria, Tuburan, Cebu 6043</p>
          <p style="margin:2px 0 0; font-size:11px; font-weight:bold; color:#1B4332;">OFFICE OF THE SECRETARY & BOARD OF DIRECTORS</p>
          <hr style="border:0; border-top:2px solid #1B4332; margin-top:12px;"/>
        </div>

        <div style="text-align:right; font-size:12px; margin-bottom:20px;">
          <strong>Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>

        <div style="font-size:12px; line-height:1.6; margin-bottom:24px;">
          <strong>${loiOfficerName}</strong><br/>
          ${loiOfficerPosition}<br/>
          ${loiTargetAgency}
        </div>

        <div style="font-size:13px; font-weight:bold; text-decoration:underline; margin-bottom:20px; color:#1B4332;">
          SUBJECT: LETTER OF INTENT FOR ${loiProjectTitle.toUpperCase()}
        </div>

        <div style="font-size:12px; line-height:1.8; text-align:justify; margin-bottom:20px;">
          <p>Dear ${loiOfficerName.split(' ')[0] || 'Sir/Madam'},</p>
          <p>Greetings of Peace and Solidarity in Agricultural Development!</p>
          <p>
            The <strong>Alegria Farmers Association (AFA)</strong>, a duly registered and active community-based rural farmers organization situated in Barangay Alegria, Tuburan, Cebu, respectfully submits this <strong>LETTER OF INTENT</strong> to formally apply for technical and livelihood program assistance under your esteemed agency for the implementation of:
          </p>
          <div style="background:#f4f6f4; border-left:4px solid #1B4332; padding:12px 16px; margin:16px 0; font-weight:bold; font-size:13px;">
            Project Title: ${loiProjectTitle}<br/>
            Target Beneficiaries: ${loiBeneficiariesCount} Registered Smallholder Farmers (4 Official Sitios of Brgy. Alegria: Tapon, Pundok 1, Pundok 2, Lamak)<br/>
            Estimated Project Cost: PHP ${Number(loiEstimatedCost.replace(/,/g, '')).toLocaleString('en-US')}.00
          </div>
          <p>
            Our association has maintained an exemplary track record in communal agriculture, having established functional group rotation systems for livestock rearing (Hog Raising IGP), corn production, and high-value coffee propagation. This program will significantly elevate rural productivity, bolster food self-sufficiency, and provide resilient household incomes for our agrarian families.
          </p>
          <p>
            Attached herewith are our Board Resolution, Association Profile, Certificate of Registration, and Roster of Beneficiary Members for your appraisal. We express our earnest commitment to comply with all documentary, counter-parting, and monitoring guidelines.
          </p>
          <p>Thank you very much for your steadfast support to our local farmers!</p>
        </div>

        <div style="margin-top:40px; font-size:12px;">
          <p style="margin-bottom:30px;">Respectfully submitted,</p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:40px;">
            <div>
              <div style="border-bottom:1px solid #000; width:220px; padding-bottom:4px; font-weight:bold;">JENNYLYN S. LUMACTAO</div>
              <div style="font-size:11px; color:#555;">Secretary, AFA</div>
            </div>
            <div>
              <div style="border-bottom:1px solid #000; width:220px; padding-bottom:4px; font-weight:bold;">ZENAIDA A. ELBIÑA</div>
              <div style="font-size:11px; color:#555;">President, AFA</div>
            </div>
          </div>
        </div>
      `;
    } else if (selectedTemplate === 'resolution') {
      contentHtml = `
        <div class="header">
          <p style="margin:0; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#555;">Republic of the Philippines • Province of Cebu • Municipality of Tuburan</p>
          <h2 style="margin:4px 0; color:#1B4332; font-size:18px; font-weight:900;">ALEGRIA FARMERS ASSOCIATION (AFA)</h2>
          <p style="margin:0; font-size:11px; color:#666;">DOLE Registered Rural Workers Association • Barangay Alegria, Tuburan, Cebu 6043</p>
          <hr style="border:0; border-top:2px solid #1B4332; margin-top:12px;"/>
        </div>

        <div style="text-align:center; margin:20px 0 10px;">
          <h3 style="margin:0; font-size:14px; color:#1B4332; text-decoration:underline; font-weight:900;">OFFICE OF THE BOARD OF DIRECTORS</h3>
          <p style="margin:4px 0 0; font-size:12px; font-weight:bold;">EXCERPT FROM THE MINUTES OF THE GENERAL ASSEMBLY MEETING HELD ON ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} AT ALEGRIA MULTI-PURPOSE CENTER</p>
        </div>

        <div style="text-align:center; font-size:14px; font-weight:900; color:#1B4332; margin:20px 0 10px; background:#f0f7f3; padding:8px; border:1px solid #1B4332;">
          ${resNumber.toUpperCase()}
        </div>

        <div style="text-align:center; font-size:13px; font-weight:900; line-height:1.4; margin-bottom:24px; text-transform:uppercase;">
          ${resTitle}
        </div>

        <div style="font-size:12px; line-height:1.8; text-align:justify; margin-bottom:20px;">
          <p>${resWhereas1}</p>
          <p>${resWhereas2}</p>
          <p>${resWhereas3}</p>
          <p style="margin-top:16px;"><strong>${resResolved}</strong></p>
        </div>

        <div style="background:#faf8f5; border:1px solid #e2dccf; padding:10px 15px; font-size:11px; margin:20px 0;">
          <strong>VOTING RECORD:</strong><br/>
          Moved by: <strong>${resMovedBy}</strong> | Seconded by: <strong>${resSecondedBy}</strong><br/>
          In Favor: <strong>${resVoteFavor}</strong> | Against: <strong>${resVoteAgainst}</strong> | Abstain: <strong>${resVoteAbstain}</strong><br/>
          Status: <strong>APPROVED AND ADOPTED UNANIMOUSLY</strong>
        </div>

        <div style="margin-top:35px; font-size:12px;">
          <p style="margin-bottom:25px;">I HEREBY CERTIFY to the correctness of the foregoing resolution:</p>
          <div style="border-bottom:1px solid #000; width:220px; padding-bottom:4px; font-weight:bold;">JENNYLYN S. LUMACTAO</div>
          <div style="font-size:11px; color:#555;">Secretary, AFA</div>

          <div style="margin-top:30px; display:grid; grid-template-columns:1fr 1fr; gap:40px;">
            <div>
              <p style="font-size:11px; margin-bottom:25px;">Attested & Approved by:</p>
              <div style="border-bottom:1px solid #000; width:220px; padding-bottom:4px; font-weight:bold;">ZENAIDA A. ELBIÑA</div>
              <div style="font-size:11px; color:#555;">President, AFA</div>
            </div>
            <div>
              <p style="font-size:11px; margin-bottom:25px;">Audited & Verified by:</p>
              <div style="border-bottom:1px solid #000; width:220px; padding-bottom:4px; font-weight:bold;">LORENA B. PINOTE</div>
              <div style="font-size:11px; color:#555;">Auditor, AFA</div>
            </div>
          </div>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="header">
          <p style="margin:0; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#555;">Republic of the Philippines • Province of Cebu • Municipality of Tuburan</p>
          <h2 style="margin:4px 0; color:#1B4332; font-size:18px; font-weight:900;">ALEGRIA FARMERS ASSOCIATION (AFA)</h2>
          <p style="margin:0; font-size:11px; color:#666;">DOLE Registered Rural Workers Association • Barangay Alegria, Tuburan, Cebu 6043</p>
          <hr style="border:0; border-top:2px solid #1B4332; margin-top:12px;"/>
        </div>

        <div style="text-align:right; font-size:12px; margin-bottom:20px;">
          <strong>Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>

        <div style="font-size:12px; line-height:1.6; margin-bottom:20px;">
          <strong>${reqRecipient}</strong><br/>
          ${reqOffice}<br/>
          ${reqAddress}
        </div>

        <div style="font-size:13px; font-weight:bold; text-decoration:underline; margin-bottom:18px; color:#1B4332;">
          SUBJECT: ${reqSubject.toUpperCase()}
        </div>

        <div style="font-size:12px; line-height:1.8; text-align:justify; margin-bottom:20px;">
          <p>Dear ${reqRecipient.split(',')[0] || 'Honorable Mayor'},</p>
          <p>Warm agricultural greetings from Alegria Farmers Association!</p>
          <p>${reqJustification}</p>
          <p>In this regard, we most respectfully request your benevolent assistance for the provision of the following essential agricultural inputs and equipment:</p>
          
          <div style="background:#faf8f5; border:1px solid #e2dccf; padding:12px 18px; margin:16px 0; font-size:12px; white-space:pre-line; font-family:inherit; line-height:1.7;">
            ${reqItems}
          </div>

          <p>
            These inputs will be placed under the stewardship of the AFA Executive Committee and distributed systematically according to the verified RSBSA farmer roster. We are deeply grateful for the unwavering support your administration extends to the farming sector of Tuburan.
          </p>
          <p>Thank you very much and more power to your leadership!</p>
        </div>

        <div style="margin-top:40px; font-size:12px;">
          <p style="margin-bottom:30px;">Very truly yours,</p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:40px;">
            <div>
              <div style="border-bottom:1px solid #000; width:220px; padding-bottom:4px; font-weight:bold;">JENNYLYN S. LUMACTAO</div>
              <div style="font-size:11px; color:#555;">Secretary, AFA</div>
            </div>
            <div>
              <div style="border-bottom:1px solid #000; width:220px; padding-bottom:4px; font-weight:bold;">ZENAIDA A. ELBIÑA</div>
              <div style="font-size:11px; color:#555;">President, AFA</div>
            </div>
          </div>
        </div>
      `;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>AFA Official Document - ${selectedTemplate.toUpperCase()}</title>
          <style>
            @page { size: portrait; margin: 20mm; }
            body { font-family: 'Times New Roman', Times, serif; color: #111; line-height: 1.5; padding: 15px; }
            .header { text-align: center; margin-bottom: 20px; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${contentHtml}
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
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border-2 border-[#1B4332] overflow-hidden text-slate-800">
        
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-6 bg-[#1B4332] text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-2xl">
              <FileText className="w-6 h-6 text-[#95D5B2]" />
            </div>
            <div>
              <h3 className="text-base sm:text-xl font-black font-display tracking-wide">
                Secretary Document & Letter Templates
              </h3>
              <p className="text-xs text-emerald-200">
                Official Letter of Intent, Board Resolution & Project Request Generator
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TEMPLATE NAVIGATION TABS */}
        <div className="p-3 bg-[#F0EBE1] border-b border-[#D5CFC1] flex gap-2 overflow-x-auto shrink-0">
          {[
            { id: 'loi', label: 'Letter of Intent (LOI)', desc: 'For DA / DOLE Assistance' },
            { id: 'resolution', label: 'Board Resolution Template', desc: 'Res. No. Generator' },
            { id: 'request', label: 'Project / Letter Request', desc: 'Inputs & Seeds Request' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t.id as TemplateType)}
              className={`px-4 py-2 rounded-2xl text-xs font-black transition-all cursor-pointer flex flex-col items-start ${
                selectedTemplate === t.id
                  ? 'bg-[#1B4332] text-white shadow-md'
                  : 'bg-white text-slate-700 hover:bg-white/80 border border-[#D5CFC1]'
              }`}
            >
              <span>{t.label}</span>
              <span className={`text-[10px] font-normal ${selectedTemplate === t.id ? 'text-emerald-200' : 'text-slate-500'}`}>{t.desc}</span>
            </button>
          ))}
        </div>

        {/* MODAL BODY */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          
          {/* TAB 1: LETTER OF INTENT */}
          {selectedTemplate === 'loi' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-900 leading-relaxed">
                <span className="font-bold block text-sm mb-1">Letter of Intent (LOI) Generator:</span>
                Kini nga opisyal nga sulat gigamit sa Secretary para sa pag-apply og tabang o livelihood programs ngadto sa mga ahensya sa gobyerno sama sa <strong>Department of Agriculture (DA)</strong>, <strong>DOLE</strong>, o <strong>DSWD-SLP</strong>.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Ahensya (Target Agency / Department):</label>
                  <input 
                    type="text" 
                    value={loiTargetAgency}
                    onChange={(e) => setLoiTargetAgency(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Pangalan sa Opisyal (Addressed Official):</label>
                  <input 
                    type="text" 
                    value={loiOfficerName}
                    onChange={(e) => setLoiOfficerName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Posisyon sa Opisyal (Designation / Position):</label>
                  <input 
                    type="text" 
                    value={loiOfficerPosition}
                    onChange={(e) => setLoiOfficerPosition(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Ulohan sa Proyekto (Project Proposal Title):</label>
                  <input 
                    type="text" 
                    value={loiProjectTitle}
                    onChange={(e) => setLoiProjectTitle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Gibanabanang Gasto (Estimated Cost PHP):</label>
                  <input 
                    type="text" 
                    value={loiEstimatedCost}
                    onChange={(e) => setLoiEstimatedCost(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Gidaghanon sa Beneficiaries (Farmers Count):</label>
                  <input 
                    type="text" 
                    value={loiBeneficiariesCount}
                    onChange={(e) => setLoiBeneficiariesCount(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BOARD RESOLUTION */}
          {selectedTemplate === 'resolution' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 leading-relaxed">
                <span className="font-bold block text-sm mb-1">Board Resolution Template & Numbering:</span>
                Kini nag-format sa pormal nga <strong>Resolution</strong> nga adunay operative clauses (Whereas & Resolved That), sponsors, ug botasyon.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Resolution Number:</label>
                  <input 
                    type="text" 
                    value={resNumber}
                    onChange={(e) => setResNumber(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 bg-slate-50 focus:bg-white font-mono"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Title of Resolution:</label>
                  <input 
                    type="text" 
                    value={resTitle}
                    onChange={(e) => setResTitle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Clause 1 (WHEREAS):</label>
                  <textarea 
                    rows={2} 
                    value={resWhereas1}
                    onChange={(e) => setResWhereas1(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-medium text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Clause 2 (WHEREAS):</label>
                  <textarea 
                    rows={2} 
                    value={resWhereas2}
                    onChange={(e) => setResWhereas2(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-medium text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Operative Resolution (NOW THEREFORE, BE IT RESOLVED):</label>
                  <textarea 
                    rows={3} 
                    value={resResolved}
                    onChange={(e) => setResResolved(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-medium text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Moved By:</label>
                  <input 
                    type="text" 
                    value={resMovedBy}
                    onChange={(e) => setResMovedBy(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded-xl font-bold text-slate-800"
                  />
                </div>
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Seconded By:</label>
                  <input 
                    type="text" 
                    value={resSecondedBy}
                    onChange={(e) => setResSecondedBy(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded-xl font-bold text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">In Favor:</label>
                  <input 
                    type="number" 
                    value={resVoteFavor}
                    onChange={(e) => setResVoteFavor(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded-xl font-bold text-emerald-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Against:</label>
                  <input 
                    type="number" 
                    value={resVoteAgainst}
                    onChange={(e) => setResVoteAgainst(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded-xl font-bold text-rose-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Abstain:</label>
                  <input 
                    type="number" 
                    value={resVoteAbstain}
                    onChange={(e) => setResVoteAbstain(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded-xl font-bold text-slate-600"
                  />
                </div>
              </div>

              {onAddResolution && (
                <button
                  onClick={handleSaveResolutionToSystem}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-black text-xs cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>I-save sa System Database (Archive Resolution)</span>
                </button>
              )}
            </div>
          )}

          {/* TAB 3: PROJECT / LETTER REQUEST */}
          {selectedTemplate === 'request' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 text-blue-900 leading-relaxed">
                <span className="font-bold block text-sm mb-1">Project / Farm Inputs Letter Request Template:</span>
                Gigamit para sa pagpangayo og abono, liso sa mais, bakuna sa baboy, o gamit sa umahan gikan sa <strong>Municipal Agriculture Office (MAO)</strong> o <strong>Mayor's Office</strong>.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Addressed To (Pangalan sa Mayor / Punong Lungsod):</label>
                  <input 
                    type="text" 
                    value={reqRecipient}
                    onChange={(e) => setReqRecipient(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Opisina / Departamento (Office):</label>
                  <input 
                    type="text" 
                    value={reqOffice}
                    onChange={(e) => setReqOffice(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Subject / Tumong sa Hangyo:</label>
                  <input 
                    type="text" 
                    value={reqSubject}
                    onChange={(e) => setReqSubject(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Mga Pangayoon nga Gamit / Items Requested:</label>
                  <textarea 
                    rows={4} 
                    value={reqItems}
                    onChange={(e) => setReqItems(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-mono text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="font-bold text-slate-700 uppercase text-[10px]">Rason / Justification:</label>
                  <textarea 
                    rows={2} 
                    value={reqJustification}
                    onChange={(e) => setReqJustification(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-medium text-slate-800 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 sm:p-5 bg-[#FAF8F5] border-t border-[#D5CFC1] flex flex-wrap justify-between items-center gap-3 shrink-0">
          <span className="text-xs text-slate-500 font-bold">
            Official Secretary Document Template System • AFA 2026
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              I-close
            </button>
            <button
              onClick={handlePrint}
              className="px-5 py-2 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-md cursor-pointer transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>I-print ang Pormal nga Dokumento</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

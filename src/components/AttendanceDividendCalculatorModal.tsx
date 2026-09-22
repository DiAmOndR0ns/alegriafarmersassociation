import React, { useState, useMemo } from 'react';
import { Member, Meeting, HogRaisingState, User } from '../types';
import { 
  DollarSign, Calculator, Printer, CheckCircle, AlertTriangle, 
  Users, Percent, Calendar, Sparkles, TrendingUp, X, Award, ShieldAlert
} from 'lucide-react';

interface AttendanceDividendCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  meetings: Meeting[];
  hogRaisingState: HogRaisingState;
  currentUser?: User;
}

export default function AttendanceDividendCalculatorModal({
  isOpen,
  onClose,
  members,
  meetings,
  hogRaisingState,
  currentUser
}: AttendanceDividendCalculatorModalProps) {
  const [selectedProduce, setSelectedProduce] = useState<string>('all');
  const [allowAbsenceThreshold, setAllowAbsenceThreshold] = useState<number>(1); // Minimum required attended meetings
  const [bonusOtherExpenseAllowance, setBonusOtherExpenseAllowance] = useState<number>(10000); // ₱10,000 association operational allowance

  // Filter financial data
  const expenses = useMemo(() => {
    if (selectedProduce === 'all') return hogRaisingState.expenses;
    return hogRaisingState.expenses.filter(e => (e.produce || 'Hog Raising') === selectedProduce);
  }, [hogRaisingState.expenses, selectedProduce]);

  const sales = useMemo(() => {
    if (selectedProduce === 'all') return hogRaisingState.sales;
    return hogRaisingState.sales.filter(s => (s.produce || 'Hog Raising') === selectedProduce);
  }, [hogRaisingState.sales, selectedProduce]);

  const totalRevenue = useMemo(() => sales.reduce((sum, s) => sum + s.revenue, 0), [sales]);
  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
  const netIncome = Math.max(0, totalRevenue - totalExpenses);

  // FORMULA ALLOCATIONS (From Interview Notes)
  // 50% Handlers / Raisers
  const handlersShare = netIncome * 0.50;
  
  // 30% FCCT / Cooperative General Membership Deposit (cut in December)
  const fcctGeneralMembershipPool = netIncome * 0.30;
  
  // 20% Association General Fund + ₱10,000 from 8% net income buffer
  const associationBaseShare = netIncome * 0.20;
  const associationTotalFund = associationBaseShare + (netIncome > 0 ? bonusOtherExpenseAllowance : 0);

  // 5% Dispersal & Livestock Insurance Pool
  const dispersalInsurancePool = netIncome * 0.05;

  // MEMBER ATTENDANCE MATRIX
  // Calculate attendance score per member based on meeting attendance records
  const memberAttendanceData = useMemo(() => {
    const totalMeetings = Math.max(1, meetings.length);

    return members.map((m) => {
      // Count how many meetings this member attended
      let attendedCount = 0;
      meetings.forEach((meet) => {
        if (meet.attendanceRecord && meet.attendanceRecord[m.id] === 'Present') {
          attendedCount += 1;
        } else if (meet.attendanceRecord && (meet.attendanceRecord[m.name] === 'Present' || meet.attendanceRecord[m.id] === 'Present')) {
          attendedCount += 1;
        } else if (!meet.attendanceRecord && m.status === 'Active') {
          // If no granular roll call record exists, default to proportional attendance based on active status
          attendedCount += 1;
        }
      });

      const isEligible = m.status === 'Active' && attendedCount >= allowAbsenceThreshold;

      return {
        member: m,
        attendedCount,
        totalMeetings,
        attendanceRate: totalMeetings > 0 ? (attendedCount / totalMeetings) * 100 : 0,
        isEligible
      };
    });
  }, [members, meetings, allowAbsenceThreshold]);

  // ATTENDANCE-WEIGHTED SHARE & FORFEITED SURPLUS REDISTRIBUTION
  const calculatedDividendRoster = useMemo(() => {
    const eligibleMembers = memberAttendanceData.filter(d => d.isEligible);
    const totalAttendedUnits = eligibleMembers.reduce((sum, d) => sum + d.attendedCount, 0);

    return memberAttendanceData.map(data => {
      if (!data.isEligible || totalAttendedUnits === 0) {
        return {
          ...data,
          baseShare: 0,
          attendanceWeight: 0,
          attendanceBonus: 0,
          finalDividend: 0,
          reason: data.member.status !== 'Active' ? 'Inactive Membership' : 'Excessive Absences / Ineligible'
        };
      }

      // Member's weighted proportion of total attended units
      const proportion = data.attendedCount / totalAttendedUnits;
      const finalDividend = fcctGeneralMembershipPool * proportion;

      // Calculate the bonus gain received from redistributed forfeited absences
      const equalShareBaseline = fcctGeneralMembershipPool / members.length;
      const bonusGain = Math.max(0, finalDividend - equalShareBaseline);

      return {
        ...data,
        baseShare: equalShareBaseline,
        attendanceWeight: proportion * 100,
        attendanceBonus: bonusGain,
        finalDividend,
        reason: 'Qualified (Active & Attending)'
      };
    });
  }, [memberAttendanceData, fcctGeneralMembershipPool, members.length]);

  if (!isOpen) return null;

  const handlePrintPayroll = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>AFA - Official Net Income & Attendance Dividend Distribution Sheet</title>
          <style>
            @page { size: landscape; margin: 15mm; }
            body { font-family: 'Inter', system-ui, sans-serif; color: #111; line-height: 1.4; padding: 10px; margin: 0; font-size: 11px; }
            .header { text-align: center; border-bottom: 2px solid #1B4332; padding-bottom: 12px; margin-bottom: 15px; }
            .header h2 { margin: 0; color: #1B4332; font-size: 16px; text-transform: uppercase; font-weight: 900; }
            .header p { margin: 3px 0 0; font-size: 10px; color: #555; }
            .summary-box { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; background: #FAF8F5; border: 1px solid #D5CFC1; padding: 10px; border-radius: 6px; margin-bottom: 15px; }
            .summary-item h5 { margin: 0; font-size: 8px; text-transform: uppercase; color: #666; }
            .summary-item p { margin: 3px 0 0; font-size: 13px; font-weight: 900; color: #1B4332; font-family: monospace; }
            .formula-note { background: #E8F5E9; border-left: 3px solid #2D6A4F; padding: 8px 12px; margin-bottom: 15px; font-size: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
            th, td { border: 1px solid #CCC; padding: 6px 8px; text-align: left; }
            th { background: #1B4332; color: #fff; font-size: 9px; text-transform: uppercase; }
            .text-right { text-align: right; }
            .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; margin-top: 35px; text-align: center; }
            .sign-line { border-top: 1px solid #333; margin-top: 35px; padding-top: 4px; font-weight: bold; font-size: 10px; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Alegria Farmers Association (AFA)</h2>
            <p>Tuburan, Cebu Province • DOLE Registered Rural Workers Association • RSBSA Accredited</p>
            <p style="font-weight:bold; color:#1B4332; margin-top:4px;">OFFICIAL DECEMBER PATRONAGE DIVIDEND PAYROLL (ATTENDANCE-WEIGHTED)</p>
          </div>

          <div class="summary-box">
            <div class="summary-item">
              <h5>Total Gross Sales</h5>
              <p>PHP ${totalRevenue.toLocaleString('en-US')}</p>
            </div>
            <div class="summary-item">
              <h5>Total Raising Expenses</h5>
              <p>PHP ${totalExpenses.toLocaleString('en-US')}</p>
            </div>
            <div class="summary-item">
              <h5>Net Income (Tibuok Tubo)</h5>
              <p>PHP ${netIncome.toLocaleString('en-US')}</p>
            </div>
            <div class="summary-item">
              <h5>30% FCCT Membership Pool</h5>
              <p>PHP ${fcctGeneralMembershipPool.toLocaleString('en-US')}</p>
            </div>
          </div>

          <div class="formula-note">
            <strong>BUDGET & CAPITAL ORIGIN (WHERE BUDGET WAS TAKEN FROM):</strong> Revolving Livelihood Capital funded by the <strong>DOLE Integrated Livelihood Program (DILP)</strong> & Municipal Agriculture Assistance. 
            <br/><br/>
            <strong>Official Distribution Formula:</strong> 50% Direct Handlers (₱${handlersShare.toLocaleString()}) | 30% FCCT Cooperative Member Pool (₱${fcctGeneralMembershipPool.toLocaleString()}) | 20% Association Fund (₱${associationTotalFund.toLocaleString()}) | 5% Dispersal & Insurance Pool (₱${dispersalInsurancePool.toLocaleString()}). Attendance-weighted distribution allocates higher dividend shares to active members who participate in regular meetings and assemblies.
          </div>

          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Member Name (Miyembro)</th>
                <th>Sitio Location</th>
                <th>RSBSA Status</th>
                <th>Attendance</th>
                <th>Status</th>
                <th class="text-right">Dividend Share (PHP)</th>
                <th>Signature / Acknowledgement</th>
              </tr>
            </thead>
            <tbody>
              ${calculatedDividendRoster.map((item, idx) => `
                <tr style="${!item.isEligible ? 'background:#FEE2E2;' : ''}">
                  <td>${idx + 1}</td>
                  <td><strong>${item.member.name}</strong></td>
                  <td>${item.member.farmLocation}</td>
                  <td>${item.member.isRsbsaRegistered ? (item.member.rsbsaNumber || 'RSBSA Registered') : 'Non-RSBSA'}</td>
                  <td>${item.attendedCount} / ${item.totalMeetings} (${item.attendanceRate.toFixed(0)}%)</td>
                  <td><strong>${item.reason}</strong></td>
                  <td class="text-right" style="font-weight:900; font-family:monospace; color:${item.isEligible ? '#1B4332' : '#991B1B'}">
                    PHP ${item.finalDividend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style="width:160px;"></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="signatures">
            <div>
              <div class="sign-line">GRACELYN P. ASENDIENTE<br/><span style="font-size:9px; font-weight:normal;">Treasurer, AFA</span></div>
            </div>
            <div>
              <div class="sign-line">LORENA B. PINOTE<br/><span style="font-size:9px; font-weight:normal;">Auditor, AFA</span></div>
            </div>
            <div>
              <div class="sign-line">ZENAIDA A. ELBIÑA<br/><span style="font-size:9px; font-weight:normal;">President, AFA</span></div>
            </div>
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
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border-2 border-[#1B4332] overflow-hidden text-slate-800">
        
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-6 bg-[#1B4332] text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-2xl">
              <Calculator className="w-6 h-6 text-[#95D5B2]" />
            </div>
            <div>
              <h3 className="text-base sm:text-xl font-black font-display tracking-wide flex items-center gap-2">
                <span>Net Income & Attendance-Weighted Dividend Engine</span>
                <span className="text-[10px] bg-emerald-400 text-slate-950 px-2 py-0.5 rounded-full font-black uppercase">
                  December Cut
                </span>
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dividend engine"
            className="p-2 rounded-full transition-colors cursor-pointer text-[#D8F3DC] hover:text-white bg-white/5 border border-[#52B788]/60 hover:bg-white/15"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          
          {/* TOP SUMMARY CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Gross Sales Revenue</span>
              <div className="text-base sm:text-lg font-black text-emerald-800 font-mono mt-0.5">
                ₱{totalRevenue.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">{sales.length} sales recorded</span>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Raising Cost</span>
              <div className="text-base sm:text-lg font-black text-rose-700 font-mono mt-0.5">
                ₱{totalExpenses.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Feeds, stock & vaccines</span>
            </div>

            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <span className="text-[10px] font-black text-emerald-900 uppercase block">Net Profit / Tubo</span>
              <div className="text-base sm:text-lg font-black text-emerald-700 font-mono mt-0.5">
                ₱{netIncome.toLocaleString()}
              </div>
              <span className="text-[10px] text-emerald-800 font-bold mt-0.5 block">Available for sharing</span>
            </div>

            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl">
              <span className="text-[10px] font-black text-blue-900 uppercase block">30% FCCT Member Pool</span>
              <div className="text-base sm:text-lg font-black text-blue-700 font-mono mt-0.5">
                ₱{fcctGeneralMembershipPool.toLocaleString()}
              </div>
              <span className="text-[10px] text-blue-800 font-bold mt-0.5 block">To divide by attendance</span>
            </div>
          </div>

          {/* 4-TIER FORMULA BREAKDOWN CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl border border-emerald-300 bg-emerald-50/70 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-emerald-900 uppercase">50% Handlers Share</span>
                <span className="text-[10px] font-mono font-black text-emerald-700">50%</span>
              </div>
              <div className="text-base font-black text-emerald-900 font-mono">
                ₱{handlersShare.toLocaleString()}
              </div>
              <p className="text-[10px] text-emerald-800 leading-tight">
                Direct labor, caretaking & feeding rotation honorarium.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl border border-blue-300 bg-blue-50/70 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-blue-900 uppercase">30% FCCT Coop Deposit</span>
                <span className="text-[10px] font-mono font-black text-blue-700">30%</span>
              </div>
              <div className="text-base font-black text-blue-900 font-mono">
                ₱{fcctGeneralMembershipPool.toLocaleString()}
              </div>
              <p className="text-[10px] text-blue-800 leading-tight">
                Deposited in FCCT Bank, distributed in December to active members.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl border border-amber-300 bg-amber-50/70 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-amber-900 uppercase">20% Association Fund</span>
                <span className="text-[10px] font-mono font-black text-amber-700">20% + ₱10k</span>
              </div>
              <div className="text-base font-black text-amber-900 font-mono">
                ₱{associationTotalFund.toLocaleString()}
              </div>
              <p className="text-[10px] text-amber-800 leading-tight">
                Association operations + ₱10k buffer for other expenses.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl border border-purple-300 bg-purple-50/70 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-purple-900 uppercase">5% Dispersal & Risk Pool</span>
                <span className="text-[10px] font-mono font-black text-purple-700">5%</span>
              </div>
              <div className="text-base font-black text-purple-900 font-mono">
                ₱{dispersalInsurancePool.toLocaleString()}
              </div>
              <p className="text-[10px] text-purple-800 leading-tight">
                Livestock mortality insurance & emergency calf/piglet replacement.
              </p>
            </div>
          </div>

          {/* ATTENDANCE RULE & CONTROLS BANNER */}
          <div className="p-4 bg-[#FAF8F5] border border-[#D5CFC1] rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="space-y-0.5">
                <h4 className="font-black text-[#1B4332] text-xs sm:text-sm uppercase flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>Attendance-Weighted Member Redistribution Rule</span>
                </h4>
                <p className="text-[11px] text-slate-600">
                  Ang mga miyembro nga <strong>absen sa mga tigum o wala makatambong</strong> dili makadawat sa ilang share. Ang ilang bahin <strong>i-apod-apod isip dugang bonus</strong> ngadto sa mga miyembro nga aktibong nitambong!
                </p>
              </div>

              {/* Attendance Threshold Control */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shrink-0">
                <span className="text-[10px] font-bold text-slate-600 uppercase">Min. Attendance Required:</span>
                <select
                  value={allowAbsenceThreshold}
                  onChange={(e) => setAllowAbsenceThreshold(Number(e.target.value))}
                  className="text-xs font-black text-[#1B4332] bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value={1}>At least 1 Meeting</option>
                  <option value={2}>At least 2 Meetings</option>
                  <option value={3}>At least 3 Meetings</option>
                </select>
              </div>
            </div>
          </div>

          {/* MEMBER DIVIDEND ROSTER TABLE */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h4 className="font-black text-slate-800 text-xs uppercase">
                Detailed Member Dividend Payroll Roster ({calculatedDividendRoster.length} Members)
              </h4>
              <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                {calculatedDividendRoster.filter(r => r.isEligible).length} Eligible • {calculatedDividendRoster.filter(r => !r.isEligible).length} Ineligible
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 font-black text-slate-600 text-[10px] uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-3">Miyembro (Farmer Name)</th>
                    <th className="p-3">Sitio Address</th>
                    <th className="p-3">RSBSA Status</th>
                    <th className="p-3">Attendance Record</th>
                    <th className="p-3">Qualification</th>
                    <th className="p-3 text-right">Dividend Share (PHP)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold">
                  {calculatedDividendRoster.map((item) => (
                    <tr key={item.member.id} className={`hover:bg-slate-50 ${!item.isEligible ? 'bg-rose-50/50' : ''}`}>
                      <td className="p-3 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{item.member.name}</span>
                          {item.attendanceBonus > 0 && (
                            <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md" title="Received bonus from absent members">
                              +Bonus
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">{item.member.farmLocation}</td>
                      <td className="p-3">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          item.member.isRsbsaRegistered ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {item.member.isRsbsaRegistered ? 'RSBSA Verified' : 'Unregistered'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="space-y-0.5">
                          <span className="font-mono text-slate-700">{item.attendedCount} / {item.totalMeetings} meetings</span>
                          <div className="w-20 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${item.attendanceRate >= 75 ? 'bg-emerald-500' : item.attendanceRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} 
                              style={{ width: `${item.attendanceRate}%` }} 
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.isEligible ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {item.reason}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-black text-sm">
                        <span className={item.isEligible ? 'text-emerald-700' : 'text-slate-400'}>
                          ₱{item.finalDividend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 sm:p-5 bg-[#FAF8F5] border-t border-[#D5CFC1] flex justify-between items-center shrink-0">
          <div className="text-xs text-slate-500 font-bold">
            Attendance-Weighted Dividend System • December Release
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              I-close
            </button>
            <button
              onClick={handlePrintPayroll}
              className="px-5 py-2 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-md cursor-pointer transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>I-print ang December Dividend Payroll</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

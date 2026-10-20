import React, { useEffect, useState } from 'react';
import { getSecureItem, setSecureItem } from '../utils/secureStorage';
import { Member, Meeting, Resolution, FinancialTransaction, SystemLog, OfficerRole, User } from '../types';
import {
  ShieldCheck, Users, Coins, BookOpen, FileCheck, Activity, Check, X,
  KeyRound, Trash2, Clock, Smartphone, AlertTriangle, Printer, Calendar,
  Sprout, MapPin, Search, Lock, Download, ShieldAlert, Shield
} from 'lucide-react';
import { buildAuditChain, verifyPassword } from '../utils/audit';
import { generateInitialPassword } from '../utils/passwordPolicy';
import PrintMinutesModal from './PrintMinutesModal';

interface ExecutiveViewProps {
  members: Member[];
  meetings: Meeting[];
  resolutions: Resolution[];
  onApproveResolution: (id: string) => void;
  transactions: FinancialTransaction[];
  logs: SystemLog[];
  currentRole: OfficerRole;
  currentUserId?: string;
  onUpdateLogs?: (newLogs: SystemLog[]) => void;
  users?: User[];
  onAddOfficer?: (officerData: { name: string; username: string; password: string; role: OfficerRole }) => boolean;
  onApproveUser?: (id: string) => void;
  onDeclineUser?: (id: string) => void;
  onDeleteUser?: (id: string) => void;
  onUpdateUserRole?: (id: string, newRole: OfficerRole | 'Member') => void;
  onResetPassword?: (id: string, newPass: string) => boolean | void;
  onPresidentTurnover?: (
    newPresidentId: string,
    electionDate: string,
    turnoverNotes: string,
    outgoingNewRole: 'Member' | 'Vice_President' | 'Secretary' | 'Assistant_Secretary' | 'Board_Member' | 'Treasurer' | 'Assistant_Treasurer' | 'Auditor' | 'PIO' | 'None'
  ) => void;
  onOpenReportModal?: () => void;
  onDownloadBackup?: () => void;
  // President approval workflow: Secretary Minutes of Meeting (Secretary drafts → President approves)
  onApproveMeetingMinutes?: (id: string, remarks?: string) => void;
  onReturnMeetingMinutes?: (id: string, remarks: string) => void;
  // President approval workflow: audited financial records (Auditor → President)
  onPresidentApproveTransaction?: (id: string, remarks?: string) => void;
  onPresidentReturnTransaction?: (id: string, remarks: string) => void;
}

export default function ExecutiveView({
  members,
  meetings,
  resolutions,
  onApproveResolution,
  transactions,
  logs,
  currentRole,
  currentUserId,
  onUpdateLogs,
  users = [],
  onAddOfficer,
  onApproveUser,
  onDeclineUser,
  onDeleteUser,
  onUpdateUserRole,
  onResetPassword,
  onPresidentTurnover,
  onOpenReportModal,
  onDownloadBackup,
  onApproveMeetingMinutes,
  onReturnMeetingMinutes,
  onPresidentApproveTransaction,
  onPresidentReturnTransaction
}: ExecutiveViewProps) {
  const [showMeetingsModal, setShowMeetingsModal] = useState<boolean>(false);
  const [selectedMeetingForPrint, setSelectedMeetingForPrint] = useState<Meeting | null>(null);

  // President approval workflow for Secretary Minutes of Meeting
  const [minutesApprovalTarget, setMinutesApprovalTarget] = useState<Meeting | null>(null);
  const [minutesApprovalRemarks, setMinutesApprovalRemarks] = useState<string>('');

  // President approval workflow for audited financial records (Auditor → President)
  const [financialApprovalTarget, setFinancialApprovalTarget] = useState<FinancialTransaction | null>(null);
  const [financialApprovalRemarks, setFinancialApprovalRemarks] = useState<string>('');
  const [showFinancialApprovalsModal, setShowFinancialApprovalsModal] = useState<boolean>(false);

  // Credentials edit state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  // Step-up re-authentication: the officer must confirm their own password before a privileged reset.
  const [stepUpUserId, setStepUpUserId] = useState<string | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState<string>('');
  const [stepUpError, setStepUpError] = useState<string>('');
  const [lastResetCredential, setLastResetCredential] = useState<{ userId: string; password: string } | null>(null);
  const [copiedResetPassword, setCopiedResetPassword] = useState<boolean>(false);

  // Officer Governance & Deletion modal state
  const [officerToDelete, setOfficerToDelete] = useState<User | null>(null);
  const [editingRoleOfficerId, setEditingRoleOfficerId] = useState<string | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<OfficerRole | 'Member'>('Secretary');

  // Add New Officer Form State (Admin / President)
  const [showAddOfficerForm, setShowAddOfficerForm] = useState<boolean>(false);
  const [newOfficerName, setNewOfficerName] = useState<string>('');
  const [newOfficerUsername, setNewOfficerUsername] = useState<string>('');
  const [newOfficerPassword, setNewOfficerPassword] = useState<string>('');
  const [newOfficerRole, setNewOfficerRole] = useState<OfficerRole>('Vice_President');

  // Member Portal -> Appoint as Officer state
  const [appointingMemberId, setAppointingMemberId] = useState<string | null>(null);
  const [appointRole, setAppointRole] = useState<OfficerRole>('Secretary');

  // Only the President (system admin) may appoint members into officer roles
  const canAppointOfficers = currentRole === 'President';

  // The President and Vice President may reset passwords (never the President's own).
  const canResetPasswords = currentRole === 'President' || currentRole === 'Vice_President';

  const handleAppointMember = (memberId: string) => {
    if (!canAppointOfficers) return;
    if (onUpdateUserRole) {
      onUpdateUserRole(memberId, appointRole);
    }
    setAppointingMemberId(null);
  };

  const handleCreateOfficerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddOfficer) return;
    const ok = onAddOfficer({
      name: newOfficerName,
      username: newOfficerUsername,
      password: newOfficerPassword,
      role: newOfficerRole
    });
    if (ok) {
      setNewOfficerName('');
      setNewOfficerUsername('');
      setNewOfficerPassword('');
      setNewOfficerRole('Vice_President');
      setShowAddOfficerForm(false);
    }
  };

  // Search query for logs/roster
  const [logSearch, setLogSearch] = useState<string>('');

  // Presidential Turnover Form State
  const [turnoverNewPresId, setTurnoverNewPresId] = useState<string>('');
  const [turnoverDate, setTurnoverDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [turnoverOutgoingRole, setTurnoverOutgoingRole] = useState<'Member' | 'Vice_President' | 'Secretary' | 'Assistant_Secretary' | 'Board_Member' | 'Treasurer' | 'Assistant_Treasurer' | 'Auditor' | 'PIO' | 'None'>('Member');
  const [turnoverNotes, setTurnoverNotes] = useState<string>(
    '1. Formal turnover of the AFA general registry and resolutions book.\n2. Turned over bank accounts and the PHP balance.\n3. Turned over community keys and the hog-raising IGP ledger.'
  );
  const [showTurnoverConfirm, setShowTurnoverConfirm] = useState<boolean>(false);
  const [turnoverConfirmationWord, setTurnoverConfirmationWord] = useState<string>('');
  const [turnoverError, setTurnoverError] = useState<string>('');

  const selectedNewPresName = users.find(u => u.id === turnoverNewPresId)?.name || '';

  const handleVerifyTurnover = () => {
    if (!turnoverNewPresId) {
      setTurnoverError('Palihug pagpili og bag-ong Presidente nga maoy modawat sa turnover (Please select a new President to receive the turnover).');
      return;
    }
    setTurnoverError('');
    setTurnoverConfirmationWord('');
    setShowTurnoverConfirm(true);
  };

  const handleExecuteTurnover = () => {
    if (turnoverConfirmationWord.toUpperCase() !== 'TURNOVER') return;
    if (onPresidentTurnover) {
      onPresidentTurnover(turnoverNewPresId, turnoverDate, turnoverNotes, turnoverOutgoingRole);
    }
    setShowTurnoverConfirm(false);
    setTurnoverNewPresId('');
  };

  // Meetings whose Secretary minutes are awaiting President approval.
  const pendingMinutesMeetings = meetings.filter(m => m.minutesApprovalStatus === 'Pending Approval');

  // Audited financial records awaiting the President's final approval (Auditor → President).
  const auditedPendingTx = transactions.filter(
    t => t.auditedStatus === 'Audited' && t.presidentApprovalStatus !== 'Approved' && t.presidentApprovalStatus !== 'Returned'
  );

  // Calculate cooperative financial balance
  let currentBalance = 0;
  transactions.forEach(t => {
    if (t.type === 'income') currentBalance += t.amount;
    else currentBalance -= t.amount;
  });

  const totalMembers = members.length;
  const activeMembers = members.filter(m => m.status === 'Active').length;
  const pendingResolutions = resolutions.filter(r => r.status === 'Pending Approval');

  // Digital Trail (Audit Logs) Year Ending and Filtering
  const [selectedLogYear, setSelectedLogYear] = useState<string>('All');
  const [closedLogYears, setClosedLogYears] = useState<number[]>([2024]);
  useEffect(() => {
    let active = true;
    void getSecureItem<number[]>('bafa_closed_log_years').then((saved) => {
      if (active && Array.isArray(saved)) setClosedLogYears(saved);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const [showSealConfirm, setShowSealConfirm] = useState<boolean>(false);
  const [sealYearInput, setSealYearInput] = useState<string>('');

  // Available years dynamically computed
  const availableYears = Array.from(
    new Set([
      2024, 2025, 2026,
      ...logs.map(log => new Date(log.timestamp).getFullYear())
    ])
  ).sort((a, b) => b - a);

  // Filter logs based on year and simple search
  const filteredLogs = logs.filter(log => {
    if (selectedLogYear !== 'All') {
      const logYear = new Date(log.timestamp).getFullYear().toString();
      if (logYear !== selectedLogYear) return false;
    }
    const searchLower = logSearch.toLowerCase();
    return (
      log.user.toLowerCase().includes(searchLower) ||
      log.action.toLowerCase().includes(searchLower) ||
      log.details.toLowerCase().includes(searchLower) ||
      log.role.toLowerCase().includes(searchLower)
    );
  });

  const handleSealLogYear = (yearToSeal: number) => {
    if (closedLogYears.includes(yearToSeal)) return;

    const updatedClosed = [...closedLogYears, yearToSeal];
    setClosedLogYears(updatedClosed);
    void setSecureItem('bafa_closed_log_years', updatedClosed).catch(() => undefined);

    const newLog: SystemLog = {
      id: `log-seal-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: currentRole === 'President' ? 'Zenaida A. Elbiña' : 'AFA Executive Officer',
      role: currentRole,
      action: 'Sealed Digital Trail',
      details: `OFFICIAL YEAR-END SEALING: Ang general digital system audit trail alang sa tuig ${yearToSeal} opisyal nga gisirado ug gi-seal ni Presidente Zenaida A. Elbiña. Wala nay retroactive nga pagbag-o nga gitugot alang niini nga tuig. (Officially sealed and cryptographically locked the digital trail for the year ${yearToSeal}. No retroactive modifications permitted.)`,
      syncStatus: 'synced',
      hash: '',
      previousHash: ''
    };

    if (onUpdateLogs) {
      const updatedLogs = buildAuditChain([newLog, ...logs]);
      onUpdateLogs(updatedLogs);
    }
  };

  const handleResetPasswordSubmit = (e: React.FormEvent, userId: string) => {
    e.preventDefault();
    if (!newPassword.trim()) return;
    // Do not reset yet: require the officer to re-enter their own password first.
    setStepUpUserId(userId);
    setStepUpPassword('');
    setStepUpError('');
  };

  const handleStepUpConfirm = async (e: React.FormEvent, userId: string) => {
    e.preventDefault();
    if (!stepUpPassword.trim()) {
      setStepUpError('Please enter your password to confirm.');
      return;
    }
    const officer = users.find((candidate) => candidate.id === currentUserId);
    const officerPasswordIsValid = officer
      ? await verifyPassword(stepUpPassword, officer.passwordHash, officer.password)
      : false;
    if (!officerPasswordIsValid) {
      setStepUpError('Incorrect password. The reset was not performed.');
      return;
    }
    const trimmedNewPassword = newPassword.trim();
    if (onResetPassword) {
      const didSucceed = onResetPassword(userId, trimmedNewPassword);
      if (didSucceed === false) {
        setStepUpUserId(null);
        setStepUpPassword('');
        setStepUpError('');
        return;
      }
    }
    setLastResetCredential({ userId, password: trimmedNewPassword });
    setCopiedResetPassword(false);
    setStepUpUserId(null);
    setStepUpPassword('');
    setStepUpError('');
    setEditingUserId(null);
    setNewPassword('');
  };

  return (
    <div id="executive-view-container" className="flex flex-col space-y-5 text-[#2D3A22]">

      {/* EXECUTIVE HEADER */}
      <div className="bg-[#1B4332] text-[#F4EFE6] p-4 sm:p-5 rounded-3xl border border-[#143326] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-md w-full max-w-full overflow-hidden">
        <div className="text-left min-w-0 w-full sm:w-auto">
          <h2 className="text-lg sm:text-2xl font-black font-display text-white flex flex-wrap items-center gap-2 leading-tight">
            <ShieldCheck className="w-6 h-6 text-[#D8F3DC] shrink-0" />
            <span className="break-words">
              {currentRole === 'President'
                ? 'President\'s Suite'
                : 'Vice President\'s Desk'}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-[#B7E4C7] mt-1 font-medium max-w-xl break-words">
            Review farmer registrations, manage credentials, and approve association resolutions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto min-w-0">
          {onOpenReportModal && (
            <button
              id="executive-report-btn"
              type="button"
              onClick={onOpenReportModal}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-black bg-[#2D6A4F] hover:bg-[#40916C] text-white border border-[#52B788] rounded-2xl shadow-sm transition-all cursor-pointer uppercase tracking-wider min-w-0"
            >
              <Printer className="w-4 h-4 text-[#D8F3DC] shrink-0" />
              <span className="truncate">Export Executive Report</span>
            </button>
          )}

          <div className="w-full sm:w-auto bg-[#081C15] border-2 border-[#52B788] px-3.5 py-2 rounded-2xl text-xs text-white font-bold shadow-md uppercase tracking-wider min-w-0 flex flex-wrap items-center gap-2">
            <span className="bg-[#D8F3DC] text-[#1B4332] text-[10px] font-mono px-2 py-0.5 rounded-md shrink-0 font-black">
              ACTIVE OFFICER
            </span>
            <span className="font-black text-xs sm:text-sm text-white break-words">
              {currentRole === 'President' ? 'President (Zenaida)' : 'Vice President'}
            </span>
          </div>
        </div>
      </div>

      {/* OVERVIEW SCOREBOARD */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Members */}
        <div className="bg-white border border-[#E9E4D9] p-5 rounded-2xl shadow-sm text-left">
          <div className="flex justify-between items-center text-[#5D6B54] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Members</span>
            <Users className="w-5 h-5 text-[#1B4332]" />
          </div>
          <div className="text-3xl font-black font-display text-[#1B4332]">{totalMembers}</div>
          <div className="text-[10px] sm:text-xs text-[#5D6B54] mt-1">
            <span className="text-[#2E7D32] font-bold">{activeMembers} Active</span> • {totalMembers - activeMembers} Inactive
          </div>
        </div>

        {/* Association Funds */}
        <div className="bg-white border border-[#E9E4D9] p-5 rounded-2xl shadow-sm text-left">
          <div className="flex justify-between items-center text-[#5D6B54] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Co-op Funds Balance</span>
            <Coins className="w-5 h-5 text-[#E65100]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-display text-[#1B4332] tracking-tight">
            PHP {currentBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] sm:text-xs text-[#5D6B54] mt-1">
            From Member Dues & Allocations
          </div>
        </div>

        {/* Assemblies */}
        <div
          onClick={() => setShowMeetingsModal(true)}
          className="bg-white border border-[#E9E4D9] p-5 rounded-2xl shadow-sm text-left cursor-pointer hover:border-[#1B4332] hover:bg-[#FAF9F5] transition-all group select-none"
        >
          <div className="flex justify-between items-center text-[#5D6B54] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider group-hover:text-[#1B4332]">General Assembly</span>
            <BookOpen className="w-5 h-5 text-[#0D47A1] group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-3xl font-black font-display text-[#1B4332] flex items-baseline gap-2">
            <span>{meetings.length}</span>
            <span className="text-[10px] font-bold text-[#0D47A1] hover:underline">View / Print</span>
          </div>
          <div className="text-[10px] sm:text-xs text-[#5D6B54] mt-1">
            Legislative & General Minutes
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="bg-white border border-[#E9E4D9] p-5 rounded-2xl shadow-sm text-left">
          <div className="flex justify-between items-center text-[#5D6B54] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Aprobahan (Resolutions)</span>
            <FileCheck className="w-5 h-5 text-[#E65100]" />
          </div>
          <div className="text-3xl font-black font-display text-[#E65100]">{pendingResolutions.length}</div>
          <div className="text-[10px] sm:text-xs text-[#5D6B54] mt-1">
            Drafts nagpaabot sa imong Pirma
          </div>
        </div>

        {/* Minutes of Meeting Awaiting President Approval (Secretary drafts → President approves) */}
        <div
          onClick={() => setShowMeetingsModal(true)}
          className="bg-white border border-[#E9E4D9] p-5 rounded-2xl shadow-sm text-left cursor-pointer hover:border-[#1B4332] hover:bg-[#FAF9F5] transition-all group select-none"
        >
          <div className="flex justify-between items-center text-[#5D6B54] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider group-hover:text-[#1B4332]">Minutes for Approval</span>
            <BookOpen className="w-5 h-5 text-purple-700 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-3xl font-black font-display text-purple-700">{pendingMinutesMeetings.length}</div>
          <div className="text-[10px] sm:text-xs text-[#5D6B54] mt-1">
            Secretary minutes awaiting your signature
          </div>
        </div>

        {/* Audited Financial Records Awaiting President Approval (Auditor → President) */}
        <div
          onClick={() => setShowFinancialApprovalsModal(true)}
          className="bg-white border border-[#E9E4D9] p-5 rounded-2xl shadow-sm text-left cursor-pointer hover:border-emerald-700 hover:bg-[#FAF9F5] transition-all group select-none"
        >
          <div className="flex justify-between items-center text-[#5D6B54] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider group-hover:text-emerald-700">Financial Approvals</span>
            <Coins className="w-5 h-5 text-emerald-700 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-3xl font-black font-display text-emerald-700">{auditedPendingTx.length}</div>
          <div className="text-[10px] sm:text-xs text-[#5D6B54] mt-1">
            Audited records awaiting final approval
          </div>
        </div>
      </div>

      {/* SECTION: CREDENTIALS DESK & NEW REGISTRATIONS (UCSD Core focus) */}
      <div className="order-2 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">

        {/* LEFT CARD: PENDING SIGNUPS & ROSTER REVIEW (7 columns) */}
        <div className="order-2 lg:col-span-12 self-start bg-white border border-[#E9E4D9] rounded-3xl p-4.5 shadow-sm space-y-2.5">
          <div className="border-b border-[#F0EBE1] pb-2.5 text-left">
            <h3 className="text-base font-extrabold font-display text-[#1B4332] flex items-center gap-2">
              <Users className="w-5.5 h-5.5 text-[#1B4332]" />
              <span>New Registration Desk</span>
            </h3>
          </div>

          {/* Pending Requests List */}
          <div className="space-y-2">
            <h4 className="text-xs font-extrabold text-[#4F5E46] uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-4 h-4 text-[#E65100]" />
              <span>Pending Registration ({users.filter(u => !u.isApproved).length})</span>
            </h4>

            {users.filter(u => !u.isApproved).length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {users.filter(u => !u.isApproved).map((user) => (
                  <div key={user.id} className="bg-[#FAF8F5] border border-[#E9E4D9] p-3 rounded-2xl text-left space-y-2 hover:border-[#85947E] transition-all">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-[#1B4332] text-sm">{user.name}</span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                            user.role === 'Member'
                              ? 'bg-[#EAF4EC] text-[#1B4332] border-[#2D6A4F]/25'
                              : 'bg-[#E3F2FD] text-[#0D47A1] border-[#0D47A1]/25'
                          }`}>
                            Gitinguha: {user.role.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-[#5D6B54] mt-0.5 font-medium">
                          Username: <strong className="text-[#1B4332]">{user.username}</strong> • Contact: <strong>{user.contactNumber || 'N/A'}</strong>
                        </p>
                      </div>

                      <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                        <button
                          onClick={() => onApproveUser && onApproveUser(user.id)}
                          className="flex-1 sm:flex-initial px-4 py-2 bg-[#1B4332] hover:bg-[#143326] text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Aprobahan</span>
                        </button>
                        <button
                          onClick={() => onDeclineUser && onDeclineUser(user.id)}
                          className="flex-1 sm:flex-initial px-4 py-2 bg-white border border-[#D5CFC1] hover:bg-[#FAF8F5] text-[#D32F2F] text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>I-decline</span>
                        </button>
                      </div>
                    </div>

                    {user.role === 'Member' && (
                      <div className="bg-white p-3 rounded-xl border border-[#E9E4D9] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[#85947E] block text-[9px] uppercase font-bold tracking-wider">Sitio / Dapit</span>
                          <span className="text-[#1B4332] font-bold">{user.farmLocation}</span>
                        </div>
                        <div>
                          <span className="text-[#85947E] block text-[9px] uppercase font-bold tracking-wider">Gipananom / Buhi</span>
                          <span className="text-[#2D6A4F] font-bold truncate block" title={user.primaryCrops?.join(', ')}>
                            {user.primaryCrops?.join(', ') || 'General Agriculture'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#FAF8F5]/50 border border-dashed border-[#D5CFC1] px-4 py-3 rounded-xl text-center text-[#85947E] text-xs leading-tight">
                Walay nagpaabot nga rehistrasyon sa pagkakaron. Limpyo ang approval queue!
              </div>
            )}
          </div>
        </div>

        {/* OFFICER ROSTER & ROLE GOVERNANCE DESK */}
        <div id="officer-governance-card" className="order-1 lg:col-span-12 self-start bg-white border border-[#E9E4D9] rounded-3xl p-5 shadow-sm space-y-4 text-left">
          <div className="border-b border-[#F0EBE1] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold font-display text-[#1B4332] flex items-center gap-2">
                <ShieldAlert className="w-5.5 h-5.5 text-[#1B4332]" />
                <span>Officer Governance & Role Management (Add, Reassign, or Delete Officers)</span>
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
              {canAppointOfficers && onAddOfficer && (
                <button
                  type="button"
                  onClick={() => {
                    const nextOpen = !showAddOfficerForm;
                    setShowAddOfficerForm(nextOpen);
                    if (nextOpen && !newOfficerPassword) {
                      setNewOfficerPassword(generateInitialPassword(newOfficerUsername || 'officer', newOfficerRole));
                    }
                  }}
                  className="px-3.5 py-1.5 bg-[#1B4332] hover:bg-[#2D6A4F] text-white rounded-full text-xs font-extrabold transition-all cursor-pointer shadow-xs"
                >
                  {showAddOfficerForm ? 'Cancel' : '+ Add Officer Account'}
                </button>
              )}
              <div className="inline-flex items-center gap-1.5 bg-[#EAF4EC] border border-[#2D6A4F]/30 text-[#1B4332] px-3 py-1 rounded-full text-xs font-bold shrink-0">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Auto-Sync Active</span>
              </div>
            </div>
          </div>

          {canAppointOfficers && showAddOfficerForm && (
            <form onSubmit={handleCreateOfficerSubmit} className="bg-[#FAF8F5] border-2 border-[#1B4332]/20 rounded-2xl p-4 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-[#1B4332] uppercase tracking-wider">
                  Create New Officer Account
                </h4>
                <button
                  type="button"
                  onClick={() => setNewOfficerPassword(generateInitialPassword(newOfficerUsername || 'officer', newOfficerRole))}
                  className="text-[11px] font-bold text-[#2D6A4F] hover:underline cursor-pointer"
                >
                  Generate Strong Password
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-extrabold text-[#4F5E46] uppercase mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jennylyn S. Lumactao"
                    value={newOfficerName}
                    onChange={(e) => setNewOfficerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#D5CFC1] rounded-xl font-bold text-[#1B4332] focus:outline-none focus:border-[#1B4332]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-[#4F5E46] uppercase mb-1">Governance Role</label>
                  <select
                    value={newOfficerRole}
                    onChange={(e) => setNewOfficerRole(e.target.value as OfficerRole)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#D5CFC1] rounded-xl font-bold text-[#1B4332] focus:outline-none focus:border-[#1B4332]"
                  >
                    <option value="Vice_President">Vice President</option>
                    <option value="Secretary">Secretary</option>
                    <option value="Assistant_Secretary">Assistant Secretary</option>
                    <option value="Board_Member">Board Member</option>
                    <option value="Treasurer">Treasurer</option>
                    <option value="Assistant_Treasurer">Assistant Treasurer</option>
                    <option value="Auditor">Auditor</option>
                    <option value="PIO">PIO</option>
                    <option value="President">President</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-[#4F5E46] uppercase mb-1">Username</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. secretary"
                    value={newOfficerUsername}
                    onChange={(e) => setNewOfficerUsername(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#D5CFC1] rounded-xl font-mono font-bold text-[#1B4332] focus:outline-none focus:border-[#1B4332]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-[#4F5E46] uppercase mb-1">Initial Password</label>
                  <input
                    type="text"
                    required
                    placeholder="12+ chars, upper/lower/num/symbol"
                    value={newOfficerPassword}
                    onChange={(e) => setNewOfficerPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#D5CFC1] rounded-xl font-mono font-bold text-[#1B4332] focus:outline-none focus:border-[#1B4332]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddOfficerForm(false)}
                  className="px-4 py-1.5 bg-white border border-[#D5CFC1] text-[#5D6B54] text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-xs font-extrabold rounded-xl cursor-pointer shadow-xs"
                >
                  Save & Provision Officer
                </button>
              </div>
            </form>
          )}

          {/* Officers Roster List */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold text-[#4F5E46] uppercase tracking-wider">
              Association Officers ({users.filter(u => ['President', 'Vice_President', 'Secretary', 'Assistant_Secretary', 'Board_Member', 'Treasurer', 'Assistant_Treasurer', 'Auditor', 'PIO'].includes(u.role)).length})
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {users.filter(u => ['President', 'Vice_President', 'Secretary', 'Assistant_Secretary', 'Board_Member', 'Treasurer', 'Assistant_Treasurer', 'Auditor', 'PIO'].includes(u.role)).map((officer) => {
                const isEditingRole = editingRoleOfficerId === officer.id;
                const isEditingPass = editingUserId === officer.id;
                // Whether THIS officer row is the President (protected account)
                const isTargetPresident = officer.role === 'President';

                // Authority rules:
                //  - The President and Vice President may reset another officer's password.
                //  - Nobody may reset the President's own password from this desk.
                //  - Only the President may reassign roles or delete officers.
                const canResetThisOfficer = canResetPasswords && !isTargetPresident;
                const canManageThisOfficer = canAppointOfficers && !isTargetPresident;

                return (
                  <div
                    key={officer.id}
                    className="p-4 rounded-2xl border border-[#E9E4D9] bg-[#FAF8F5] text-left transition-all space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="inline-block text-[10px] font-extrabold font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#1B4332] text-white">
                            {officer.role.replace('_', ' ')}
                          </span>
                          <h4 className="font-extrabold text-sm text-[#1B4332] mt-1.5">{officer.name}</h4>
                          <p className="text-[11px] text-[#5D6B54] font-mono">@{officer.username}</p>
                        </div>
                        {isTargetPresident && (
                          <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold">
                            Chief Executive
                          </span>
                        )}
                      </div>

                      {/* Inline Role Changer */}
                      {isEditingRole && canManageThisOfficer && (
                        <div className="bg-white p-2.5 rounded-xl border border-[#D5CFC1] space-y-2 animate-fade-in">
                          <label className="block text-[10px] font-bold text-[#4F5E46] uppercase">Select New Governance Role:</label>
                          <select
                            value={selectedNewRole}
                            onChange={(e) => setSelectedNewRole(e.target.value as any)}
                            className="w-full text-xs font-bold p-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800"
                          >
                            <option value="Vice_President">Vice President</option>
                            <option value="Secretary">Secretary</option>
                            <option value="Assistant_Secretary">Assistant Secretary</option>
                            <option value="Board_Member">Board Member</option>
                            <option value="Treasurer">Treasurer</option>
                            <option value="Assistant_Treasurer">Assistant Treasurer</option>
                            <option value="Auditor">Auditor</option>
                            <option value="PIO">PIO</option>
                            <option value="Member">Demote to Member</option>
                          </select>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingRoleOfficerId(null)}
                              className="flex-1 py-1 text-[10px] font-bold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (onUpdateUserRole) {
                                  onUpdateUserRole(officer.id, selectedNewRole);
                                }
                                setEditingRoleOfficerId(null);
                              }}
                              className="flex-1 py-1 text-[10px] font-bold bg-[#1B4332] text-white rounded-lg hover:bg-[#2D6A4F] cursor-pointer"
                            >
                              Save Role
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Inline Password Reset Form */}
                      {isEditingPass && stepUpUserId !== officer.id && (
                        <form onSubmit={(e) => handleResetPasswordSubmit(e, officer.id)} className="bg-white p-2.5 rounded-xl border border-[#E9E4D9] space-y-2 animate-fade-in">
                          <label className="block text-[10px] font-extrabold text-[#4F5E46] uppercase">New Officer Password:</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. afa2026"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-[#FAF8F5] border border-[#D5CFC1] rounded-lg font-mono font-bold text-[#1B4332] focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingUserId(null)}
                              className="flex-1 py-1 bg-white border border-[#D5CFC1] text-[#85947E] text-[10px] font-bold rounded-lg cursor-pointer text-center"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="flex-1 py-1 bg-[#1B4332] text-white text-[10px] font-extrabold rounded-lg cursor-pointer text-center"
                            >
                              Save Pass
                            </button>
                          </div>
                        </form>
                      )}

                      {/* Step-up confirmation: re-enter the officer's own password before applying the reset */}
                      {isEditingPass && stepUpUserId === officer.id && (
                        <form onSubmit={(e) => handleStepUpConfirm(e, officer.id)} className="bg-[#FFF7ED] p-2.5 rounded-xl border border-[#F0C08A] space-y-2 animate-fade-in">
                          <p className="text-[10px] font-extrabold text-[#8A4B08] uppercase flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            Confirm your own password to authorize this reset
                          </p>
                          <input
                            type="password"
                            required
                            autoComplete="current-password"
                            placeholder="Your password"
                            value={stepUpPassword}
                            onChange={(e) => setStepUpPassword(e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-white border border-[#F0C08A] rounded-lg font-mono font-bold text-[#1B4332] focus:outline-none"
                          />
                          {stepUpError && <p role="alert" className="text-[10px] font-bold text-[#B42318]">{stepUpError}</p>}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => { setStepUpUserId(null); setStepUpPassword(''); setStepUpError(''); }}
                              className="flex-1 py-1 bg-white border border-[#F0C08A] text-[#8A4B08] text-[10px] font-bold rounded-lg cursor-pointer text-center"
                            >
                              Back
                            </button>
                            <button
                              type="submit"
                              className="flex-1 py-1 bg-[#B42318] text-white text-[10px] font-extrabold rounded-lg cursor-pointer text-center"
                            >
                              Confirm Reset
                            </button>
                          </div>
                        </form>
                      )}

                      {lastResetCredential?.userId === officer.id && (
                        <div className="bg-emerald-50 border border-emerald-300 p-2.5 rounded-xl space-y-2 animate-fade-in">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-extrabold text-emerald-900 uppercase flex items-center gap-1">
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              New Officer Password Active
                            </span>
                            <button
                              type="button"
                              onClick={() => setLastResetCredential(null)}
                              className="text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                            >
                              Dismiss
                            </button>
                          </div>
                          <div className="bg-white border border-emerald-200 px-2.5 py-1.5 rounded-lg font-mono text-xs font-black text-[#1B4332] select-all break-all">
                            {lastResetCredential.password}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(lastResetCredential.password);
                              setCopiedResetPassword(true);
                            }}
                            className="w-full py-1.5 bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-[10px] font-extrabold rounded-lg cursor-pointer text-center transition-all"
                          >
                            {copiedResetPassword ? '✓ Copied to Clipboard!' : 'Copy New Password'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons for Officer */}
                    <div className="pt-2 border-t border-[#E9E4D9] flex flex-wrap items-center gap-1.5 justify-between">
                      <div className="flex items-center gap-1">
                        {canResetThisOfficer && (
                          <button
                            type="button"
                            onClick={() => {
                              setLastResetCredential(null);
                              setEditingUserId(officer.id);
                              setNewPassword(generateInitialPassword(officer.username, officer.role));
                            }}
                            className="px-2 py-1 text-[10px] font-bold bg-white border border-[#D5CFC1] text-[#1B4332] rounded-lg hover:bg-[#F2EFE9] flex items-center gap-1 cursor-pointer"
                            title="Reset password"
                          >
                            <KeyRound className="w-3 h-3 text-[#E65100]" />
                            <span>Reset</span>
                          </button>
                        )}

                        {canManageThisOfficer && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRoleOfficerId(officer.id);
                              setSelectedNewRole(officer.role as any);
                            }}
                            className="px-2 py-1 text-[10px] font-bold bg-white border border-[#D5CFC1] text-[#1B4332] rounded-lg hover:bg-[#F2EFE9] flex items-center gap-1 cursor-pointer"
                            title="Modify or reassign role"
                          >
                            <Shield className="w-3 h-3 text-emerald-700" />
                            <span>Role</span>
                          </button>
                        )}
                      </div>

                      {canManageThisOfficer ? (
                        <button
                          type="button"
                          onClick={() => setOfficerToDelete(officer)}
                          className="px-2.5 py-1 text-[10px] font-bold bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                          title="Delete officer and revoke role"
                        >
                          <Trash2 className="w-3 h-3 text-rose-600" />
                          <span>Delete Officer</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium italic">
                          {isTargetPresident ? 'Protected account' : 'Turnover only'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Member Portal Accounts Desk */}
          <div className="pt-3 border-t border-[#F0EBE1] space-y-2">
            <h4 className="text-xs font-extrabold text-[#4F5E46] uppercase tracking-wider">
              Farmer Member Portal Accounts ({users.filter(u => u.role === 'Member').length})
            </h4>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {users.filter(u => u.role === 'Member').map((user) => {
                const isEditing = editingUserId === user.id;
                const isAppointing = appointingMemberId === user.id;
                const canAppointThisMember = canAppointOfficers && user.isApproved;
                return (
                  <div
                    key={user.id}
                    className={`p-3 rounded-2xl border text-left transition-all text-xs space-y-2 ${
                      user.resetRequested
                        ? 'bg-[#FFF3E0] border-[#FFE082] ring-1 ring-[#FFB300]'
                        : 'bg-[#FAF8F5] border-[#E9E4D9]'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="font-extrabold text-[#1B4332] flex items-center gap-1.5 flex-wrap">
                          <span>{user.name}</span>
                          {user.resetRequested && (
                            <span className="text-[8px] bg-[#E65100] text-white px-2 py-0.5 rounded-full font-black uppercase tracking-widest animate-pulse">
                              PASSWORD RESET REQUESTED
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#5D6B54] font-medium mt-0.5">
                          Member Login • Username: <strong className="font-mono text-[#1B4332]">@{user.username}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {canAppointThisMember && (
                          <button
                            onClick={() => {
                              setAppointingMemberId(isAppointing ? null : user.id);
                              setAppointRole('Secretary');
                            }}
                            className="px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 border bg-[#1B4332] text-white border-[#1B4332] hover:bg-[#2D6A4F]"
                            title="Appoint this member as an association officer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Appoint</span>
                          </button>
                        )}

                        {canResetPasswords && (
                          <button
                            onClick={() => {
                              setLastResetCredential(null);
                              setEditingUserId(user.id);
                              setNewPassword(generateInitialPassword(user.username, user.role));
                            }}
                            className={`px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 border ${
                              user.resetRequested
                                ? 'bg-[#E65100] text-white border-[#E65100]'
                                : 'bg-white text-[#1B4332] border-[#D5CFC1] hover:bg-white'
                            }`}
                            title="Reset password"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Reset</span>
                          </button>
                        )}

                        {canAppointOfficers && (
                          <button
                            onClick={() => onDeleteUser && onDeleteUser(user.id)}
                            className="p-1.5 text-[#85947E] hover:text-[#D32F2F] hover:bg-[#FFEBEE] rounded-lg transition-all cursor-pointer"
                            title="Remove user account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline Appoint-as-Officer panel (President / system admin only) */}
                    {canAppointThisMember && isAppointing && (
                      <div className="bg-white p-3 rounded-xl border border-[#1B4332]/30 space-y-2.5 animate-fade-in">
                        <label className="block text-[10px] font-extrabold text-[#4F5E46] uppercase">
                          Appoint {user.name} as Officer:
                        </label>
                        <select
                          value={appointRole}
                          onChange={(e) => setAppointRole(e.target.value as OfficerRole)}
                          className="w-full text-xs font-bold p-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800"
                        >
                          <option value="Vice_President">Vice President</option>
                          <option value="Secretary">Secretary</option>
                          <option value="Assistant_Secretary">Assistant Secretary</option>
                          <option value="Board_Member">Board Member</option>
                          <option value="Treasurer">Treasurer</option>
                          <option value="Assistant_Treasurer">Assistant Treasurer</option>
                          <option value="Auditor">Auditor</option>
                          <option value="PIO">PIO</option>
                        </select>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAppointingMemberId(null)}
                            className="flex-1 py-1.5 bg-white border border-[#D5CFC1] text-[#85947E] text-[10px] font-bold rounded-lg cursor-pointer text-center"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAppointMember(user.id)}
                            className="flex-1 py-1.5 bg-[#1B4332] text-white text-[10px] font-extrabold rounded-lg cursor-pointer text-center"
                          >
                            Confirm Appointment
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Inline password edit form */}
                    {isEditing && stepUpUserId !== user.id && (
                      <form onSubmit={(e) => handleResetPasswordSubmit(e, user.id)} className="bg-white p-3 rounded-xl border border-[#E9E4D9] space-y-2.5">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-extrabold text-[#4F5E46] uppercase">New Password:</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. afa2026"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs bg-[#FAF8F5] border border-[#D5CFC1] rounded-lg font-mono font-bold text-[#1B4332] focus:outline-none focus:border-[#1B4332]"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingUserId(null)}
                            className="flex-1 py-1.5 bg-white border border-[#D5CFC1] text-[#85947E] text-[10px] font-bold rounded-lg cursor-pointer text-center"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="flex-1 py-1.5 bg-[#1B4332] text-white text-[10px] font-extrabold rounded-lg cursor-pointer text-center"
                          >
                            Save Password
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Step-up confirmation: re-enter the officer's own password before applying the reset */}
                    {isEditing && stepUpUserId === user.id && (
                      <form onSubmit={(e) => handleStepUpConfirm(e, user.id)} className="bg-[#FFF7ED] p-3 rounded-xl border border-[#F0C08A] space-y-2.5">
                        <p className="text-[10px] font-extrabold text-[#8A4B08] uppercase flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Confirm your own password to authorize this reset
                        </p>
                        <input
                          type="password"
                          required
                          autoComplete="current-password"
                          placeholder="Your password"
                          value={stepUpPassword}
                          onChange={(e) => setStepUpPassword(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-[#F0C08A] rounded-lg font-mono font-bold text-[#1B4332] focus:outline-none"
                        />
                        {stepUpError && <p role="alert" className="text-[10px] font-bold text-[#B42318]">{stepUpError}</p>}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setStepUpUserId(null); setStepUpPassword(''); setStepUpError(''); }}
                            className="flex-1 py-1.5 bg-white border border-[#F0C08A] text-[#8A4B08] text-[10px] font-bold rounded-lg cursor-pointer text-center"
                          >
                            Back
                          </button>
                          <button
                            type="submit"
                            className="flex-1 py-1.5 bg-[#B42318] text-white text-[10px] font-extrabold rounded-lg cursor-pointer text-center"
                          >
                            Confirm Reset
                          </button>
                        </div>
                      </form>
                    )}

                    {lastResetCredential?.userId === user.id && (
                      <div className="bg-emerald-50 border border-emerald-300 p-3 rounded-xl space-y-2 animate-fade-in">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-extrabold text-emerald-900 uppercase flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            New Member Password Active
                          </span>
                          <button
                            type="button"
                            onClick={() => setLastResetCredential(null)}
                            className="text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                        <div className="bg-white border border-emerald-200 px-2.5 py-1.5 rounded-lg font-mono text-xs font-black text-[#1B4332] select-all break-all">
                          {lastResetCredential.password}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(lastResetCredential.password);
                            setCopiedResetPassword(true);
                          }}
                          className="w-full py-1.5 bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-[10px] font-extrabold rounded-lg cursor-pointer text-center transition-all"
                        >
                          {copiedResetPassword ? '✓ Copied to Clipboard!' : 'Copy New Password'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* SECTION: RESOLUTIONS REVIEW & ASSEMBLY RECORDS */}
      <div className="order-1 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">

        {/* LEFT COLUMN: RESOLUTIONS WAITLIST (7 Columns) */}
        <div className="lg:col-span-7 self-start bg-white border border-[#E9E4D9] rounded-3xl p-5 shadow-sm space-y-3">
          <div className="border-b border-[#F0EBE1] pb-3 text-left">
            <h3 className="text-base font-extrabold font-display text-[#1B4332] flex items-center gap-2">
              <FileCheck className="w-5.5 h-5.5 text-[#1B4332]" />
              <span>Resolutions for Signing</span>
            </h3>
          </div>

          {pendingResolutions.length > 0 ? (
            <div className="space-y-3">
              {pendingResolutions.map(res => (
                <div key={res.id} className="bg-[#FAF8F5] border border-[#E9E4D9] p-4 rounded-2xl text-left space-y-3 hover:border-[#85947E] transition-all">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <span className="text-xs font-mono font-bold text-[#E65100] bg-[#FFF3E0] px-2.5 py-1 rounded-xl border border-[#FFE082]">
                      {res.resolutionNumber}
                    </span>
                    <span className="text-[10px] text-[#85947E] font-medium">Gibuhat niadtong: {res.dateAgreed}</span>
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-sm font-extrabold text-[#1B4332]">{res.title}</h4>
                    <p className="text-xs text-[#5D6B54] leading-relaxed bg-white p-3 rounded-xl border border-[#E9E4D9] italic">
                      "{res.description}"
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2 border-t border-[#F0EBE1] text-xs font-medium">
                    <div className="text-[#5D6B54]">
                      Giduso ni: <strong className="text-[#1B4332]">{res.movedBy}</strong> • Segundahan ni: <strong className="text-[#1B4332]">{res.secondedBy}</strong>
                      <div className="text-[#2E7D32] text-[10px] font-bold mt-0.5">
                        Tally sa Botasyon: {res.voteInFavor} Uyon / {res.voteAgainst} Dili / {res.voteAbstain} Abstain
                      </div>
                    </div>

                    <button
                      onClick={() => onApproveResolution(res.id)}
                      className="w-full sm:w-auto px-4 py-2 bg-[#1B4332] hover:bg-[#143326] text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Pirmahan ug Ipatuman</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#FAF8F5]/50 border border-dashed border-[#D5CFC1] p-6 rounded-2xl text-center text-[#85947E] text-xs">
              Walay mga resolusyon nga naghulat sa executive approval sa pagkakaron.
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: SIMPLIFIED CHRONOLOGICAL AUDIT TRAIL LOGS (5 Columns) */}
        <div className="lg:col-span-5 self-start bg-white border border-[#E9E4D9] rounded-3xl p-5 shadow-sm space-y-3">
          <div className="border-b border-[#F0EBE1] pb-3 text-left">
            <h3 className="text-base font-extrabold font-display text-[#1B4332] flex items-center gap-2">
              <Activity className="w-5.5 h-5.5 text-[#1B4332]" />
              <span>System Audit Trail</span>
            </h3>
          </div>

          {/* Search bar & Year Filter inside logs */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-left">
            <div className="relative sm:col-span-8">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#85947E]" />
              <input
                type="text"
                placeholder="Pangitaa sa logs (e.g. Approved, Secretary)..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF8F5] border border-[#D5CFC1] rounded-xl text-[#2D3A22] focus:outline-none focus:border-[#1B4332] font-sans"
              />
            </div>
            <div className="sm:col-span-4">
              <select
                value={selectedLogYear}
                onChange={(e) => setSelectedLogYear(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#D5CFC1] rounded-xl text-[#2D3A22] focus:outline-none focus:border-[#1B4332] font-sans font-bold cursor-pointer"
              >
                <option value="All">Tanan nga Tuig</option>
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>Tuig {yr} {closedLogYears.includes(yr) ? '🔒 (Sealed)' : '🔓'}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Year Sealing & Status Banner */}
          {selectedLogYear !== 'All' && (
            <div className="text-left animate-fade-in">
              {closedLogYears.includes(parseInt(selectedLogYear)) ? (
                <div className="bg-[#EFEBE9] border border-[#D7CCC8] p-3 rounded-2xl flex items-center justify-between text-left gap-2 shadow-inner">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#5D4037]">
                    <Lock className="w-4 h-4 text-[#5D4037] shrink-0" />
                    <span>Ang digital trail sa {selectedLogYear} sirado na ug pormal nga gi-seal. (Immutable trail)</span>
                  </div>
                  <span className="bg-[#5D4037] text-white text-[8px] tracking-wider px-2 py-0.5 rounded-full font-bold shrink-0 uppercase">SEALED</span>
                </div>
              ) : (
                <div className="bg-[#FFF3E0] border border-[#FFE082] p-3 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between text-left gap-3">
                  <div className="text-[11px] font-semibold text-[#E65100]">
                    Ang {selectedLogYear} digital trail kay aktibo pa. Mahimo kining i-seal ug i-lock aron tapuson ang talaan.
                  </div>
                  {currentRole === 'President' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSealYearInput('');
                        setShowSealConfirm(true);
                      }}
                      className="px-3 py-1.5 bg-[#BF360C] hover:bg-[#8D2300] text-white text-[10px] font-black rounded-xl transition-colors cursor-pointer flex items-center gap-1 shrink-0 shadow-sm"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>TAPUSON & I-SEAL</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Logs scroll container */}
          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="text-xs bg-[#FAF8F5] border border-[#E9E4D9] rounded-2xl p-3.5 text-left space-y-1.5 transition-all hover:border-[#85947E]"
                >
                  <div className="flex justify-between items-center text-[10px] text-[#85947E] font-semibold">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3 text-[#85947E]" />
                      {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="bg-[#EAF4EC] text-[#1B4332] border border-[#2D6A4F]/20 px-2 py-0.5 rounded-full uppercase text-[8px] tracking-wider font-extrabold">
                      {log.role.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="font-extrabold text-[#2D3A22]">
                    {log.user} • <span className="text-[#2E7D32] font-black">{log.action}</span>
                  </div>

                  <p className="text-[#5D6B54] leading-relaxed text-[11px] font-sans break-words bg-white p-2.5 rounded-xl border border-[#F0EBE1]">
                    {log.details}
                  </p>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-[#85947E] text-xs">
                Walay nakit-an nga logs nga nahiuyon sa imong gipangita.
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#F0EBE1] text-center flex items-center justify-center gap-1 text-[#85947E] text-[10px]">
            <span>Log records updated in real-time. Only actions within the system are tracked.</span>
          </div>
        </div>

      </div>

      {/* SECTION: ELECTION & PRESIDENTIAL TURNOVER DESK */}
      {currentRole === 'President' && (
        <div id="presidential-turnover-desk" className="order-3 bg-[#FAF8F5] border-2 border-[#BF360C]/30 rounded-3xl p-5 shadow-sm space-y-3 text-left">
          <div className="border-b border-[#E9E4D9] pb-3">
            <h3 className="text-base font-extrabold font-display text-[#BF360C] flex items-center gap-2">
              <ShieldCheck className="w-5.5 h-5.5 text-[#BF360C]" />
              <span>Election & Presidential Turnover Desk</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Turnover Info Form */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-extrabold text-[#4F5E46] uppercase">Pilia ang Bag-ong Presidente (Select New President):</label>
                <select
                  value={turnoverNewPresId}
                  onChange={(e) => setTurnoverNewPresId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border-2 border-[#D5CFC1] rounded-xl text-xs font-bold text-[#1B4332] focus:outline-none focus:border-[#1B4332]"
                >
                  <option value="">-- Pilia ang Bag-ong Opisyal --</option>
                  {users
                    .filter(u => u.isApproved && u.role !== 'President')
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role === 'Member' ? 'Miyembro' : u.role.replace('_', ' ')})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-extrabold text-[#4F5E46] uppercase">Adlaw sa Eleksyon (Election Date):</label>
                  <input
                    type="date"
                    value={turnoverDate}
                    onChange={(e) => setTurnoverDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-[#D5CFC1] rounded-xl text-xs font-bold text-[#1B4332] focus:outline-none focus:border-[#1B4332]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-extrabold text-[#4F5E46] uppercase">Bag-ong Papel sa Karaang Pres (Your New Role):</label>
                  <select
                    value={turnoverOutgoingRole}
                    onChange={(e) => setTurnoverOutgoingRole(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-[#D5CFC1] rounded-xl text-xs font-bold text-[#1B4332] focus:outline-none focus:border-[#1B4332]"
                  >
                    <option value="Vice_President">Vice President</option>
                    <option value="Member">Miyembro (Regular Member)</option>
                    <option value="Secretary">Secretary</option>
                    <option value="Assistant_Secretary">Assistant Secretary</option>
                    <option value="Board_Member">Board Member</option>
                    <option value="Treasurer">Treasurer</option>
                    <option value="Assistant_Treasurer">Assistant Treasurer</option>
                    <option value="Auditor">Auditor</option>
                    <option value="PIO">PIO</option>
                    <option value="None">Step Down / Member</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-extrabold text-[#4F5E46] uppercase">Mga Nota ug Gitudlo nga Turnover (Turnover Notes & Inventory Memo):</label>
                <textarea
                  rows={4}
                  value={turnoverNotes}
                  onChange={(e) => setTurnoverNotes(e.target.value)}
                  placeholder="Isulat ang mga detalye sa gi-turnover..."
                  className="w-full px-3.5 py-2.5 bg-white border-2 border-[#D5CFC1] rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:border-[#1B4332]"
                />
              </div>

              {turnoverError && (
                <div className="bg-[#FFEBEE] border border-[#FFCDD2] text-[#C62828] text-xs px-4 py-2.5 rounded-xl font-bold flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-[#C62828] shrink-0" />
                  <span>{turnoverError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleVerifyTurnover}
                className="w-full py-3 bg-[#BF360C] hover:bg-[#8D2300] text-white font-black text-xs sm:text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <ShieldCheck className="w-5 h-5" />
                <span>ISALUMIT ANG PORMAL NGA TURNOVER (Formally Turn Over Office)</span>
              </button>
            </div>

            {/* Turnover Education / Checklist Box */}
            <div className="bg-[#FFF3E0] border border-[#FFE082] rounded-3xl p-5 space-y-3">
              <div className="space-y-3">
                <h4 className="text-xs font-black text-[#8A3700] uppercase tracking-wider flex items-center gap-1.5 font-display">
                  <AlertTriangle className="w-4.5 h-4.5" />
                  <span>MAHINUNGDANONG PAHINUMDOM (Turnover Checklist)</span>
                </h4>

                <p className="text-[11px] text-slate-700 leading-relaxed font-semibold">
                  Ang pag-turn over sa opisina sa Presidente usa ka pormal nga proseso. Subay sa balaod sa AFA, siguroha nga ang mosunod natuman sa dili pa i-klik ang turnover:
                </p>

                <ul className="text-[11px] text-slate-600 space-y-2 pl-4 list-disc font-medium">
                  <li><strong className="text-[#1B4332]">Rekord sa Libro:</strong> Nahatag na ang kinatibuk-ang minutes, resolusyon, ug roster sa mga mag-uuma.</li>
                  <li><strong className="text-[#1B4332]">Pundo sa Asosasyon:</strong> Na-verify na sa Auditor ang sulod sa pundo (PHP {currentBalance.toLocaleString()}) ug natunol na ang bank passbook.</li>
                  <li><strong className="text-[#1B4332]">Asset sa Pig IGP:</strong> Gi-turnover na ang listahan sa pig chores, feed stock, ug ang nahabiling closed book accounts.</li>
                  <li><strong className="text-[#1B4332]">System Access:</strong> Human niini nga aksyon, ang imong username dili na maka-access sa President's Suite, ug ang napiling bag-ong Presidente mao nay makadumala.</li>
                </ul>
              </div>

              <div className="bg-white/80 p-3.5 rounded-2xl border border-[#FFE082] text-[10px] text-slate-600 font-semibold space-y-1">
                <p className="text-[#8A3700] font-black uppercase">💡 Pagsiguro sa Kasegurohan:</p>
                <p>Kini nga transaksyon i-rekord sa cryptographic audit trail ug dili na mamahimong usbon pa (Immutable Audit Record).</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM TURNOVER MODAL */}
      {showTurnoverConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in no-print text-left">
          <div className="bg-white border-2 border-[#BF360C] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-[#BF360C] text-white px-6 py-4 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-white shrink-0" />
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wide text-white">Pormal nga Pag-turnover (Finalize Turnover)</h3>
                <p className="text-[10px] text-orange-200">Kini nga desisyon pinal ug dili na mabakwi!</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                Sigurado ka ba nga i-turnover ang pagka-Presidente sa AFA ngadto kang <strong className="text-[#BF360C] text-sm font-display">{selectedNewPresName}</strong> sugod karong adlawa ({turnoverDate})?
              </p>

              <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#D5CFC1] text-[10px] text-slate-600 space-y-1.5 font-medium">
                <div>Outgoing Role: <strong className="text-slate-800">{turnoverOutgoingRole === 'None' ? 'None (Step Down)' : turnoverOutgoingRole.replace('_', ' ')}</strong></div>
                <div>Turnover Date: <strong className="text-slate-800 font-mono">{turnoverDate}</strong></div>
                <div>Notes: <span className="italic">"{turnoverNotes || 'Walay dugang nota.'}"</span></div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-[#BF360C] uppercase tracking-wider">Isulat ang pulong "TURNOVER" aron sa pagkompirma:</label>
                <input
                  type="text"
                  value={turnoverConfirmationWord}
                  onChange={(e) => setTurnoverConfirmationWord(e.target.value)}
                  placeholder="Isulat ang TURNOVER dinhi..."
                  className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border-2 border-[#BF360C]/30 rounded-xl text-xs font-mono font-black text-[#BF360C] focus:outline-none focus:border-[#BF360C] uppercase text-center"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowTurnoverConfirm(false)}
                  className="flex-1 py-2.5 bg-white border border-[#D5CFC1] hover:bg-[#FAF8F5] text-slate-700 text-xs font-bold rounded-xl cursor-pointer text-center font-display"
                >
                  Kansela
                </button>
                <button
                  type="button"
                  disabled={turnoverConfirmationWord.toUpperCase() !== 'TURNOVER'}
                  onClick={handleExecuteTurnover}
                  className="flex-1 py-2.5 bg-[#BF360C] hover:bg-[#8D2300] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-extrabold rounded-xl cursor-pointer text-center shadow-md flex items-center justify-center gap-1.5 font-display"
                >
                  <Check className="w-4 h-4" />
                  <span>I-turnover Karon</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAST ASSEMBLIES LIST MODAL */}
      {showMeetingsModal && (
        <div className="fixed inset-0 bg-[#1B4332]/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in no-print text-left">
          <div className="bg-white border border-[#E9E4D9] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-[#1B4332] text-[#F4EFE6] px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5.5 h-5.5 text-[#D8F3DC]" />
                <div>
                  <h3 className="font-extrabold text-white text-sm">Mga Agi sa Asembliya ug Miting</h3>
                </div>
              </div>
              <button 
                onClick={() => setShowMeetingsModal(false)}
                className="text-[#B7E4C7] hover:text-white text-lg font-bold p-1 bg-[#2D6A4F] hover:bg-[#40916C] rounded-xl transition-all"
              >
                <X className="w-5.5 h-5.5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {meetings.length > 0 ? (
                meetings.map((meeting) => (
                  <div key={meeting.id} className="bg-[#FAF8F5] border border-[#E9E4D9] rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-[#85947E] transition-all">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-extrabold text-[#1B4332] text-sm">{meeting.title}</h4>
                        {meeting.minutesApprovalStatus === 'Approved' ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <Check className="w-2.5 h-2.5" /> Approved
                          </span>
                        ) : meeting.minutesApprovalStatus === 'Returned' ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                            <X className="w-2.5 h-2.5" /> Returned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                            <Clock className="w-2.5 h-2.5" /> Pending
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#5D6B54] mt-1 font-medium">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#85947E]" />
                          {meeting.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#85947E]" />
                          {meeting.location}
                        </span>
                        <span className="text-[#2E7D32] font-black">
                          {meeting.attendanceCount} Present
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-stretch sm:items-end gap-2">
                      <button
                        onClick={() => setSelectedMeetingForPrint(meeting)}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#1B4332] hover:bg-[#143326] text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer shadow-sm"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Minutes</span>
                      </button>
                      {(meeting.minutesApprovalStatus ?? 'Pending Approval') === 'Pending Approval' && onApproveMeetingMinutes && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setMinutesApprovalTarget(meeting); setMinutesApprovalRemarks(''); }}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-sm"
                          >
                            <Check className="w-3 h-3" />
                            <span>Approve</span>
                          </button>
                          {onReturnMeetingMinutes && (
                            <button
                              onClick={() => { setMinutesApprovalTarget(meeting); setMinutesApprovalRemarks(''); }}
                              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 text-[11px] font-bold rounded-lg transition-all cursor-pointer border border-rose-200"
                            >
                              <X className="w-3 h-3" />
                              <span>Return</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-[#85947E] text-xs">
                  Walay natala nga asembliya sa pagkakaron.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MINUTES OF MEETING APPROVAL MODAL (Secretary → President) */}
      {minutesApprovalTarget && (
        <div className="fixed inset-0 bg-[#1B4332]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fade-in no-print text-left">
          <div className="bg-white border border-[#E9E4D9] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-[#1B4332] text-[#F4EFE6] px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-[#D8F3DC]" />
                <h3 className="font-extrabold text-white text-sm">Review Minutes of Meeting</h3>
              </div>
              <button
                onClick={() => setMinutesApprovalTarget(null)}
                className="text-[#B7E4C7] hover:text-white text-lg font-bold p-1 bg-[#2D6A4F] hover:bg-[#40916C] rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-[#FAF8F5] border border-[#E9E4D9] rounded-2xl p-4 space-y-1">
                <p className="text-xs font-black text-[#1B4332]">{minutesApprovalTarget.title}</p>
                <p className="text-[11px] text-[#5D6B54] font-medium">{minutesApprovalTarget.date} • {minutesApprovalTarget.location}</p>
                <p className="text-[11px] text-[#5D6B54] font-medium whitespace-pre-line leading-relaxed max-h-28 overflow-y-auto">{minutesApprovalTarget.minutes}</p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-[#5D6B54] uppercase tracking-wider mb-1">Remarks (optional)</label>
                <textarea
                  value={minutesApprovalRemarks}
                  onChange={(e) => setMinutesApprovalRemarks(e.target.value)}
                  rows={3}
                  placeholder="Add remarks or reason for return..."
                  className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#D5CFC1] rounded-xl text-xs font-medium text-[#1B4332] focus:outline-none focus:border-[#2D6A4F]"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (minutesApprovalTarget && onReturnMeetingMinutes) {
                      onReturnMeetingMinutes(minutesApprovalTarget.id, minutesApprovalRemarks.trim() || 'Returned for revision.');
                    }
                    setMinutesApprovalTarget(null);
                    setMinutesApprovalRemarks('');
                  }}
                  className="flex-1 py-2.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-bold rounded-xl cursor-pointer text-center"
                >
                  Return to Secretary
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (minutesApprovalTarget && onApproveMeetingMinutes) {
                      onApproveMeetingMinutes(minutesApprovalTarget.id, minutesApprovalRemarks.trim() || undefined);
                    }
                    setMinutesApprovalTarget(null);
                    setMinutesApprovalRemarks('');
                  }}
                  className="flex-1 py-2.5 bg-[#1B4332] hover:bg-[#143326] text-white text-xs font-extrabold rounded-xl cursor-pointer text-center"
                >
                              Approve Minutes
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AUDITED FINANCIAL RECORDS LIST MODAL (Auditor → President) */}
                  {showFinancialApprovalsModal && (
                    <div className="fixed inset-0 bg-[#1B4332]/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in no-print text-left">
                      <div className="bg-white border-[#E9E4D9] w-full max-w-2xl max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="bg-[#1B4332] text-[#F4EFE6] px-6 py-4 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                            <Coins className="w-5 h-5 text-[#D8F3DC]" />
                            <h3 className="font-extrabold text-white text-sm">Audited Financial Records for Approval</h3>
                          </div>
                          <button
                            onClick={() => setShowFinancialApprovalsModal(false)}
                            className="text-[#B7E4C7] hover:text-white text-lg font-bold p-1 bg-[#2D6A4F] hover:bg-[#40916C] rounded-xl transition-all cursor-pointer"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="p-6 space-y-3 overflow-y-auto">
                          {auditedPendingTx.length > 0 ? (
                     auditedPendingTx.map((tx) => (
                       <div key={tx.id} className="bg-[#FAF8F5] border border-[#E9E4D9] rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:border-[#85947E] transition-all">
                         <div className="space-y-1">
                           <div className="flex flex-wrap items-center gap-2">
                             <span className={`text-sm font-black font-mono ${tx.type === 'income' ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {tx.type === 'income' ? '+' : '-'} PHP {tx.amount.toLocaleString()}
                      </span>
                             <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300">
                        Audited
                      </span>
                           </div>
                           <p className="text-xs font-extrabold text-[#1B4332]">{tx.category}</p>
                           <p className="text-[11px] text-[#5D6B54] font-medium">{tx.description}</p>
                           <p className="text-[10px] text-[#5D6B54] font-medium">
                      {tx.date} • Recorded by {tx.recordedBy}{tx.auditedBy ? ` • Audited by ${tx.auditedBy}` : ''}
                    </p>
                         </div>
                         {onPresidentApproveTransaction && (
                    <button
                             onClick={() => { setFinancialApprovalTarget(tx); setFinancialApprovalRemarks(''); }}
                             className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#1B4332] hover:bg-[#143326] text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer shadow-sm shrink-0"
                    >
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>Review</span>
                           </button>
                         )}
                       </div>
                            ))
                   ) : (
                     <p className="text-center text-xs text-[#5D6B54] font-medium py-8">
                       No audited financial records are awaiting approval.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* FINANCIAL RECORD APPROVAL MODAL (Auditor → President) */}
                  {financialApprovalTarget && (
                    <div className="fixed inset-0 bg-[#1B4332]/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fade-in no-print text-left">
                      <div className="bg-white border-[#E9E4D9] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="bg-[#1B4332] text-[#F4EFE6] px-6 py-4 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                            <FileCheck className="w-5 h-5 text-[#D8F3DC]" />
                            <h3 className="font-extrabold text-white text-sm">Review Audited Financial Record</h3>
                          </div>
                          <button
                     onClick={() => setFinancialApprovalTarget(null)}
                            className="text-[#B7E4C7] hover:text-white text-lg font-bold p-1 bg-[#2D6A4F] hover:bg-[#40916C] rounded-xl transition-all cursor-pointer"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="p-6 space-y-4">
                          <div className="bg-[#FAF8F5] border border-[#E9E4D9] rounded-2xl p-4 space-y-1">
                     <p className={`text-sm font-black font-mono ${financialApprovalTarget.type === 'income' ? 'text-emerald-700' : 'text-rose-600'}`}>
                       {financialApprovalTarget.type === 'income' ? 'Income' : 'Expense'}: PHP {financialApprovalTarget.amount.toLocaleString()}
                     </p>
                            <p className="text-xs font-black text-[#1B4332]">{financialApprovalTarget.category}</p>
                            <p className="text-[11px] text-[#5D6B54] font-medium">{financialApprovalTarget.description}</p>
                     {financialApprovalTarget.fundSource && (
                              <p className="text-[11px] text-[#5D6B54] font-medium">Fund: {financialApprovalTarget.fundSource}</p>
                            )}
                            <p className="text-[11px] text-[#5D6B54] font-medium">
                       {financialApprovalTarget.date} • Recorded by {financialApprovalTarget.recordedBy}
                            </p>
                            {financialApprovalTarget.auditNotes && (
                       <p className="text-[11px] text-[#5D6B54] font-medium italic">Audit notes: {financialApprovalTarget.auditNotes}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-[#5D6B54] uppercase tracking-wider mb-1">Remarks (optional)</label>
                            <textarea
                       value={financialApprovalRemarks}
                       onChange={(e) => setFinancialApprovalRemarks(e.target.value)}
                       rows={3}
                       placeholder="Add remarks or reason for return..."
                              className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#D5CFC1] rounded-xl text-xs font-medium text-[#1B4332] focus:outline-none focus:border-[#2D6A4F]"
                     />
                          </div>
                          <div className="flex gap-3">
                            {onPresidentReturnTransaction && (
                       <button
                         type="button"
                         onClick={() => {
                           onPresidentReturnTransaction(financialApprovalTarget.id, financialApprovalRemarks.trim() || 'Returned for revision.');
                           setFinancialApprovalTarget(null);
                           setFinancialApprovalRemarks('');
                         }}
                         className="flex-1 py-2.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-bold rounded-xl cursor-pointer text-center"
                              >
                         Return for Revision
                       </button>
                            )}
                     <button
                       type="button"
                       onClick={() => {
                         if (onPresidentApproveTransaction) {
                    onPresidentApproveTransaction(financialApprovalTarget.id, financialApprovalRemarks.trim() || undefined);
                         }
                         setFinancialApprovalTarget(null);
                         setFinancialApprovalRemarks('');
                              }}
                              className="flex-1 py-2.5 bg-[#1B4332] hover:bg-[#143326] text-white text-xs font-extrabold rounded-xl cursor-pointer text-center"
                     >
                       Approve Record
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

      {/* CONFIRM SEAL LOG YEAR MODAL */}
      {showSealConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in no-print text-left">
          <div className="bg-white border-2 border-[#BF360C] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-[#BF360C] text-white px-6 py-4 flex items-center gap-2">
              <Lock className="w-6 h-6 text-white shrink-0" />
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wide text-white">I-seal ang Digital Trail ({selectedLogYear})</h3>
                <p className="text-[10px] text-orange-200">Kini nga desisyon pinal ug dili na mabakwi!</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                Sigurado ka ba nga i-seal ug i-lock ang kinatibuk-ang digital audit trail alang sa tuig <strong className="text-[#BF360C] text-sm font-display">{selectedLogYear}</strong>? 
                Human niini, wala nay dugang nga system log entry, retroactive nga transaksyon, o pag-update nga mamahimo sa sistema alang sa tuig {selectedLogYear}.
              </p>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-[#BF360C] uppercase tracking-wider">Isulat ang pulong "SEAL" aron sa pagkompirma:</label>
                <input
                  type="text"
                  value={sealYearInput}
                  onChange={(e) => setSealYearInput(e.target.value)}
                  placeholder="Isulat ang SEAL dinhi..."
                  className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border-2 border-[#BF360C]/30 rounded-xl text-xs font-mono font-black text-[#BF360C] focus:outline-none focus:border-[#BF360C] uppercase text-center"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowSealConfirm(false);
                    setSealYearInput('');
                  }}
                  className="flex-1 py-2.5 bg-white border border-[#D5CFC1] hover:bg-[#FAF8F5] text-slate-700 text-xs font-bold rounded-xl cursor-pointer text-center font-display"
                >
                  Kansela
                </button>
                <button
                  type="button"
                  disabled={sealYearInput.toUpperCase() !== 'SEAL'}
                  onClick={() => {
                    handleSealLogYear(parseInt(selectedLogYear));
                    setShowSealConfirm(false);
                    setSealYearInput('');
                  }}
                  className="flex-1 py-2.5 bg-[#BF360C] hover:bg-[#8D2300] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-extrabold rounded-xl cursor-pointer text-center shadow-md flex items-center justify-center gap-1.5 font-display"
                >
                  <Check className="w-4 h-4" />
                  <span>I-seal Karon</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OFFICER DELETION & ROLE REVOCATION CONFIRMATION MODAL */}
      {officerToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border-2 border-rose-500 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 text-left space-y-4">
            <div className="flex items-center gap-3 border-b border-rose-100 pb-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Confirm Officer Account Deletion</h3>
                <p className="text-xs text-rose-600 font-bold uppercase tracking-wider">Role Revocation & System Removal</p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2.5 text-xs">
              <p className="text-slate-800 font-semibold">
                You are about to permanently delete this officer and revoke their administrative role:
              </p>
              <div className="bg-white p-3 rounded-xl border border-rose-200 space-y-1">
                <div className="font-extrabold text-slate-900 text-sm">{officerToDelete.name}</div>
                <div className="text-slate-600">
                  Assigned Role: <strong className="text-rose-700 font-bold">{officerToDelete.role.replace('_', ' ')}</strong>
                </div>
                <div className="text-slate-500 font-mono text-[11px]">Username: @{officerToDelete.username}</div>
              </div>
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-[11px] font-medium flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Automatic Cloud Sync:</strong> This deletion will be immediately synchronized with the cloud database. If performed while offline, it will automatically sync the moment connection is restored without needing to click any button.
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setOfficerToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteUser) {
                    onDeleteUser(officerToDelete.id);
                  }
                  setOfficerToDelete(null);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl cursor-pointer text-center shadow-md flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Officer & Role</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT MINUTES DIALOG */}
      <PrintMinutesModal 
        meeting={selectedMeetingForPrint}
        onClose={() => setSelectedMeetingForPrint(null)}
      />
    </div>
  );
}

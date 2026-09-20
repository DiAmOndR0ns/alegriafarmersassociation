import React, { useState } from 'react';
import { Member, Meeting, Resolution, User } from '../types';
import { 
  Users, BookOpen, FileText, Plus, Search, 
  MapPin, CheckCircle, FilePlus, Calendar, 
  Trash2, UserPlus, Info, Tag, Printer, UserCheck,
  CheckCircle2, AlertCircle, XCircle, Award, Sparkles, ShieldCheck,
  Key, KeyRound, Copy, Check, Eye, EyeOff, RefreshCw
} from 'lucide-react';
import PrintMinutesModal from './PrintMinutesModal';
import PrintAttendanceModal from './PrintAttendanceModal';
import RollCallModal from './RollCallModal';
import SecretaryTemplatesModal from './SecretaryTemplatesModal';
import MemberIdBadgeModal from './MemberIdBadgeModal';

interface SecretaryViewProps {
  members: Member[];
  users?: User[];
  onAddMember: (member: Omit<Member, 'id' | 'joinedDate'>, loginCredentials?: { username: string; initialPassword?: string }) => void;
  onUpdateMemberStatus: (id: string, status: 'Active' | 'Inactive') => void;
  onDeleteMember: (id: string) => void;
  onManageMemberLogin?: (memberId: string, username: string, initialPassword: string) => void;
  onResetMemberPassword?: (userId: string, newPass: string) => void;
  
  meetings: Meeting[];
  onAddMeeting: (meeting: Omit<Meeting, 'id'>) => void;
  onUpdateMeeting: (meeting: Meeting) => void;
  onDeleteMeeting?: (id: string) => void;
  
  resolutions: Resolution[];
  onAddResolution: (resolution: Omit<Resolution, 'id' | 'status'>) => void;
  onDeleteResolution?: (id: string) => void;
  
  isOnline: boolean;
  onOpenReportModal?: () => void;
}

export default function SecretaryView({
  members,
  users = [],
  onAddMember,
  onUpdateMemberStatus,
  onDeleteMember,
  onManageMemberLogin,
  onResetMemberPassword,
  meetings,
  onAddMeeting,
  onUpdateMeeting,
  onDeleteMeeting,
  resolutions,
  onAddResolution,
  onDeleteResolution,
  isOnline,
  onOpenReportModal
}: SecretaryViewProps) {
  const [activeTab, setActiveTab] = useState<'members' | 'meetings' | 'resolutions'>('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSitio, setSelectedSitio] = useState('All');
  const [selectedMeetingForPrint, setSelectedMeetingForPrint] = useState<Meeting | null>(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  
  // Secretary Templates and Member Badge Modals
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [selectedMemberForBadge, setSelectedMemberForBadge] = useState<Member | null>(null);
  
  // Roll Call States
  const [meetingAttendanceRecord, setMeetingAttendanceRecord] = useState<Record<string, 'Present' | 'Absent' | 'Excused'>>({});
  const [rollCallMeeting, setRollCallMeeting] = useState<Meeting | null>(null);
  const [showCreateRollCall, setShowCreateRollCall] = useState(false);

  // Portal Account Setup States for Member Registration
  const [createLoginAccount, setCreateLoginAccount] = useState(true);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('password123');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [hasEditedUsernameManually, setHasEditedUsernameManually] = useState(false);

  // Credential Handout Modal (after member registration)
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string;
    memberId: string;
    username: string;
    initialPassword: string;
    sitio: string;
  } | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  // Manage / Reset Portal Login Modal (for existing members)
  const [loginManageMember, setLoginManageMember] = useState<Member | null>(null);
  const [manageUsername, setManageUsername] = useState('');
  const [managePassword, setManagePassword] = useState('password123');
  const [showManagePassword, setShowManagePassword] = useState(false);
  const [copiedManageCreds, setCopiedManageCreds] = useState(false);
  
  // Member Form State
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberContact, setMemberContact] = useState('');
  const [memberSitio, setMemberSitio] = useState('Sitio Tapon');
  const [memberIdNum, setMemberIdNum] = useState(`AFA-2026-0${members.length + 1}`);
  const [memberRsbsa, setMemberRsbsa] = useState('');
  const [isRsbsaRegistered, setIsRsbsaRegistered] = useState(true);
  const [memberGender, setMemberGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [memberBirthDate, setMemberBirthDate] = useState('');
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  
  // Meeting Form State
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [meetingLocation, setMeetingLocation] = useState('Alegria Multi-Purpose Center');
  const [meetingAttendance, setMeetingAttendance] = useState('15');
  const [meetingAgenda, setMeetingAgenda] = useState('');
  const [meetingMinutes, setMeetingMinutes] = useState('');

  // Resolution Form State
  const [showResModal, setShowResModal] = useState(false);
  const [resNumber, setResNumber] = useState('');
  const [resTitle, setResTitle] = useState('');
  const [resDesc, setResDesc] = useState('');
  const [resMovedBy, setResMovedBy] = useState('');
  const [resSecondedBy, setResSecondedBy] = useState('');
  const [resInFavor, setResInFavor] = useState('0');
  const [resAgainst, setResAgainst] = useState('0');
  const [resAbstain, setResAbstain] = useState('0');

  const SITIOS = [
    'Sitio Tapon',
    'Sitio Pundok 1',
    'Sitio Pundok 2',
    'Sitio Lamak'
  ];

  const CROPS = [
    'Corn (Mais)',
    'Coconut (Lubi)',
    'Banana (Saging)',
    'Cacao',
    'Tuburan Coffee',
    'Vegetables (Utanon)',
    'Cassava (Kamoteng Kahoy)',
    'Hog Raising (Baboyan)',
    'Poultry Raising (Manokan)',
    'Goat Raising (Kanding)'
  ];

  const handleCropToggle = (crop: string) => {
    if (selectedCrops.includes(crop)) {
      setSelectedCrops(selectedCrops.filter(c => c !== crop));
    } else {
      setSelectedCrops([...selectedCrops, crop]);
    }
  };

  const handleMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim()) return;

    const finalMemberId = memberIdNum || `AFA-2026-0${members.length + 1}`;
    const cleanUsername = (loginUsername.trim() || memberName.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '.')).toLowerCase();
    const cleanPassword = loginPassword.trim() || 'password123';

    onAddMember({
      name: memberName,
      memberIdNumber: finalMemberId,
      rsbsaNumber: memberRsbsa || undefined,
      isRsbsaRegistered: isRsbsaRegistered,
      contactNumber: memberContact || 'None',
      farmLocation: memberSitio,
      primaryCrops: selectedCrops.length > 0 ? selectedCrops : ['Vegetables (Utanon)'],
      gender: memberGender,
      birthDate: memberBirthDate || undefined,
      status: 'Active'
    }, createLoginAccount ? {
      username: cleanUsername,
      initialPassword: cleanPassword
    } : undefined);

    if (createLoginAccount) {
      setCreatedCredentials({
        name: memberName,
        memberId: finalMemberId,
        username: cleanUsername,
        initialPassword: cleanPassword,
        sitio: memberSitio
      });
    }

    // Reset Form
    setMemberName('');
    setMemberContact('');
    setMemberSitio('Sitio Tapon');
    setMemberIdNum(`AFA-2026-0${members.length + 2}`);
    setMemberRsbsa('');
    setIsRsbsaRegistered(true);
    setMemberGender('Male');
    setMemberBirthDate('');
    setSelectedCrops([]);
    setLoginUsername('');
    setLoginPassword('password123');
    setHasEditedUsernameManually(false);
    setShowMemberModal(false);
  };

  const handleMeetingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingTitle.trim() || !meetingMinutes.trim()) return;
    
    // Use the compiled attendance count from the roll call if one was done, otherwise use input
    const finalCount = Object.keys(meetingAttendanceRecord).length > 0
      ? Object.values(meetingAttendanceRecord).filter(v => v === 'Present').length
      : parseInt(meetingAttendance) || 0;

    onAddMeeting({
      title: meetingTitle,
      date: meetingDate,
      location: meetingLocation,
      attendanceCount: finalCount,
      agenda: meetingAgenda,
      minutes: meetingMinutes,
      officerInCharge: 'Secretary (Jennylyn S Lumactao)',
      attendanceRecord: Object.keys(meetingAttendanceRecord).length > 0 ? meetingAttendanceRecord : undefined
    });
    // Reset Form
    setMeetingTitle('');
    setMeetingDate(new Date().toISOString().split('T')[0]);
    setMeetingLocation('Alegria Multi-Purpose Center');
    setMeetingAttendance('15');
    setMeetingAgenda('');
    setMeetingMinutes('');
    setMeetingAttendanceRecord({});
    setShowMeetingModal(false);
  };

  const handleResSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resNumber.trim() || !resTitle.trim() || !resDesc.trim()) return;
    onAddResolution({
      resolutionNumber: resNumber,
      title: resTitle,
      description: resDesc,
      dateAgreed: new Date().toISOString().split('T')[0],
      movedBy: resMovedBy || 'General Assembly',
      secondedBy: resSecondedBy || 'General Assembly',
      voteInFavor: parseInt(resInFavor) || 0,
      voteAgainst: parseInt(resAgainst) || 0,
      voteAbstain: parseInt(resAbstain) || 0
    });
    // Reset Form
    setResNumber('');
    setResTitle('');
    setResDesc('');
    setResMovedBy('');
    setResSecondedBy('');
    setResInFavor('0');
    setResAgainst('0');
    setResAbstain('0');
    setShowResModal(false);
  };

  // Filter Members
  const filteredMembers = members.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          member.primaryCrops.some(c => c.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesSitio = selectedSitio === 'All' || member.farmLocation === selectedSitio;
    return matchesSearch && matchesSitio;
  });

  return (
    <div id="secretary-view-container" className="space-y-6">
      {/* Header and Switch Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#F7F4EF] p-4 rounded-2xl border border-[#D5CFC1]">
        <div>
          <h2 className="text-xl font-bold text-[#1B4332] flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            <span>Secretary Administration</span>
          </h2>
          <p className="text-xs text-[#4A5F57] mt-1">
            Register members, draft resolutions, and compile meeting minutes.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
          <button
            id="secretary-templates-btn"
            type="button"
            onClick={() => setShowTemplatesModal(true)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-[#1B4332] hover:bg-[#143326] text-white border border-emerald-500/40 rounded-xl shadow-sm transition-all w-full sm:w-auto cursor-pointer"
          >
            <FileText className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>Document Templates (LOI/Res/Letters)</span>
          </button>

          {onOpenReportModal && (
            <button
              id="secretary-report-btn"
              type="button"
              onClick={onOpenReportModal}
              className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-850 text-emerald-400 border border-emerald-500/30 rounded-xl shadow-sm transition-all w-full sm:w-auto cursor-pointer"
            >
              <Printer className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Export Secretary Report</span>
            </button>
          )}

          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700/50 w-full sm:w-auto">
          <button
            id="tab-members"
            onClick={() => setActiveTab('members')}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none ${
              activeTab === 'members' 
                ? 'bg-emerald-600 text-white shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Members ({members.length})</span>
          </button>
          <button
            id="tab-meetings"
            onClick={() => setActiveTab('meetings')}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none ${
              activeTab === 'meetings' 
                ? 'bg-emerald-600 text-white shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Meetings ({meetings.length})</span>
          </button>
          <button
            id="tab-resolutions"
            onClick={() => setActiveTab('resolutions')}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none ${
              activeTab === 'resolutions' 
                ? 'bg-emerald-600 text-white shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Resolutions ({resolutions.length})</span>
          </button>
        </div>
      </div>
    </div>

      {/* OFFLINE STATUS TIPS */}
      {!isOnline && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-xs text-amber-300">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Local Storage Enabled:</span> You are working in PWA Offline Mode. Newly added members, meetings, or resolutions will be stored securely on your device and queued to sync instantly once you go back online.
          </div>
        </div>
      )}

      {/* MEMBERS TAB */}
      {activeTab === 'members' && (
        <div id="members-tab-content" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <div className="flex gap-2 flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search members, crops, or livestock..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <select
                value={selectedSitio}
                onChange={(e) => setSelectedSitio(e.target.value)}
                className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="All">All Sitios</option>
                {SITIOS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <button
              id="add-member-btn"
              onClick={() => setShowMemberModal(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-sm transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Register Farmer</span>
            </button>
          </div>

          <div className="bg-[#F7F4EF] border border-[#D5CFC1] rounded-2xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F0EAE1] border-b border-[#D5CFC1] text-[#4A5F57] text-xs font-semibold uppercase tracking-wider">
                    <th className="px-5 py-3">Farmer Name & ID</th>
                    <th className="px-5 py-3">RSBSA Status</th>
                    <th className="px-5 py-3">Sitio / Location</th>
                    <th className="px-5 py-3">Crops & Livestock</th>
                    <th className="px-5 py-3">Portal Login</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5CFC1] text-[#1B4332] text-sm">
                  {filteredMembers.length > 0 ? (
                    filteredMembers.map((member) => {
                      const linkedUser = users.find(u => 
                        u.id === member.id || 
                        (member.memberIdNumber && u.memberIdNumber === member.memberIdNumber) ||
                        u.name.toLowerCase() === member.name.toLowerCase()
                      );

                      return (
                      <tr key={member.id} className="hover:bg-slate-750/30 transition-colors">
                        <td className="px-5 py-4 font-semibold text-white">
                          <div className="flex items-center gap-2">
                            <span>{member.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                            <span className="text-emerald-400 font-bold">{member.memberIdNumber || 'AFA-2026-000'}</span>
                            <span>•</span>
                            <span>Joined: {member.joinedDate || 'Recent'}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {member.isRsbsaRegistered ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full" title={member.rsbsaNumber}>
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              <span>{member.rsbsaNumber ? member.rsbsaNumber.substring(0, 14) + '...' : 'RSBSA Reg.'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-slate-700/60 text-slate-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                              <span>Unregistered</span>
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span>{member.farmLocation}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1">
                            {member.primaryCrops.map((crop, idx) => (
                              <span key={idx} className="bg-slate-900 text-slate-300 text-[10px] px-2 py-0.5 rounded-full border border-slate-700/60">
                                {crop}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {linkedUser ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 bg-[#081C15] text-[#52B788] border border-[#2D6A4F] px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold" title={`Account: @${linkedUser.username}`}>
                                <Key className="w-3 h-3 text-[#52B788]" />
                                <span>@{linkedUser.username}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setLoginManageMember(member);
                                  setManageUsername(linkedUser.username);
                                  setManagePassword('password123');
                                }}
                                className="p-1 hover:bg-slate-700 text-slate-400 hover:text-amber-300 rounded transition-colors"
                                title="Reset / Manage Password"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setLoginManageMember(member);
                                const gen = member.name.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '.');
                                setManageUsername(gen);
                                setManagePassword('password123');
                              }}
                              className="inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                              title="Issue portal login for this member"
                            >
                              <UserPlus className="w-3 h-3 text-emerald-400" />
                              <span>+ Create Login</span>
                            </button>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <button
                            id={`status-toggle-${member.id}`}
                            onClick={() => onUpdateMemberStatus(member.id, member.status === 'Active' ? 'Inactive' : 'Active')}
                            className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-all ${
                              member.status === 'Active'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            {member.status}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              id={`badge-member-${member.id}`}
                              onClick={() => setSelectedMemberForBadge(member)}
                              className="text-emerald-400 hover:text-emerald-300 p-1.5 rounded-lg hover:bg-emerald-500/10 transition-all inline-flex items-center justify-center cursor-pointer"
                              title="Print Member ID Badge"
                            >
                              <Award className="w-4 h-4" />
                            </button>
                            <button
                              id={`delete-member-${member.id}`}
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to remove "${member.name}" from the member roster? This will also remove any linked portal login and synchronize immediately to the cloud database.`)) {
                                  onDeleteMember(member.id);
                                }
                              }}
                              className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all inline-flex items-center justify-center cursor-pointer"
                              title="Delete member from database"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                        No farmers found matching search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MEETINGS TAB */}
      {activeTab === 'meetings' && (
        <div id="meetings-tab-content" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Past Assemblies & Meetings</h3>
            <div className="flex flex-wrap gap-2.5">
              <button
                id="print-blank-attendance-btn"
                onClick={() => setShowAttendanceModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl border border-slate-700 shadow-sm transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Download Attendance Sheet</span>
              </button>
              
              <button
                id="log-meeting-btn"
                onClick={() => setShowMeetingModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-sm transition-all"
              >
                <Calendar className="w-4 h-4" />
                <span>Log Meeting Minutes</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {meetings.map((meeting) => {
              const rec = meeting.attendanceRecord || {};
              const present = Object.values(rec).filter(v => v === 'Present').length;
              const absent = Object.values(rec).filter(v => v === 'Absent').length;
              const excused = Object.values(rec).filter(v => v === 'Excused').length;

              return (
                <div key={meeting.id} className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 hover:border-slate-600 transition-all shadow-md">
                  <div className="flex flex-col sm:flex-row justify-between gap-3 border-b border-slate-700/60 pb-3 mb-4">
                    <div>
                      <h4 className="text-base font-bold text-white">{meeting.title}</h4>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {meeting.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-500" />
                          {meeting.location}
                        </span>
                        <span className="font-semibold text-emerald-400">
                          {meeting.attendanceCount} Attendees present
                        </span>

                        {meeting.attendanceRecord && (
                          <div className="flex items-center gap-1.5 text-[10px] bg-slate-900/60 px-2 py-0.5 rounded-lg border border-slate-750 font-sans">
                            <span className="text-slate-500 uppercase font-semibold text-[9px]">Roll Call:</span>
                            <span className="text-emerald-400 font-bold">Present: {present}</span>
                            <span className="text-slate-700">•</span>
                            <span className="text-rose-400 font-bold">Absent: {absent}</span>
                            <span className="text-slate-700">•</span>
                            <span className="text-amber-400 font-bold">Excused: {excused}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-row sm:flex-col items-start sm:items-end gap-2.5 shrink-0">
                      <span className="text-xs font-mono text-slate-500 bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-750">
                        Recorded: {meeting.officerInCharge}
                      </span>
                      <div className="flex gap-2 w-full">
                        <button
                          id={`roll-call-btn-${meeting.id}`}
                          onClick={() => setRollCallMeeting(meeting)}
                          className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-650 text-slate-200 text-xs font-bold rounded-lg transition-all cursor-pointer border border-slate-650 shadow-sm"
                          title="Record / Edit digital attendance roll call for this assembly"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{meeting.attendanceRecord ? 'Edit Roll Call' : 'Record Roll Call'}</span>
                        </button>
                        <button
                          id={`print-meeting-btn-${meeting.id}`}
                          onClick={() => setSelectedMeetingForPrint(meeting)}
                          className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm border border-emerald-500/10"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print Minutes</span>
                        </button>
                        {onDeleteMeeting && (
                          <button
                            id={`delete-meeting-btn-${meeting.id}`}
                            onClick={() => {
                              if (window.confirm(`Delete assembly meeting "${meeting.title}"? Changes will auto-sync to the database.`)) {
                                onDeleteMeeting(meeting.id);
                              }
                            }}
                            className="flex items-center justify-center p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-bold rounded-lg transition-all cursor-pointer border border-rose-800/40"
                            title="Delete meeting record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-900/50 p-3.5 rounded-xl border border-slate-750/70">
                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Meeting Agenda</h5>
                    <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{meeting.agenda}</p>
                  </div>
                  <div className="bg-slate-900/50 p-3.5 rounded-xl border border-slate-750/70">
                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Minutes of Discussion</h5>
                    <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{meeting.minutes}</p>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* RESOLUTIONS TAB */}
      {activeTab === 'resolutions' && (
        <div id="resolutions-tab-content" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Association Resolutions</h3>
            <button
              id="draft-res-btn"
              onClick={() => setShowResModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-sm transition-all"
            >
              <FilePlus className="w-4 h-4" />
              <span>Draft Resolution</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {resolutions.map((res) => (
              <div key={res.id} className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 flex flex-col justify-between shadow-md relative overflow-hidden">
                <div className={`absolute top-0 right-0 h-1.5 w-full ${res.status === 'Approved' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <div>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                      {res.resolutionNumber}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                        res.status === 'Approved' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {res.status}
                      </span>
                      {onDeleteResolution && (
                        <button
                          id={`delete-resolution-btn-${res.id}`}
                          onClick={() => {
                            if (window.confirm(`Delete resolution "${res.resolutionNumber}: ${res.title}"? Changes will auto-sync to the database.`)) {
                              onDeleteResolution(res.id);
                            }
                          }}
                          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Delete resolution"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <h4 className="text-base font-bold text-white mt-2 leading-snug">{res.title}</h4>
                  <p className="text-xs text-slate-400 mt-1">Date Agreed: {res.dateAgreed}</p>
                  
                  <p className="text-sm text-slate-300 mt-3 bg-slate-900/40 p-3 rounded-xl leading-relaxed italic border border-slate-750">
                    "{res.description}"
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-750 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="block text-slate-500">Mover / Seconder:</span>
                    <span className="text-slate-300 font-medium">Moved by {res.movedBy}</span>
                    <span className="block text-slate-400 font-normal">Seconded by {res.secondedBy}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-750 flex justify-around text-center shrink-0">
                    <div>
                      <span className="block text-[9px] text-emerald-400 font-bold uppercase">In Favor</span>
                      <span className="text-sm font-semibold text-white font-mono">{res.voteInFavor}</span>
                    </div>
                    <div className="h-6 w-[1px] bg-slate-700" />
                    <div>
                      <span className="block text-[9px] text-red-400 font-bold uppercase">Against</span>
                      <span className="text-sm font-semibold text-white font-mono">{res.voteAgainst}</span>
                    </div>
                    <div className="h-6 w-[1px] bg-slate-700" />
                    <div>
                      <span className="block text-[9px] text-slate-400 font-bold uppercase">Abstain</span>
                      <span className="text-sm font-semibold text-white font-mono">{res.voteAbstain}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MEMBER MODAL - Compact and Scrollable */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 overflow-y-auto p-2 sm:p-4 flex items-center justify-center animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-md max-h-[88vh] sm:max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto">
            <div className="bg-slate-900 px-4 py-2.5 sm:px-5 sm:py-3 border-b border-slate-700 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-900/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm leading-tight">Register Association Farmer</h3>
                  <p className="text-[10px] text-slate-400">Official AFA Membership & RSBSA Enrollment</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowMemberModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleMemberSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 text-left overscroll-contain scrollbar-thin scrollbar-thumb-slate-600">
                {/* Farmer Name & Member ID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Farmer Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Juan De la Cruz"
                      value={memberName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMemberName(val);
                        if (!hasEditedUsernameManually) {
                          const generated = val.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '.');
                          setLoginUsername(generated);
                        }
                      }}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Member ID Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. AFA-2026-043"
                      value={memberIdNum}
                      onChange={(e) => setMemberIdNum(e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-900 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Contact Number & Sitio Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Contact Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 0917-000-0000"
                      value={memberContact}
                      onChange={(e) => setMemberContact(e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Sitio (Farm Location)</label>
                    <select
                      value={memberSitio}
                      onChange={(e) => setMemberSitio(e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    >
                      {SITIOS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {/* Gender & Birth Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Gender</label>
                    <select
                      value={memberGender}
                      onChange={(e) => setMemberGender(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Birth Date</label>
                    <input
                      type="date"
                      value={memberBirthDate}
                      onChange={(e) => setMemberBirthDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* RSBSA Registration Field */}
                <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-750 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-300 uppercase flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Basic Sectors in Agriculture (RSBSA)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-emerald-400">
                      <input 
                        type="checkbox"
                        checked={isRsbsaRegistered}
                        onChange={(e) => setIsRsbsaRegistered(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-0"
                      />
                      <span>RSBSA Registered</span>
                    </label>
                  </div>
                  {isRsbsaRegistered && (
                    <input
                      type="text"
                      placeholder="RSBSA Control No. (e.g. 07-22-51-001-000542)"
                      value={memberRsbsa}
                      onChange={(e) => setMemberRsbsa(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  )}
                </div>

                {/* Crops & Livestock */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-400" />
                    Primary Crops & Livestock Products
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-900 p-2.5 rounded-xl border border-slate-750 max-h-28 overflow-y-auto">
                    {CROPS.map((crop) => (
                      <label key={crop} className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs hover:text-white">
                        <input
                          type="checkbox"
                          checked={selectedCrops.includes(crop)}
                          onChange={() => handleCropToggle(crop)}
                          className="rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-0 focus:ring-offset-0"
                        />
                        <span className="truncate">{crop}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Portal Login Credentials Section */}
                <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-750 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-emerald-400" />
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Member Portal Account</h4>
                        <p className="text-[10px] sm:text-[11px] text-slate-400">Direct login credentials issued by the Secretary</p>
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-emerald-400">
                      <input 
                        type="checkbox"
                        checked={createLoginAccount}
                        onChange={(e) => setCreateLoginAccount(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-0"
                      />
                      <span>Create Login</span>
                    </label>
                  </div>

                  {createLoginAccount && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-800 animate-fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                            Portal Username
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs text-slate-500 font-mono">@</span>
                            <input
                              type="text"
                              required={createLoginAccount}
                              placeholder="e.g. juan.delacruz"
                              value={loginUsername}
                              onChange={(e) => {
                                setLoginUsername(e.target.value);
                                setHasEditedUsernameManually(true);
                              }}
                              className="w-full pl-6 pr-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[11px] font-bold text-slate-300 uppercase">
                              Initial Password
                            </label>
                            <button
                              type="button"
                              onClick={() => setLoginPassword(`Afa@${Math.floor(100 + Math.random() * 900)}`)}
                              className="text-[10px] text-emerald-400 hover:underline font-bold cursor-pointer"
                            >
                              Generate
                            </button>
                          </div>
                          <div className="relative">
                            <input
                              type={showLoginPassword ? 'text' : 'password'}
                              required={createLoginAccount}
                              value={loginPassword}
                              onChange={(e) => setLoginPassword(e.target.value)}
                              className="w-full pl-2.5 pr-8 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowLoginPassword(!showLoginPassword)}
                              className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-200"
                            >
                              {showLoginPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 italic">
                        *Makagamit niini ang mag-uuma aron makasulod sa Member Portal ug makakita sa iyang tinigom, attendance, ug dividend share.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Fixed Bottom Action Footer */}
              <div className="shrink-0 bg-slate-900/95 backdrop-blur-sm px-4 py-2.5 sm:px-5 border-t border-slate-700 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="flex-1 py-2 text-xs sm:text-sm font-semibold bg-slate-700 hover:bg-slate-650 text-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Registration</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MEETING MINUTES MODAL */}
      {showMeetingModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-slate-900 px-5 py-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-white text-base">Log Assembly / Meeting Minutes</h3>
              <button 
                onClick={() => setShowMeetingModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleMeetingSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Quick Link to Blank Attendance Printout */}
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-750 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="text-[11px] text-slate-400">
                  <span className="font-bold text-emerald-400 block">Need a physical attendance form first?</span>
                  Generate, customize and print blank sign-in sheets or complete active member checklists.
                </div>
                <button
                  type="button"
                  onClick={() => setShowAttendanceModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-all shrink-0 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download / Print Form</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Meeting Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Monthly General Assembly"
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Date Held</label>
                  <input
                    type="date"
                    required
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Location</label>
                  <input
                    type="text"
                    required
                    value={meetingLocation}
                    onChange={(e) => setMeetingLocation(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-300 uppercase">Attendance Count</label>
                    <button
                      type="button"
                      onClick={() => setShowCreateRollCall(true)}
                      className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>{Object.keys(meetingAttendanceRecord).length > 0 ? 'Update Roll Call' : 'Take Digital Roll Call'}</span>
                    </button>
                  </div>
                  
                  {Object.keys(meetingAttendanceRecord).length > 0 ? (
                    <div className="bg-slate-900 border border-emerald-500/15 p-2.5 rounded-xl flex items-center justify-between text-xs font-sans">
                      <div className="text-slate-300 flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="truncate">
                          Roll call recorded:{' '}
                          <span className="font-bold text-emerald-400">
                            {Object.values(meetingAttendanceRecord).filter(v => v === 'Present').length} Present
                          </span>
                          {' '}({Object.values(meetingAttendanceRecord).filter(v => v === 'Absent').length} A,{' '}
                          {Object.values(meetingAttendanceRecord).filter(v => v === 'Excused').length} E)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMeetingAttendanceRecord({})}
                        className="text-[10px] font-bold text-slate-400 hover:text-rose-400 transition-all cursor-pointer underline shrink-0"
                      >
                        Reset to Manual
                      </button>
                    </div>
                  ) : (
                    <input
                      type="number"
                      min="1"
                      required
                      value={meetingAttendance}
                      onChange={(e) => setMeetingAttendance(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-sans"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Meeting Agenda (Bulleted list)</label>
                <textarea
                  rows={3}
                  placeholder="1. Topic A&#10;2. Topic B&#10;3. Topic C"
                  value={meetingAgenda}
                  onChange={(e) => setMeetingAgenda(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Discussion Details & Minutes</label>
                <textarea
                  rows={5}
                  required
                  placeholder="Record summary of what was discussed, agreed items, next action items..."
                  value={meetingMinutes}
                  onChange={(e) => setMeetingMinutes(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowMeetingModal(false)}
                  className="flex-1 py-2.5 text-sm font-semibold bg-slate-700 hover:bg-slate-650 text-slate-200 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-sm transition-all"
                >
                  Save Meeting Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESOLUTION MODAL */}
      {showResModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-slate-900 px-5 py-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-white text-base">Draft New Association Resolution</h3>
              <button 
                onClick={() => setShowResModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleResSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Resolution Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AFA-2026-003"
                    value={resNumber}
                    onChange={(e) => setResNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Resolution Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Request for corn seed assistance"
                    value={resTitle}
                    onChange={(e) => setResTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Resolution Content / Description</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Whereas, the members agree that..."
                  value={resDesc}
                  onChange={(e) => setResDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Moved By (Proponent)</label>
                  <input
                    type="text"
                    placeholder="e.g. Nong Berting"
                    value={resMovedBy}
                    onChange={(e) => setResMovedBy(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Seconded By (Supporter)</label>
                  <input
                    type="text"
                    placeholder="e.g. Nang Mary"
                    value={resSecondedBy}
                    onChange={(e) => setResSecondedBy(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">Vote Tally (General Assembly)</label>
                <div className="grid grid-cols-3 gap-3 bg-slate-900 p-3 rounded-xl border border-slate-750 text-center">
                  <div>
                    <label className="block text-[10px] text-emerald-400 font-bold uppercase mb-1">In Favor (Yes)</label>
                    <input
                      type="number"
                      min="0"
                      value={resInFavor}
                      onChange={(e) => setResInFavor(e.target.value)}
                      className="w-full text-center px-2 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-red-400 font-bold uppercase mb-1">Against (No)</label>
                    <input
                      type="number"
                      min="0"
                      value={resAgainst}
                      onChange={(e) => setResAgainst(e.target.value)}
                      className="w-full text-center px-2 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Abstain</label>
                    <input
                      type="number"
                      min="0"
                      value={resAbstain}
                      onChange={(e) => setResAbstain(e.target.value)}
                      className="w-full text-center px-2 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowResModal(false)}
                  className="flex-1 py-2.5 text-sm font-semibold bg-slate-700 hover:bg-slate-650 text-slate-200 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-sm transition-all"
                >
                  Save Draft Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT MINUTES MODAL */}
      <PrintMinutesModal 
        meeting={selectedMeetingForPrint} 
        onClose={() => setSelectedMeetingForPrint(null)} 
      />

      {/* PRINT BLANK ATTENDANCE SHEET MODAL */}
      <PrintAttendanceModal 
        isOpen={showAttendanceModal} 
        onClose={() => setShowAttendanceModal(false)} 
        members={members}
      />

      {/* DIGITAL ROLL CALL MODAL - NEW MEETING CREATION */}
      <RollCallModal
        isOpen={showCreateRollCall}
        onClose={() => setShowCreateRollCall(false)}
        meetingTitle={meetingTitle}
        members={members}
        initialRecord={meetingAttendanceRecord}
        onSave={setMeetingAttendanceRecord}
      />

      {/* DIGITAL ROLL CALL MODAL - EXISTING MEETING EDIT/UPDATE */}
      <RollCallModal
        isOpen={!!rollCallMeeting}
        onClose={() => setRollCallMeeting(null)}
        meetingTitle={rollCallMeeting?.title || ''}
        members={members}
        initialRecord={rollCallMeeting?.attendanceRecord}
        onSave={(newRecord) => {
          if (rollCallMeeting) {
            onUpdateMeeting({
              ...rollCallMeeting,
              attendanceRecord: newRecord,
              attendanceCount: Object.values(newRecord).filter(v => v === 'Present').length
            });
          }
        }}
      />

      {/* SECRETARY OFFICIAL TEMPLATES MODAL (LOI, RESOLUTION, REQUEST LETTER) */}
      <SecretaryTemplatesModal
        isOpen={showTemplatesModal}
        onClose={() => setShowTemplatesModal(false)}
        members={members}
        resolutions={resolutions}
        onAddResolution={onAddResolution}
      />

      {/* MEMBER REGISTRATION & ID BADGE MODAL */}
      <MemberIdBadgeModal
        isOpen={!!selectedMemberForBadge}
        onClose={() => setSelectedMemberForBadge(null)}
        member={selectedMemberForBadge}
        allMembers={members}
      />

      {/* CREDENTIAL HANDOUT SLIP MODAL (Issued after member enrollment) */}
      {createdCredentials && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-850 border-2 border-emerald-500/60 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-5 text-left space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-750 pb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base">Farmer Enrolled & Login Created!</h3>
                <p className="text-xs text-slate-400">Official Portal Credentials issued by Secretary</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-750 rounded-xl p-4 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase">Farmer Name:</span>
                <span className="text-white font-extrabold text-sm">{createdCredentials.name}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase">Member ID:</span>
                <span className="text-emerald-400 font-mono font-bold">{createdCredentials.memberId}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase">Sitio:</span>
                <span className="text-slate-300 font-medium">{createdCredentials.sitio}</span>
              </div>

              <div className="border-t border-slate-800 pt-2.5 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>Portal Username:</span>
                </span>
                <code className="bg-slate-950 px-2.5 py-1 rounded-lg text-amber-300 font-mono font-bold text-xs border border-slate-800">
                  {createdCredentials.username}
                </code>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Initial Password:</span>
                </span>
                <code className="bg-slate-950 px-2.5 py-1 rounded-lg text-emerald-300 font-mono font-bold text-xs border border-slate-800">
                  {createdCredentials.initialPassword}
                </code>
              </div>
            </div>

            <div className="text-[11px] text-slate-300 leading-relaxed bg-emerald-950/30 p-3 rounded-xl border border-emerald-900/40 flex items-start gap-2">
              <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Ihatag kini nga Username ug Password ngadto kang <strong>{createdCredentials.name}</strong>. Makasulod dayon siya sa iyang personal nga Member Portal.
              </span>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `AFA FARMER PORTAL LOGIN\nMember: ${createdCredentials.name}\nMember ID: ${createdCredentials.memberId}\nUsername: ${createdCredentials.username}\nPassword: ${createdCredentials.initialPassword}\nPortal: Alegria Farmers Association`
                  );
                  setCopiedCredentials(true);
                  setTimeout(() => setCopiedCredentials(false), 2500);
                }}
                className="flex-1 py-2.5 bg-slate-750 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedCredentials ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCredentials ? 'Koda Nakopya!' : 'Kopyaha ang Koda'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all cursor-pointer text-center shadow-md"
              >
                Nahuman (Done)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANAGE / RESET PORTAL CREDENTIALS MODAL */}
      {loginManageMember && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-850 border border-slate-750 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-5 text-left space-y-4">
            <div className="flex justify-between items-center border-b border-slate-750 pb-3">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  <span>Manage Portal Credentials</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Farmer: <strong className="text-white">{loginManageMember.name}</strong> ({loginManageMember.memberIdNumber})</p>
              </div>
              <button 
                onClick={() => setLoginManageMember(null)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (!manageUsername.trim() || !managePassword.trim()) return;
                if (onManageMemberLogin) {
                  onManageMemberLogin(loginManageMember.id, manageUsername.trim(), managePassword.trim());
                }
                setLoginManageMember(null);
              }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-300 uppercase">Portal Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">@</span>
                  <input
                    type="text"
                    required
                    value={manageUsername}
                    onChange={(e) => setManageUsername(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-slate-300 uppercase">Password</label>
                  <button
                    type="button"
                    onClick={() => setManagePassword(`Afa@${Math.floor(100 + Math.random() * 900)}`)}
                    className="text-[10px] text-emerald-400 hover:underline font-bold cursor-pointer"
                  >
                    Generate Random
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showManagePassword ? "text" : "password"}
                    required
                    value={managePassword}
                    onChange={(e) => setManagePassword(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white font-mono pr-10 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowManagePassword(!showManagePassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    {showManagePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 italic bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                Ang pag-save niini mag-update o maghimo dayon sa account credentials niining maong miyembro.
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setLoginManageMember(null)}
                  className="flex-1 py-2.5 bg-slate-750 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all shadow-md cursor-pointer"
                >
                  Save Credentials
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

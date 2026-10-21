import React, { useState } from 'react';
import { Announcement, AssociationActivity } from '../types';
import { 
  Megaphone, Plus, Trash2, Calendar, Shield, Tag, AlertTriangle, 
  CloudSun, DollarSign, Printer, CheckCircle, Clock, MapPin, 
  Users, Edit3, FileText, Check, X
} from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';

interface PioViewProps {
  announcements: Announcement[];
  activities: AssociationActivity[];
  onAddAnnouncement: (ann: Omit<Announcement, 'id' | 'datePosted'>) => void;
  onDeleteAnnouncement: (id: string) => void;
  onAddActivity: (activity: Omit<AssociationActivity, 'id'>) => void;
  onUpdateActivity: (activity: AssociationActivity) => void;
  onDeleteActivity: (id: string) => void;
  onOpenReportModal?: () => void;
  /** Name credited as the author of new announcements (defaults to the PIO). */
  postedByName?: string;
}

export default function PioView({
  announcements,
  activities = [],
  onAddAnnouncement,
  onDeleteAnnouncement,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
  onOpenReportModal,
  postedByName = 'PIO (Ida S. Manera)'
}: PioViewProps) {
  const { t, isEnglish: en } = useLanguage();
  const [activeTab, setActiveTab] = useState<'bulletins' | 'activities'>('bulletins');

  // Announcement State
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('General');
  const [customCategory, setCustomCategory] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Low');

  // Activity State
  const [showAddActivityModal, setShowAddActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<AssociationActivity | null>(null);

  const [actTitle, setActTitle] = useState('');
  const [actCebTitle, setActCebTitle] = useState('');
  const [actCategory, setActCategory] = useState<AssociationActivity['category']>('Training / Workshop');
  const [actDate, setActDate] = useState(new Date().toISOString().split('T')[0]);
  const [actTime, setActTime] = useState('09:00 AM');
  const [actLocation, setActLocation] = useState('Barangay Alegria Covered Court');
  const [actDesc, setActDesc] = useState('');
  const [actAudience, setActAudience] = useState('All AFA Farmer Members');
  const [actStatus, setActStatus] = useState<AssociationActivity['status']>('Scheduled');
  const [actNotes, setActNotes] = useState('');
  const [actAttendees, setActAttendees] = useState(0);

  const CATEGORIES = [
    { value: 'General', label: 'General Announcement' },
    { value: 'Meeting', label: 'Meeting Notice' },
    { value: 'Assistance', label: 'Farmer Assistance' },
    { value: 'Weather', label: 'Weather Warning' },
    { value: 'Price Advisory', label: 'Crop Price Advisory' }
  ];

  const handlePostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    onAddAnnouncement({
      title,
      category: (category === 'Other' ? (customCategory.trim() || 'General') : category) as any,
      content,
      priority,
      postedBy: postedByName
    });

    setTitle('');
    setContent('');
    setCategory('General');
    setCustomCategory('');
    setPriority('Low');
    setShowAddModal(false);
  };

  const handleOpenAddActivity = () => {
    setEditingActivity(null);
    setActTitle('');
    setActCebTitle('');
    setActCategory('Training / Workshop');
    setActDate(new Date().toISOString().split('T')[0]);
    setActTime('09:00 AM');
    setActLocation('Barangay Alegria Covered Court');
    setActDesc('');
    setActAudience('All AFA Farmer Members');
    setActStatus('Scheduled');
    setActNotes('');
    setActAttendees(0);
    setShowAddActivityModal(true);
  };

  const handleOpenEditActivity = (act: AssociationActivity) => {
    setEditingActivity(act);
    setActTitle(act.title);
    setActCebTitle(act.cebTitle || '');
    setActCategory(act.category);
    setActDate(act.scheduledDate);
    setActTime(act.scheduledTime);
    setActLocation(act.location);
    setActDesc(act.description);
    setActAudience(act.targetAudience || 'All AFA Farmer Members');
    setActStatus(act.status);
    setActNotes(act.documentedNotes || '');
    setActAttendees(act.attendeesCount || 0);
    setShowAddActivityModal(true);
  };

  const handleSaveActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actTitle.trim() || !actDesc.trim()) return;

    if (editingActivity) {
      onUpdateActivity({
        ...editingActivity,
        title: actTitle,
        cebTitle: actCebTitle,
        category: actCategory,
        scheduledDate: actDate,
        dateScheduled: actDate,
        scheduledTime: actTime,
        timeScheduled: actTime,
        location: actLocation,
        description: actDesc,
        targetAudience: actAudience,
        status: actStatus,
        documentedNotes: actNotes,
        attendeesCount: Number(actAttendees)
      });
    } else {
      onAddActivity({
        title: actTitle,
        cebTitle: actCebTitle,
        category: actCategory,
        scheduledDate: actDate,
        dateScheduled: actDate,
        scheduledTime: actTime,
        timeScheduled: actTime,
        location: actLocation,
        description: actDesc,
        targetAudience: actAudience,
        status: actStatus,
        documentedNotes: actNotes,
        organizer: 'PIO (Ida S. Manera)',
        attendeesCount: Number(actAttendees)
      });
    }

    setShowAddActivityModal(false);
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'Meeting':
        return <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'Assistance':
        return <Tag className="w-4 h-4 text-blue-400 shrink-0" />;
      case 'Weather':
        return <CloudSun className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'Price Advisory':
        return <DollarSign className="w-4 h-4 text-yellow-400 shrink-0" />;
      default:
        return <Megaphone className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  const getPriorityClass = (pri: string) => {
    switch (pri) {
      case 'High':
        return 'bg-red-500/10 text-red-400 border border-red-500/20';
      case 'Medium':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      default:
        return 'bg-[#EAF4EC] text-[#1B4332] border border-[#B7D9BF]';
    }
  };

  return (
    <div id="pio-view-container" className="space-y-6">
      {/* PIO BANNER AND ACTION BUTTON */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#EAF4EC] p-4 rounded-2xl border border-[#B7D9BF]">
        <div>
          <h2 className="text-xl font-bold text-[#1B4332] flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[#1B4332]" />
            <span>PIO Communications & Activity Management</span>
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 w-full sm:w-auto">
          {onOpenReportModal && (
            <button
              id="pio-report-btn"
              type="button"
              onClick={onOpenReportModal}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-white hover:bg-[#F5FAF6] text-[#1B4332] border border-[#B7D9BF] rounded-xl shadow-sm transition-all cursor-pointer w-full sm:w-auto"
            >
              <Printer className="w-4 h-4 text-[#1B4332] shrink-0" />
              <span>Export PIO Report</span>
            </button>
          )}

          {activeTab === 'bulletins' ? (
            <button
              id="post-announcement-btn"
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl shadow-sm transition-all w-full sm:w-auto shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Post Bulletin</span>
            </button>
          ) : (
            <button
              id="add-activity-btn"
              onClick={handleOpenAddActivity}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold bg-[#2D6A4F] hover:bg-[#1B4332] text-white rounded-xl shadow-sm transition-all w-full sm:w-auto shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule Activity</span>
            </button>
          )}
        </div>
      </div>

      {/* MODULE TABS */}
      <div className="flex border-b border-[#D5CFC1] space-x-4">
        <button
          onClick={() => setActiveTab('bulletins')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'bulletins'
              ? 'border-[#1B4332] text-[#1B4332]'
              : 'border-transparent text-[#6A7F72] hover:text-[#1B4332]'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          <span>Announcements ({announcements.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('activities')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'activities'
              ? 'border-[#2D6A4F] text-[#2D6A4F]'
              : 'border-transparent text-[#6A7F72] hover:text-[#1B4332]'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Activities ({activities.length})</span>
        </button>
      </div>

      {/* TAB 1: ANNOUNCEMENTS */}
      {activeTab === 'bulletins' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {announcements.length > 0 ? (
            announcements.map((ann) => (
              <div 
                key={ann.id} 
                className={`bg-white border rounded-2xl p-5 hover:border-[#1B4332] transition-all shadow-md flex flex-col justify-between ${
                  ann.priority === 'High' ? 'border-red-500/15' : 'border-[#D5CFC1]'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start gap-2 border-b border-[#E9E4D9] pb-2.5 mb-3.5">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(ann.category)}
                      <span className="text-xs text-[#6A7F72] font-medium">
                        {ann.category}
                      </span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${getPriorityClass(ann.priority)}`}>
                      {ann.priority} Priority
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-[#1B4332] leading-snug">{ann.title}</h3>
                  <p className="text-xs text-[#6A7F72] mt-1">Posted: {ann.datePosted}</p>

                  <p className="text-sm text-[#4B6259] mt-3 whitespace-pre-line leading-relaxed">
                    {ann.content}
                  </p>
                </div>

                <div className="mt-5 pt-3.5 border-t border-[#E9E4D9] flex justify-between items-center text-xs">
                  <span className="text-[#6A7F72]">By: {ann.postedBy}</span>
                  <button
                    id={`delete-ann-${ann.id}`}
                    onClick={() => onDeleteAnnouncement(ann.id)}
                    className="text-slate-500 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10 transition-all shrink-0 cursor-pointer"
                    title="Delete Announcement"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full bg-white border border-[#D5CFC1] rounded-2xl p-8 text-center text-[#6A7F72]">
              No announcements posted on the board yet.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ASSOCIATION ACTIVITIES & EVENTS */}
      {activeTab === 'activities' && (
        <div className="space-y-4">
          {activities.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activities.map((act) => (
                <div
                  key={act.id}
                  className="bg-white border border-[#D5CFC1] rounded-2xl p-5 shadow-md flex flex-col justify-between space-y-4 hover:border-[#1B4332] transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-2 border-b border-[#E9E4D9] pb-3">
                      <div>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                          {act.category}
                        </span>
                        <h3 className="text-base font-bold text-[#1B4332] mt-1.5">{act.title}</h3>
                        {act.cebTitle && (
                          <p className="text-xs font-semibold text-[#2D6A4F]">{act.cebTitle}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          act.status === 'Completed' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          act.status === 'In Progress' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                          act.status === 'Cancelled' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                          'bg-blue-100 text-blue-800 border border-blue-300'
                        }`}>
                          {act.status}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleOpenEditActivity(act)}
                          className="p-1.5 rounded-lg bg-[#F5FAF6] border border-[#D5CFC1] text-[#4B6259] hover:text-[#1B4332] transition-all cursor-pointer"
                          title="Edit Activity & Record Documentation"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Sigurado ka nga gusto nimong idelete ang ${act.title}?`)) {
                              onDeleteActivity(act.id);
                            }
                          }}
                          className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer"
                          title="Delete Activity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-[#4B6259] bg-[#F5FAF6] p-3 rounded-xl border border-[#E9E4D9]">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#0D47A1] shrink-0" />
                        <span>{act.scheduledDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#B26A00] shrink-0" />
                        <span>{act.scheduledTime}</span>
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#2D6A4F] shrink-0" />
                        <span className="truncate">{act.location}</span>
                      </div>
                    </div>

                    <p className="text-sm text-slate-700 leading-relaxed break-words">{act.description}</p>

                    {act.documentedNotes && (
                      <div className="bg-[#FAF8F5] border-2 border-[#E9E4D9] p-3 rounded-xl space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#4A5F57] flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          <span>{en ? 'Notes' : 'Mga Saysay'}</span>
                        </span>
                        <p className="text-xs text-slate-800 leading-relaxed break-words">{act.documentedNotes}</p>
                        {act.attendeesCount ? (
                          <span className="inline-block text-[11px] font-black text-[#2D6A4F] pt-0.5">
                            {t('Niadto', 'Attendees')}: {act.attendeesCount}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[#E9E4D9] flex flex-wrap justify-between items-center gap-2 text-[11px] text-[#5D6B54] font-semibold">
                    <span>{t('Organisasyon', 'Organizer')}: {act.organizer}</span>
                    <span>{t('Tumong', 'Audience')}: {act.targetAudience || 'AFA Members'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-[#D5CFC1] rounded-2xl p-8 text-center text-[#6A7F72]">
              No association activities or events scheduled yet.
            </div>
          )}
        </div>
      )}

      {/* CREATE ANNOUNCEMENT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#F7F4EF] border border-[#D5CFC1] w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
            <div className="bg-[#EAF4EC] px-5 py-4 border-b border-[#D5CFC1] flex justify-between items-center">
              <h3 className="font-bold text-[#1B4332] text-base">Post to Public Announcement Board</h3>
              <button
                onClick={() => setShowAddModal(false)}
                aria-label="Close announcement form"
                className="text-black hover:text-rose-700 hover:bg-rose-100 rounded-lg w-8 h-8 flex items-center justify-center text-lg font-bold border border-[#D5CFC1] bg-white transition-colors cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handlePostSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#1B4332] uppercase mb-1">Bulletin Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Schedule of Seeds & Fertilizer Distribution"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D5CFC1] rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#1B4332] uppercase mb-1">Category Type</label>
                  <select
                    value={category}
                    onChange={(e) => {
                      if (e.target.value === 'Other') setCustomCategory('');
                      setCategory(e.target.value as any);
                    }}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D5CFC1] rounded-xl text-slate-900 focus:outline-none focus:border-[#2D6A4F]"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                    <option value="Other">Other (Iba pa — type your own)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#1B4332] uppercase mb-1">Priority Badge</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D5CFC1] rounded-xl text-slate-900 focus:outline-none focus:border-[#2D6A4F]"
                  >
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="High">High Priority</option>
                  </select>
                </div>
              </div>

              {category === 'Other' && (
                <div>
                  <label className="block text-xs font-bold text-[#1B4332] uppercase mb-1">New Category Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Livestock Advisory, Cooperative Notice"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D5CFC1] rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#1B4332] uppercase mb-1">Announcement Content</label>
                <textarea
                  rows={5}
                  required
                  placeholder="Write clear, comprehensive details for the Barangay Alegria farming community..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D5CFC1] rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F] font-sans"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 text-sm font-semibold bg-white border border-[#B8CDBE] hover:bg-[#F5F8F4] text-[#1B4332] rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-sm font-black bg-[#2D6A4F] hover:bg-[#1B4332] text-white rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  Publish Broadcast
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCHEDULE / EDIT ACTIVITY MODAL */}
      {showAddActivityModal && (
        <div className="fixed inset-0 bg-[#0B1F17]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in text-left">
          <div className="bg-white w-full max-w-4xl max-h-[94vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden">

            {/* HEADER */}
            <div className="bg-[#1B4332] text-white px-5 sm:px-6 py-4 shrink-0 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-white/15 shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-base leading-tight truncate">
                    {editingActivity ? (en ? 'Edit Activity' : 'I-update ang Kalihokan') : (en ? 'Schedule Activity' : 'Schedule Bag-ong Kalihokan')}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setShowAddActivityModal(false)}
                aria-label="Close activity form"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* BODY */}
            <form onSubmit={handleSaveActivity} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-3 space-y-2.5">

                {/* TITLE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black text-[#4A5F57] uppercase tracking-wider">{en ? 'Title' : 'Titulo sa Kalihokan'}</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Organic Farming Seminar"
                      value={actTitle}
                      onChange={(e) => setActTitle(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm bg-[#FAF8F5] border-2 border-[#D5CFC1] rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black text-[#4A5F57] uppercase tracking-wider">
                      {en ? 'Bisaya Title' : 'Bisaya nga Titulo'} <span className="font-semibold normal-case text-slate-400">({en ? 'optional' : 'opsyonal'})</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Seminar sa Organikong Pag-uuma"
                      value={actCebTitle}
                      onChange={(e) => setActCebTitle(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm bg-[#FAF8F5] border-2 border-[#D5CFC1] rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black text-[#4A5F57] uppercase tracking-wider">{en ? 'Category' : 'Klase sa Kalihokan'}</label>
                    <select
                      value={actCategory}
                      onChange={(e) => setActCategory(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F5] border-2 border-[#D5CFC1] rounded-xl text-slate-900 focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-colors cursor-pointer"
                    >
                      <option value="Training / Workshop">{t('Pagbansay / Workshop', 'Training / Workshop')}</option>
                      <option value="Community Outreach">{t('Komunidad Outreach', 'Community Outreach')}</option>
                      <option value="Harvest Fair">{t('Harvest Fair', 'Harvest Fair')}</option>
                      <option value="Assembly & Fiesta">{t('Asembliya ug Pista', 'Assembly & Fiesta')}</option>
                      <option value="Livelihood Project">{t('Proyektong Panginabuhian', 'Livelihood Project')}</option>
                      <option value="Other">{t('Iba pa', 'Other')}</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black text-[#4A5F57] uppercase tracking-wider">{en ? 'Status' : 'Kahimtang'}</label>
                    <select
                      value={actStatus}
                      onChange={(e) => setActStatus(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F5] border-2 border-[#D5CFC1] rounded-xl text-slate-900 focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-colors cursor-pointer"
                    >
                      <option value="Scheduled">{t('Nakaplano', 'Scheduled')}</option>
                      <option value="In Progress">{t('Nagpadayon', 'In Progress')}</option>
                      <option value="Completed">{t('Nahuman', 'Completed')}</option>
                      <option value="Cancelled">{t('Kinansela', 'Cancelled')}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black text-[#4A5F57] uppercase tracking-wider">{en ? 'Date' : 'Petsa'}</label>
                    <input
                      type="date"
                      required
                      value={actDate}
                      onChange={(e) => setActDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F5] border-2 border-[#D5CFC1] rounded-xl text-slate-900 focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black text-[#4A5F57] uppercase tracking-wider">{en ? 'Time' : 'Oras'}</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 09:00 AM"
                      value={actTime}
                      onChange={(e) => setActTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F5] border-2 border-[#D5CFC1] rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black text-[#4A5F57] uppercase tracking-wider">{en ? 'Venue' : 'Asa Gihimo'}</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Barangay Covered Court"
                      value={actLocation}
                      onChange={(e) => setActLocation(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F5] border-2 border-[#D5CFC1] rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-[#4A5F57] uppercase tracking-wider">{en ? 'Description' : 'Paghulagway'}</label>
                  <textarea
                    rows={2}
                    required
                    placeholder={t('Katuyoan sa kalihokan...', 'Purpose of this activity...')}
                    value={actDesc}
                    onChange={(e) => setActDesc(e.target.value)}
                    className="w-full h-[64px] px-3.5 py-2 text-sm bg-[#FAF8F5] border-2 border-[#D5CFC1] rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-colors resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="block text-[11px] font-black text-[#4A5F57] uppercase tracking-wider">
                      Notes <span className="font-semibold normal-case text-slate-400">({en ? 'optional' : 'opsyonal'})</span>
                    </label>
                    <textarea
                      rows={2}
                      placeholder={en ? 'Results or agreements...' : 'Resulta o kasabutan...'}
                      value={actNotes}
                      onChange={(e) => setActNotes(e.target.value)}
                      className="w-full h-[64px] px-3.5 py-2 text-sm bg-[#FAF8F5] border-2 border-[#D5CFC1] rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-colors resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black text-[#4A5F57] uppercase tracking-wider">{en ? 'Attendees' : 'Niadto'}</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={actAttendees}
                      onChange={(e) => setActAttendees(Number(e.target.value))}
                      className="w-full h-[64px] px-3.5 text-sm bg-[#FAF8F5] border-2 border-[#D5CFC1] rounded-xl text-slate-900 focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-colors font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* FOOTER */}
              <div className="px-5 sm:px-6 py-3 bg-[#FAF8F5] border-t border-[#E9E4D9] flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddActivityModal(false)}
                  className="px-4 py-2.5 text-sm font-bold bg-white border-2 border-[#D5CFC1] text-[#1B4332] hover:bg-[#F0EDE7] rounded-xl cursor-pointer transition-colors"
                >
                  {t('Kanselahi', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-black bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl shadow-sm cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingActivity ? t('I-update', 'Save Changes') : t('I-save', 'Save Activity')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


import React, { useState } from 'react';
import { Announcement, AssociationActivity } from '../types';
import { 
  Megaphone, Plus, Trash2, Calendar, Shield, Tag, AlertTriangle, 
  CloudSun, DollarSign, Printer, CheckCircle, Clock, MapPin, 
  Users, Edit3, FileText, Check
} from 'lucide-react';

interface PioViewProps {
  announcements: Announcement[];
  activities: AssociationActivity[];
  onAddAnnouncement: (ann: Omit<Announcement, 'id' | 'datePosted'>) => void;
  onDeleteAnnouncement: (id: string) => void;
  onAddActivity: (activity: Omit<AssociationActivity, 'id'>) => void;
  onUpdateActivity: (activity: AssociationActivity) => void;
  onDeleteActivity: (id: string) => void;
  onOpenReportModal?: () => void;
}

export default function PioView({
  announcements,
  activities = [],
  onAddAnnouncement,
  onDeleteAnnouncement,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
  onOpenReportModal
}: PioViewProps) {
  const [activeTab, setActiveTab] = useState<'bulletins' | 'activities'>('bulletins');

  // Announcement State
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'General' | 'Meeting' | 'Assistance' | 'Weather' | 'Price Advisory'>('General');
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
      category,
      content,
      priority,
      postedBy: 'PIO (Ida S. Manera)'
    });

    setTitle('');
    setContent('');
    setCategory('General');
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
          <p className="text-xs text-[#4B6259] mt-1">
            Create public announcements, schedule association events, and document community activities.
          </p>
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
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {act.category}
                        </span>
                        <h3 className="text-base font-bold text-[#1B4332] mt-1.5">{act.title}</h3>
                        {act.cebTitle && (
                          <p className="text-xs font-semibold text-[#2D6A4F]">{act.cebTitle}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          act.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          act.status === 'In Progress' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          act.status === 'Cancelled' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                          'bg-blue-500/10 text-blue-400 border border-blue-500/20'
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
                        <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{act.scheduledDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>{act.scheduledTime}</span>
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{act.location}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{act.description}</p>

                    {act.documentedNotes && (
                      <div className="bg-emerald-950/30 border border-emerald-500/20 p-3 rounded-xl space-y-1 text-xs">
                        <span className="text-[10px] font-black uppercase text-emerald-400 flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          <span>Documented Outcome / Notes:</span>
                        </span>
                        <p className="text-emerald-200/90 italic">{act.documentedNotes}</p>
                        {act.attendeesCount ? (
                          <span className="inline-block text-[10px] font-bold text-emerald-400 mt-1">
                            Attendees: {act.attendeesCount} Farmers Present
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-750 flex justify-between items-center text-[11px] text-slate-500">
                    <span>Organizer: {act.organizer}</span>
                    <span>Audience: {act.targetAudience || 'AFA Members'}</span>
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
          <div className="bg-slate-800 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-slate-900 px-5 py-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-white text-base">Post to Public Announcement Board</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handlePostSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Bulletin Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Schedule of Seeds & Fertilizer Distribution"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Category Type</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Priority Badge</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="High">High Priority</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Announcement Content</label>
                <textarea
                  rows={5}
                  required
                  placeholder="Write clear, comprehensive details for the Barangay Alegria farming community..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 text-sm font-semibold bg-slate-700 hover:bg-slate-650 text-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  Publish Broadcast
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT ACTIVITY MODAL */}
      {showAddActivityModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in text-left">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-slate-900 px-5 py-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                <span>{editingActivity ? 'I-update ang Hilkutin (Edit Activity)' : 'Idugang ang Bag-ong Hilkutin (Schedule Activity)'}</span>
              </h3>
              <button 
                onClick={() => setShowAddActivityModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveActivity} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Activity Title (English)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Organic Farming & Vermicomposting Seminar"
                  value={actTitle}
                  onChange={(e) => setActTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Cebuano Title</label>
                <input
                  type="text"
                  placeholder="e.g. Seminar sa Organikong Pag-uuma ug Abuno"
                  value={actCebTitle}
                  onChange={(e) => setActCebTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Category</label>
                  <select
                    value={actCategory}
                    onChange={(e) => setActCategory(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Training / Workshop">Training / Workshop</option>
                    <option value="Community Outreach">Community Outreach</option>
                    <option value="Harvest Fair">Harvest Fair</option>
                    <option value="Assembly & Fiesta">Assembly & Fiesta</option>
                    <option value="Livelihood Project">Livelihood Project</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Status</label>
                  <select
                    value={actStatus}
                    onChange={(e) => setActStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={actDate}
                    onChange={(e) => setActDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Time</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 09:00 AM"
                    value={actTime}
                    onChange={(e) => setActTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Location</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Barangay Alegria Covered Court"
                  value={actLocation}
                  onChange={(e) => setActLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Description / Objective</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Mubo nga deskripsyon sa katuyoan sa hilkutin..."
                  value={actDesc}
                  onChange={(e) => setActDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Documented Notes / Event Outcomes (Optional):</label>
                <textarea
                  rows={2}
                  placeholder="I-rekord ang mga nahitabo, resulta, o kasabutan pagkahuman sa hilkutin..."
                  value={actNotes}
                  onChange={(e) => setActNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Attendees Count (If completed):</label>
                <input
                  type="number"
                  min={0}
                  value={actAttendees}
                  onChange={(e) => setActAttendees(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddActivityModal(false)}
                  className="flex-1 py-2.5 text-sm font-semibold bg-slate-700 hover:bg-slate-650 text-slate-200 rounded-xl cursor-pointer"
                >
                  Kanselahi
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-sm font-black bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-sm cursor-pointer"
                >
                  I-save ang Hilkutin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


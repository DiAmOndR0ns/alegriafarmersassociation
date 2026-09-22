import React, { useState, useEffect } from 'react';
import { Announcement } from '../types';
import { 
  Megaphone, Search, Bell, Calendar, Tag, CloudSun, 
  DollarSign, AlertTriangle, BookOpen, User, Phone, 
  Printer, Check, Clock, Info, Shield, Layers
} from 'lucide-react';

interface AnnouncementDashboardProps {
  announcements: Announcement[];
  onMarkAllAsRead?: () => void;
  isOfficerMode?: boolean; // Changes color theme to match officers' dark slate or members' warm green
}

export default function AnnouncementDashboard({
  announcements,
  onMarkAllAsRead,
  isOfficerMode = false
}: AnnouncementDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedPriority, setSelectedPriority] = useState<string>('All');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  
  // Track read state via local storage
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('bafa_read_announcements');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const handleReadAnnouncement = (ann: Announcement) => {
    setSelectedAnnouncement(ann);
    if (!readIds.includes(ann.id)) {
      const updated = [...readIds, ann.id];
      setReadIds(updated);
      localStorage.setItem('bafa_read_announcements', JSON.stringify(updated));
      // Dispatch custom event to trigger updates in parent if needed
      window.dispatchEvent(new Event('bafa_announcements_updated'));
    }
  };

  const handleMarkAllRead = () => {
    const allIds = announcements.map(ann => ann.id);
    setReadIds(allIds);
    localStorage.setItem('bafa_read_announcements', JSON.stringify(allIds));
    window.dispatchEvent(new Event('bafa_announcements_updated'));
    if (onMarkAllAsRead) onMarkAllAsRead();
  };

  // Listen to external updates to read state
  useEffect(() => {
    const handleUpdate = () => {
      try {
        const stored = localStorage.getItem('bafa_read_announcements');
        if (stored) setReadIds(JSON.parse(stored));
      } catch (e) {}
    };
    window.addEventListener('bafa_announcements_updated', handleUpdate);
    return () => window.removeEventListener('bafa_announcements_updated', handleUpdate);
  }, []);

  const getCategoryIcon = (category: string, sizeClass = "w-4 h-4") => {
    switch (category) {
      case 'Meeting':
        return <Calendar className={`${sizeClass} text-purple-500`} />;
      case 'Assistance':
        return <Tag className={`${sizeClass} text-emerald-500`} />;
      case 'Weather':
        return <CloudSun className={`${sizeClass} text-amber-500`} />;
      case 'Price Advisory':
        return <DollarSign className={`${sizeClass} text-blue-500`} />;
      default:
        return <Megaphone className={`${sizeClass} text-slate-500`} />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'Meeting':
        return { en: 'Meeting Notice', ceb: 'Pahibalo sa Tigom' };
      case 'Assistance':
        return { en: 'Farmer Assistance', ceb: 'Tabang sa Mag-uuma' };
      case 'Weather':
        return { en: 'Weather Warning', ceb: 'Pahidaan sa Panahon' };
      case 'Price Advisory':
        return { en: 'Crop Price Advisory', ceb: 'Presyo sa Merkado' };
      default:
        return { en: 'General Bulletin', ceb: 'Kinatibuk-ang Pahibalo' };
    }
  };

  // Filter logic
  const filteredAnnouncements = announcements.filter(ann => {
    const matchesSearch = ann.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          ann.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ann.postedBy.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'All' || ann.category === selectedCategory;
    const matchesPriority = selectedPriority === 'All' || ann.priority === selectedPriority;
    
    return matchesSearch && matchesCategory && matchesPriority;
  });

  // Calculate statistics for the dashboard highlights
  const totalCount = announcements.length;
  const unreadCount = announcements.filter(ann => !readIds.includes(ann.id)).length;
  const highPriorityCount = announcements.filter(ann => ann.priority === 'High').length;
  const assistanceCount = announcements.filter(ann => ann.category === 'Assistance').length;
  const priceAdvisoryCount = announcements.filter(ann => ann.category === 'Price Advisory').length;

  // Colors based on theme mode
  const theme = {
    bg: isOfficerMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900',
    cardBg: isOfficerMode ? 'bg-slate-800 border-slate-700/80' : 'bg-bafa-neutral-50 border-bafa-neutral-200',
    cardHover: isOfficerMode ? 'hover:border-slate-600 hover:bg-slate-800/80' : 'hover:border-bafa-700 hover:bg-white',
    inputBg: isOfficerMode ? 'bg-slate-950 border-slate-750 text-white' : 'bg-white border-bafa-neutral-300 text-bafa-neutral-800',
    headerText: isOfficerMode ? 'text-white' : 'text-bafa-700',
    subText: isOfficerMode ? 'text-slate-400' : 'text-bafa-neutral-700',
    accentText: isOfficerMode ? 'text-emerald-400' : 'text-bafa-coral-600',
    accentBg: isOfficerMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-bafa-gold-200 text-bafa-coral-600',
    primaryButton: isOfficerMode ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-bafa-700 hover:bg-bafa-800 text-white',
    badgeSecondary: isOfficerMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-bafa-100 text-bafa-700 border-bafa-300'
  };

  const handlePrintAnnouncement = (ann: Announcement) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const catLabel = getCategoryLabel(ann.category);
    printWindow.document.write(`
      <html>
        <head>
          <title>AFA Bulletin - ${ann.title}</title>
          <style>
            body { font-family: 'Inter', system-ui, sans-serif; padding: 40px; color: #2d3748; line-height: 1.6; }
            .header { border-bottom: 3px double #1b4332; padding-bottom: 20px; margin-bottom: 30px; text-align: center; }
            .title { font-size: 24px; font-weight: bold; color: #1b4332; margin-top: 10px; text-transform: uppercase; }
            .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 15px; margin-bottom: 35px; font-size: 13px; background: #faf8f5; padding: 15px; border-radius: 8px; border: 1px solid #e9e4d9; }
            .meta-item { margin: 4px 0; }
            .content { font-size: 16px; white-space: pre-line; text-align: justify; margin-bottom: 40px; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; text-align: center; color: #718096; }
            .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
            .high { background: #fee2e2; color: #991b1b; }
            .medium { background: #fef3c7; color: #92400e; }
            .low { background: #f1f5f9; color: #334155; }
          </style>
        </head>
        <body>
          <div class="header">
            <h3 style="margin:0; font-size:12px; letter-spacing:1.5px; color:#555;">ALEGRIA FARMERS ASSOCIATION (AFA)</h3>
            <div style="font-size:11px; color:#666;">Tuburan, Cebu Province, Philippines</div>
            <div class="title">${ann.title}</div>
          </div>
          
          <div class="meta-grid">
            <div>
              <div class="meta-item"><strong>Category (Kategorya):</strong> ${catLabel.en} (${catLabel.ceb})</div>
              <div class="meta-item"><strong>Priority (Lebel):</strong> <span class="badge ${ann.priority.toLowerCase()}">${ann.priority} Priority</span></div>
            </div>
            <div style="text-align: right;">
              <div class="meta-item"><strong>Date Posted (Adlaw):</strong> ${ann.datePosted}</div>
              <div class="meta-item"><strong>Posted By (Nag-post):</strong> ${ann.postedBy}</div>
            </div>
          </div>

          <div class="content">
            ${ann.content}
          </div>

          <div class="footer">
            <p>This is an official broadcast from the Alegria Farmers Association Bulletin Board Portal.</p>
            <p>© 2026 Alegria Farmers Association • Tuburan, Cebu</p>
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
    <div id="announcement-dashboard-container" className="space-y-4">
      
      {/* HEADER WITH ACTION ROW */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 text-left">
        <div>
          <h2 className={`text-xl font-black ${theme.headerText} flex items-center gap-2.5 font-display`}>
            <Megaphone className={`w-6 h-6 ${isOfficerMode ? 'text-emerald-400' : 'text-[#E65100]'}`} />
            <span>Announcements</span>
          </h2>
          <p className={`text-xs ${theme.subText} mt-1 font-medium`}>
            View official updates, assistance notices, and market information from the Public Information Officer.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            id="mark-all-read-btn"
            onClick={handleMarkAllRead}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
              isOfficerMode 
                ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700' 
                : 'bg-[#EAF4EC] hover:bg-[#D8F3DC] text-[#1B4332] border-[#2D6A4F]/25'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>Basahon Tanan (Mark All as Read)</span>
          </button>
        )}
      </div>

      {/* STATISTICS HIGHLIGHT BENTO BLOCKS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-left">
        
        {/* Total Announcements block */}
        <div className={`p-4 rounded-2xl border ${theme.cardBg} flex flex-col space-y-1.5 shadow-sm relative overflow-hidden`}>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Total</span>
            <BookOpen className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <span className="text-2xl font-black block leading-none">{totalCount}</span>
            <span className="text-[9px] text-slate-400 block mt-1">Official bulletins</span>
          </div>
        </div>

        {/* Unread block */}
        <div className={`p-4 rounded-2xl border ${theme.cardBg} flex flex-col space-y-1.5 shadow-sm relative overflow-hidden`}>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Unread</span>
            <Bell className={`w-4 h-4 ${unreadCount > 0 ? 'text-amber-500 animate-swing' : 'text-slate-400'}`} />
          </div>
          <div>
            <span className={`text-2xl font-black block leading-none ${unreadCount > 0 ? theme.accentText : ''}`}>
              {unreadCount}
            </span>
            <span className="text-[9px] text-slate-400 block mt-1">Not yet read</span>
          </div>
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 w-3 h-3 bg-amber-500 rounded-bl-xl" />
          )}
        </div>

        {/* Urgent Warnings block */}
        <div className={`p-4 rounded-2xl border ${theme.cardBg} flex flex-col space-y-1.5 shadow-sm relative overflow-hidden`}>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Urgent</span>
            <AlertTriangle className={`w-4 h-4 ${highPriorityCount > 0 ? 'text-rose-500' : 'text-slate-400'}`} />
          </div>
          <div>
            <span className={`text-2xl font-black block leading-none ${highPriorityCount > 0 ? 'text-rose-500' : ''}`}>
              {highPriorityCount}
            </span>
            <span className="text-[9px] text-slate-400 block mt-1">Needs attention</span>
          </div>
        </div>

        {/* Assistance programs block */}
        <div className={`p-4 rounded-2xl border ${theme.cardBg} flex flex-col space-y-1.5 shadow-sm relative overflow-hidden`}>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Assistance</span>
            <Tag className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <span className="text-2xl font-black text-emerald-600 block leading-none">{assistanceCount}</span>
            <span className="text-[9px] text-slate-400 block mt-1">Seeds, materials, support</span>
          </div>
        </div>

        {/* Price Advisories block */}
        <div className={`p-4 rounded-2xl border ${theme.cardBg} col-span-2 lg:col-span-1 flex flex-col space-y-1.5 shadow-sm relative overflow-hidden`}>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Market</span>
            <DollarSign className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <span className="text-2xl font-black text-blue-600 block leading-none">{priceAdvisoryCount}</span>
            <span className="text-[9px] text-slate-400 block mt-1">Price updates</span>
          </div>
        </div>

      </div>

      {/* FILTER & SEARCH CONTROL BAR */}
      <div className={`p-3.5 rounded-2xl border ${theme.cardBg} flex flex-col md:flex-row gap-3 items-stretch md:items-center text-left`}>
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <input
            id="bulletin-search-input"
            type="text"
            placeholder="Pangitaa ang anunsyo o balita... (Search titles or details...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-600/30 ${theme.inputBg}`}
          />
        </div>

        {/* Category Filter */}
        <div className="space-y-1 w-full md:w-52">
          <label className="block text-[9px] font-black text-slate-400 uppercase">Kategorya (Category)</label>
          <select
            id="category-filter-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={`w-full px-3 py-2 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-600/30 ${theme.inputBg} font-bold`}
          >
            <option value="All">Tanan Kategorya (All Categories)</option>
            <option value="Price Advisory">Presyo sa Merkado (Price Advisory)</option>
            <option value="Assistance">Tabang sa Mag-uuma (Farmer Assistance)</option>
            <option value="Weather">Kondisyon sa Panahon (Weather Warning)</option>
            <option value="Meeting">Pahibalo sa Tigom (Meeting Notice)</option>
            <option value="General">Kinatibuk-ang Pahibalo (General)</option>
          </select>
        </div>

        {/* Priority Filter */}
        <div className="space-y-1 w-full md:w-44">
          <label className="block text-[9px] font-black text-slate-400 uppercase">Lebel sa Importansya (Priority)</label>
          <select
            id="priority-filter-select"
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className={`w-full px-3 py-2 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-600/30 ${theme.inputBg} font-bold`}
          >
            <option value="All">Tanan Importansya (All Priorities)</option>
            <option value="High">Dinalian / High Priority</option>
            <option value="Medium">Katamtaman / Medium Priority</option>
            <option value="Low">Ubos / Low Priority</option>
          </select>
        </div>
      </div>

      {/* DASHBOARD LAYOUT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
        
        {/* LEFT COMPONENT: BULLETIN CARDS LISTING (8 columns) */}
        <div className="lg:col-span-8 space-y-3">
          {filteredAnnouncements.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredAnnouncements.map((ann) => {
                const isRead = readIds.includes(ann.id);
                const cebLabel = getCategoryLabel(ann.category).ceb;
                
                // Priority specific classes
                const priorityStyles = {
                  High: 'border-red-400 hover:border-red-500 bg-red-500/[0.02]',
                  Medium: 'border-amber-300 hover:border-amber-400 bg-amber-500/[0.01]',
                  Low: ''
                };

                return (
                  <div
                    key={ann.id}
                    id={`bulletin-card-${ann.id}`}
                    onClick={() => handleReadAnnouncement(ann)}
                    className={`border rounded-2xl p-4 text-left flex flex-col transition-all cursor-pointer shadow-sm relative group ${
                      theme.cardBg
                    } ${theme.cardHover} ${priorityStyles[ann.priority] || ''}`}
                  >
                    <div>
                      {/* Badge Row */}
                      <div className="flex justify-between items-start gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5 mb-3">
                        <div className="flex items-center gap-1.5">
                          {getCategoryIcon(ann.category)}
                          <span className={`text-[10px] font-black uppercase tracking-wider block ${isOfficerMode ? 'text-slate-300' : 'text-slate-500'}`}>
                            {cebLabel}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          {ann.priority === 'High' && (
                            <span className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                              DINALIAN
                            </span>
                          )}
                          {!isRead && (
                            <span className="bg-amber-500 text-white font-black text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-0.5 shadow-sm">
                              <span className="w-1 h-1 rounded-full bg-white animate-ping" />
                              Bag-o
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title & Date */}
                      <h3 className={`text-sm sm:text-base font-extrabold ${theme.headerText} tracking-tight leading-snug group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors`}>
                        {ann.title}
                      </h3>
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400 font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Gi-post noong: {ann.datePosted}</span>
                      </div>

                      {/* Content Preview */}
                      <p className={`text-xs ${theme.subText} mt-3.5 line-clamp-3 leading-relaxed`}>
                        {ann.content}
                      </p>
                    </div>

                    {/* Footer Row */}
                    <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[10px] text-slate-400">
                      <span className="font-semibold">Ni: {ann.postedBy}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-extrabold group-hover:underline flex items-center gap-0.5">
                        Basaha <span className="text-xs">→</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={`border border-dashed p-12 rounded-3xl text-center ${theme.cardBg}`}>
              <Megaphone className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="font-bold text-slate-400 text-sm">Walay anunsyo nga nakit-an (No announcements found)</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                Sulayi pag-usab ang imong mga filters o pag-search og laing pulong.
              </p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: INFORMATION CORNER (4 columns) */}
        <div className="lg:col-span-4 space-y-4 text-left">
          
          {/* PIO Broadcast Info Desk */}
          <div className={`p-5 rounded-3xl border ${theme.cardBg} space-y-4 shadow-sm`}>
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <User className="w-4.5 h-4.5 text-slate-400" />
              <span>Public Information & Media Desk</span>
            </h3>

            <div className="space-y-3.5 text-xs">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-xl bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center shrink-0">
                  <span className="font-black text-slate-600 text-sm">I</span>
                </div>
                <div>
                  <h4 className={`font-black text-sm ${isOfficerMode ? 'text-white' : 'text-[#1B4332]'}`}>Ida S Manera</h4>
                  <p className={`text-[10px] ${isOfficerMode ? 'text-slate-300' : 'text-slate-500'}`}>Public Information Officer (PIO), AFA</p>
                </div>
              </div>

              <p className={`leading-relaxed text-[11.5px] ${theme.subText}`}>
                Ako ang inyong tig-balita sa asosasyon. Kung duna moy pangutana mahitungod sa semilya, abono, o tabang agrikultura gikan sa munisipyo sa Tuburan, mahimo ninyo akong tawgan o pakit-on sa akong opisina sa barangay.
              </p>

              <div className="space-y-2 pt-1">
                <a 
                  href="tel:09176543210"
                  className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs font-bold transition-all ${
                    isOfficerMode 
                      ? 'bg-slate-900 border-slate-800 hover:border-slate-750' 
                      : 'bg-white border-[#E9E4D9] hover:border-[#1B4332]'
                  }`}
                >
                  <Phone className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div>
                    <span className="block text-[8px] text-slate-400 uppercase leading-none">Pindota para Tawgan (Mobile)</span>
                    <span className="block text-slate-700 dark:text-slate-200 font-mono">0917-654-3210</span>
                  </div>
                </a>

                <div 
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-[10px] ${
                    isOfficerMode ? 'bg-slate-900/50 border-slate-800' : 'bg-[#FFF8E1]/40 border-[#FFE082]'
                  }`}
                >
                  <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-slate-500 dark:text-slate-400 leading-normal">
                    <strong>Pahinumdom:</strong> Ang tinuod nga presyo sa Copra ug Mais mag-agad sa matag semana nga advisory gikan sa Departamento sa Agrikultura (DA).
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Association Help / Guidelines */}
          <div className={`p-5 rounded-3xl border ${theme.cardBg} space-y-4.5 shadow-sm`}>
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <Shield className="w-4.5 h-4.5 text-slate-400" />
              <span>Giya sa Pag-angkon og Benepisyo</span>
            </h3>

            <div className="space-y-3 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              <div className="flex gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 font-black text-[10px] flex items-center justify-center shrink-0">1</div>
                <p>
                  <strong>I-check ang imong ID:</strong> Siguroha nga ang imong Membership Card balido ug bayad ang imong tinuig nga PHP 100 amot.
                </p>
              </div>

              <div className="flex gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 font-black text-[10px] flex items-center justify-center shrink-0">2</div>
                <p>
                  <strong>I-print ang Sertipiko:</strong> Kung duna kay claimon nga subsidiyong liso o abono, i-print ang sertipiko ug dad-on sa Barangay Hall.
                </p>
              </div>

              <div className="flex gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 font-black text-[10px] flex items-center justify-center shrink-0">3</div>
                <p>
                  <strong>Paminaw sa Anunsyo:</strong> Ang balita gikan sa LGU o AFA officers i-update diri kada semana para dili ka masaypan sa apod-apod.
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* ANNOUNCEMENT READ DETAIL MODAL */}
      {selectedAnnouncement && (
        <div 
          id="bulletin-read-modal"
          className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
        >
          <div 
            className={`w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border ${
              isOfficerMode ? 'bg-slate-900 border-slate-750 text-white' : 'bg-white border-[#E9E4D9] text-[#2D3A22]'
            }`}
          >
            {/* Modal Header */}
            <div className="bg-slate-950/40 px-6 py-4.5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center text-left">
              <div className="flex items-center gap-2">
                {getCategoryIcon(selectedAnnouncement.category, "w-5 h-5")}
                <span className="text-[11px] font-black tracking-widest text-slate-400 uppercase">
                  {getCategoryLabel(selectedAnnouncement.category).en}
                </span>
              </div>
              <button 
                id="close-bulletin-modal-btn"
                onClick={() => setSelectedAnnouncement(null)}
                className="text-slate-400 hover:text-white dark:hover:text-slate-100 text-2xl font-bold p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 sm:p-8 space-y-6 text-left max-h-[75vh] overflow-y-auto">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[9.5px] font-black px-2.5 py-0.5 rounded-lg border uppercase tracking-wider ${
                    selectedAnnouncement.category === 'Price Advisory' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                    selectedAnnouncement.category === 'Assistance' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                    selectedAnnouncement.category === 'Weather' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                    selectedAnnouncement.category === 'Meeting' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                    'bg-slate-100 text-slate-800 border-slate-200'
                  }`}>
                    {selectedAnnouncement.category}
                  </span>

                  {selectedAnnouncement.priority === 'High' && (
                    <span className="bg-red-600 text-white font-black text-[9px] tracking-widest px-2.5 py-0.5 rounded-lg uppercase">
                      DINALIAN / HIGH PRIORITY
                    </span>
                  )}
                </div>

                <h2 className={`text-lg sm:text-2xl font-black ${theme.headerText} tracking-tight leading-tight`}>
                  {selectedAnnouncement.title}
                </h2>

                <div className={`grid grid-cols-2 gap-4 p-3.5 rounded-2xl border text-[11px] font-medium ${isOfficerMode ? 'bg-slate-950/40 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                  <div>
                    <p>Adlaw nga Gi-post (Date Posted):</p>
                    <strong className={`block text-xs mt-0.5 ${isOfficerMode ? 'text-slate-200' : 'text-slate-800'}`}>{selectedAnnouncement.datePosted}</strong>
                  </div>
                  <div>
                    <p>Nag-post sa Bulletin (Posted By):</p>
                    <strong className={`block text-xs mt-0.5 ${isOfficerMode ? 'text-slate-200' : 'text-slate-800'}`}>{selectedAnnouncement.postedBy}</strong>
                  </div>
                </div>
              </div>

              {/* Real content */}
              <div className={`text-sm leading-relaxed whitespace-pre-line text-justify font-sans ${theme.subText} p-1`}>
                {selectedAnnouncement.content}
              </div>

              {/* Action Buttons */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-5 flex flex-col sm:flex-row gap-3">
                <button
                  id="print-bulletin-btn"
                  onClick={() => handlePrintAnnouncement(selectedAnnouncement)}
                  className="flex-1 py-3 px-4 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-300"
                >
                  <Printer className="w-4 h-4" />
                  <span>I-print kini nga Anunsyo (Print Bulletin)</span>
                </button>

                <button
                  id="dismiss-bulletin-btn"
                  onClick={() => setSelectedAnnouncement(null)}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-colors cursor-pointer text-center ${theme.primaryButton}`}
                >
                  Nahibal-an Na / Sige (Understood / Close)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

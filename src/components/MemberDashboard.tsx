import React, { useState, useRef, useEffect } from 'react';
import { User, Announcement, HogRaisingState, IgpChoreLog, Member, Product, AssociationActivity } from '../types';
import { 
  User as UserIcon, MapPin, Smartphone, Layers, Tag, Calendar, 
  Printer, Upload, LogOut, FileText, CheckCircle, CreditCard, 
  AlertCircle, Award, ShieldCheck, Trash2, Image as ImageIcon, Check, Sprout, Landmark, Building,
  Megaphone, Search, Bell, ChevronDown, ChevronUp, Briefcase, ShoppingBag, Clock, Coffee,  ChevronLeft, ChevronRight
} from 'lucide-react';
import AnnouncementDashboard from './AnnouncementDashboard';
import HogRaisingIgpTracker from './HogRaisingIgpTracker';

interface MemberDashboardProps {
  currentUser: User;
  onLogout: () => void;
  onUpdateProfile: (updatedUser: User) => void;
  toast: (message: string, type: 'success' | 'warning' | 'info' | 'error') => void;
  announcements?: Announcement[];
  hogRaisingState: HogRaisingState;
  members: Member[];
  onAddChoreLog: (chore: Omit<IgpChoreLog, 'id'>) => void;
  products?: Product[];
  activities?: AssociationActivity[];
}

const SITIOS = [
  'Sitio Tapon',
  'Sitio Pundok 1',
  'Sitio Pundok 2',
  'Sitio Lamak'
];

const CROPS_AND_LIVESTOCK = [
  'Corn (Mais)',
  'Coconut (Lubi)',
  'Cacao',
  'Tuburan Coffee',
  'Vegetables (Utanon)',
  'Cassava (Kamoteng Kahoy)',
  'Hog Raising (Baboyan)',
  'Poultry Raising (Manokan)',
  'Goat Raising (Kanding)'
];

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80', // Female Farmer
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80', // Male Farmer
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80', // Elder Farmer
  'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?auto=format&fit=crop&w=150&q=80'  // Young Farmer
];

export default function MemberDashboard({ 
  currentUser, 
  onLogout, 
  onUpdateProfile, 
  toast, 
  announcements = [],
  hogRaisingState,
  members,
  onAddChoreLog,
  products = [],
  activities = []
}: MemberDashboardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(currentUser.name);
  const [contact, setContact] = useState(currentUser.contactNumber || '');
  const [sitio, setSitio] = useState(currentUser.farmLocation || SITIOS[0]);
  const [selectedCrops, setSelectedCrops] = useState<string[]>(currentUser.primaryCrops || []);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'announcements' | 'hog-raising' | 'products' | 'activities'>('profile');

  // Announcement state hooks
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [expandedAnnouncementId, setExpandedAnnouncementId] = useState<string | null>(null);
  const [collapsedProductIds, setCollapsedProductIds] = useState<string[]>(() => 
    products.filter(p => p.isPublished).map(p => p.id)
  );
  const [readAnnouncements, setReadAnnouncements] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('bafa_read_announcements');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const markAsRead = (id: string) => {
    if (!readAnnouncements.includes(id)) {
      const updated = [...readAnnouncements, id];
      setReadAnnouncements(updated);
      localStorage.setItem('bafa_read_announcements', JSON.stringify(updated));
    }
  };

  // Generate a membership code based on signup date or user id
  const memberCode = `AFA-${currentUser.joinedDate?.replace(/-/g, '').substring(2, 6) || '2026'}-${currentUser.id.split('-')[1]?.substring(0, 4).toUpperCase() || 'M024'}`;

  // Form submit handler
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('Palihug isulod ang imong ngalan (Name is required).', 'error');
      return;
    }

    onUpdateProfile({
      ...currentUser,
      name: name.trim(),
      contactNumber: contact.trim(),
      farmLocation: sitio,
      primaryCrops: selectedCrops
    });

    setIsEditing(false);
    toast('Naluwas na ang bag-ong detalye sa imong profile (Profile saved)!', 'success');
  };

  const handleCropToggle = (crop: string) => {
    if (selectedCrops.includes(crop)) {
      setSelectedCrops(selectedCrops.filter(c => c !== crop));
    } else {
      setSelectedCrops([...selectedCrops, crop]);
    }
  };

  // Process Avatar Files
  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast('Palihug pagpili og tinuod nga hulagway (PNG/JPG).', 'error');
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      toast('Sobra kadako ang hulagway. Kinahanglan ubos sa 2MB (File size exceeds 2MB limit).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Url = e.target?.result as string;
      onUpdateProfile({
        ...currentUser,
        avatarUrl: base64Url
      });
      toast('Nabag-o na ang imong hulagway (Profile photo updated)!', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const selectPresetAvatar = (url: string) => {
    onUpdateProfile({
      ...currentUser,
      avatarUrl: url
    });
    toast('Nahi-select ang hulagway!', 'success');
  };

  const removeAvatar = () => {
    onUpdateProfile({
      ...currentUser,
      avatarUrl: undefined
    });
    toast('Natangtang ang hulagway.', 'info');
  };

  const handlePrintCredentials = () => {
    const originalTitle = document.title;
    document.title = `AFA_ID_${currentUser.name.replace(/\s+/g, '_')}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  useEffect(() => {
    const productIds = products.filter(p => p.isPublished).map(p => p.id);
    setCollapsedProductIds((current) => {
      if (current.length === 0) return productIds;
      return productIds.filter((id) => current.includes(id) || productIds.includes(id));
    });
  }, [products]);

  return (
    <div id="member-dashboard-root" className="space-y-4 text-[#2D3A22]">
      
      {/* HEADER ACTION AREA */}
      <div className="bg-[#EAF4EC] text-[#1B4332] p-5 rounded-3xl border-2 border-[#2D6A4F]/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print text-left shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-[#1B4332] text-[#D8F3DC] text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              AFA Regular Member            </span>
            <span className="bg-amber-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-sm">
              <ShieldCheck className="w-3 h-3" />
              Active Member
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#1B4332] mt-2 font-display">
            Welcome, {currentUser.name}!
          </h2>
          <p className="text-xs sm:text-sm text-[#33473d] mt-1 max-w-xl font-medium">
            This is your official member portal. You can update your profile photo, register farm parcels, view attendance dividends, and print your certified AFA membership ID.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 no-print" />

        {/* Right Arrow Indicator */}
        <div className="hidden sm:flex absolute right-0 z-10 p-1 bg-gradient-to-l from-[#FAF8F5] via-[#FAF8F5] to-transparent items-center text-[#1B4332]">
          <ChevronRight className="w-5 h-5 text-[#BF360C] animate-bounce-x" />
        </div>
      </div>

      {activeTab === 'profile' && (
        /* DASHBOARD GRID */
        <div id="member-profile-panel" className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start no-print text-left">
        
        {/* LEFT COLUMN: PROFILE MANAGEMENT (5 columns) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* PROFILE PHOTO UPLOADER */}
          <div className="bg-white border border-[#E9E4D9] hover:border-[#1B4332] hover:shadow-md transition-all duration-200 rounded-3xl p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-black text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#F0EBE1] pb-2">
              <ImageIcon className="w-4.5 h-4.5 text-[#1B4332]" />
              <span>Imong Hulagway (Official Photograph)</span>
            </h3>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Image Preview Container */}
              <div className="relative shrink-0">
                <div className="w-24 h-24 rounded-2xl bg-[#FAF8F5] border-2 border-[#D5CFC1] overflow-hidden flex items-center justify-center">
                  {currentUser.avatarUrl ? (
                    <img 
                      src={currentUser.avatarUrl} 
                      alt={currentUser.name} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-[#85947E]">
                      <UserIcon className="w-8 h-8 stroke-[1.5]" />
                      <span className="text-[8px] mt-1 uppercase font-extrabold tracking-wider">No Photo</span>
                    </div>
                  )}
                </div>

                {currentUser.avatarUrl && (
                  <button
                    onClick={removeAvatar}
                    className="absolute -top-1.5 -right-1.5 bg-[#D32F2F] hover:bg-red-700 text-white p-1 rounded-lg transition-all shadow-md cursor-pointer"
                    title="Remove photograph"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Drag n Drop Upload box */}
              <div className="flex-1 w-full space-y-2">
                <div 
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`py-3 px-3 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
                    isDragging 
                      ? 'border-[#1B4332] bg-[#EAF4EC]' 
                      : 'border-[#D5CFC1] bg-[#FAF8F5] hover:border-[#1B4332] hover:bg-white'
                  }`}
                >
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                  <Upload className="w-4 h-4 text-[#85947E] mx-auto mb-1" />
                  <p className="text-[10px] text-[#1B4332] font-extrabold">Pindota diri para mag-upload</p>
                  <p className="text-[8px] text-[#85947E] mt-0.5">PNG o JPG. Ubos sa 2MB.</p>
                </div>

                {/* Preset selectors for easier testing */}
                <div className="space-y-1">
                  <p className="text-[9px] text-[#85947E] font-bold text-center">O pagpili og dali nga hulagway sa ubos:</p>
                  <div className="flex justify-center gap-1.5">
                    {PRESET_AVATARS.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => selectPresetAvatar(url)}
                        className={`w-8 h-8 rounded-lg overflow-hidden border transition-all cursor-pointer ${
                          currentUser.avatarUrl === url ? 'border-[#1B4332] scale-105 shadow-sm' : 'border-[#D5CFC1] hover:border-[#85947E]'
                        }`}
                      >
                        <img src={url} alt="preset" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PROFILE DETAILS FORM */}
          <div className="bg-white border border-[#E9E4D9] rounded-3xl p-5 space-y-4 shadow-sm">
            <div className="flex justify-between items-center border-b border-[#F0EBE1] pb-2">
              <h3 className="text-xs font-black text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4.5 h-4.5 text-[#1B4332]" />
                <span>Rehistro sa imong Uma (Agricultural Registry)</span>
              </h3>

              {!isEditing && (
                <button
                  onClick={() => {
                    setName(currentUser.name);
                    setContact(currentUser.contactNumber || '');
                    setSitio(currentUser.farmLocation || SITIOS[0]);
                    setSelectedCrops(currentUser.primaryCrops || []);
                    setIsEditing(true);
                  }}
                  className="text-xs text-[#E65100] hover:underline font-extrabold cursor-pointer"
                >
                  Usaba (Edit)
                </button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="space-y-3.5 text-left">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-[#4F5E46] uppercase">Tibuok Ngalan (Full Name)</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#D5CFC1] rounded-xl text-[#2D3A22] focus:outline-none focus:border-[#1B4332] font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-[#4F5E46] uppercase">Telepono (Contact Number)</label>
                  <input
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="e.g. 0917-000-0000"
                    className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#D5CFC1] rounded-xl text-[#2D3A22] focus:outline-none focus:border-[#1B4332] font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-[#4F5E46] uppercase">Sitio / Lokasyon</label>
                  <select
                    value={sitio}
                    onChange={(e) => setSitio(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#D5CFC1] rounded-xl text-[#2D3A22] focus:outline-none focus:border-[#1B4332] font-semibold"
                  >
                    {SITIOS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-[#4F5E46] uppercase mb-1">Unsay imong Gipananom / Buhi?</label>
                  <div className="grid grid-cols-2 gap-1.5 bg-[#FAF8F5] p-2.5 rounded-xl border border-[#D5CFC1] max-h-28 overflow-y-auto">
                    {CROPS_AND_LIVESTOCK.map((crop) => (
                      <label key={crop} className="flex items-center gap-1.5 cursor-pointer text-xs text-[#2D3A22] hover:text-[#1B4332] select-none font-medium">
                        <input
                          type="checkbox"
                          checked={selectedCrops.includes(crop)}
                          onChange={() => handleCropToggle(crop)}
                          className="rounded border-[#D5CFC1] bg-white text-[#1B4332] focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                        />
                        <span>{crop}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1.5">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm text-center"
                  >
                    I-save Detalye
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-white border border-[#D5CFC1] hover:bg-[#FAF8F5] text-[#85947E] rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                  >
                    Kansela
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-left text-sm">
                <div className="grid grid-cols-2 gap-4 bg-[#FAF8F5] p-4 rounded-2xl border border-[#D5CFC1]">
                  <div>
                    <span className="block text-xs text-[#2D3A22] uppercase font-black tracking-wider mb-1">Ngalan sa Mag-uuma (Name)</span>
                    <span className="font-extrabold text-[#1B4332] text-base">{currentUser.name}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-[#2D3A22] uppercase font-black tracking-wider mb-1">Contact Number</span>
                    <span className="font-bold text-slate-900 text-sm">{currentUser.contactNumber || 'Walay Telepono'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#D5CFC1]">
                    <span className="block text-xs text-[#2D3A22] uppercase font-black tracking-wider flex items-center gap-1 mb-1">
                      <MapPin className="w-3.5 h-3.5 text-[#1B4332]" />
                      Sitio / Dapit
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{currentUser.farmLocation}</span>
                  </div>
                  <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#D5CFC1]">
                    <span className="block text-xs text-[#2D3A22] uppercase font-black tracking-wider flex items-center gap-1 mb-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#1B4332]" />
                      RSBSA Status
                    </span>
                    <span className="font-mono font-bold text-[#1B4332] text-sm truncate block" title={currentUser.rsbsaNumber || 'Enrolled'}>
                      {currentUser.rsbsaNumber || (currentUser.isRsbsaRegistered ? 'RSBSA Enrolled' : 'Pending RSBSA')}
                    </span>
                  </div>
                </div>

                <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#D5CFC1] space-y-2">
                  <span className="block text-xs text-[#2D3A22] uppercase font-black tracking-wider flex items-center gap-1 mb-1">
                    <Tag className="w-3.5 h-3.5 text-[#1B4332]" />
                    Mga Produkto nga Gipang-uma
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentUser.primaryCrops && currentUser.primaryCrops.length > 0 ? (
                      currentUser.primaryCrops.map(crop => (
                        <span key={crop} className="text-xs bg-[#D8F3DC] text-[#1B4332] px-3 py-1 rounded-lg border border-[#1B4332]/30 font-extrabold">
                          {crop}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-700 italic font-medium">Wala pay natala nga produkto.</span>
                    )}
                  </div>
                </div>

                <div className="bg-[#FFF8E1] border border-[#FFE082] p-4 rounded-2xl text-xs text-[#5D4037] space-y-2">
                  <span className="font-black text-[#5D4037] block text-xs">Koda sa Membership (ID Code):</span>
                  <div className="bg-white px-3 py-2 rounded-lg border border-[#FFE082] font-mono text-sm text-center text-[#BF360C] select-all font-black shadow-inner">
                    {memberCode}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-[#5D4037] font-semibold">
                    <Calendar className="w-4 h-4 text-[#BF360C]" />
                    <span>Nagsugod: {currentUser.joinedDate}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: DIGITAL CREDENTIALS PREVIEW & SUITE ACTIONS (7 columns) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* MEMBERSHIP VALIDITY WARNING */}
          <div className="bg-[#FFF8E1] border border-[#FFE082] p-4 rounded-2xl flex gap-3 text-left">
            <AlertCircle className="w-5.5 h-5.5 text-[#FFB300] shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-[#5D4037]">
              <h4 className="font-black">Tinuig nga Amot ug Katungod (Annual Renewal)</h4>
              <p className="leading-relaxed text-[#6D4C41]">
                Sigon sa balaod sa atong AFA, ang imong membership balido sulod sa **usa ka (1) tuig**. Kada dapit sa **Disyembre**, ang atong Tesorero (Gracelyn P Asendiente) mangolekta og **PHP 100.00** nga tinuig nga amot para sa pag-renew sa imong mga benepisyo.
              </p>
              <div className="pt-1 text-[10px] font-black text-[#1B4332] flex items-center gap-1 uppercase">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span>Karon nga Status: Bayad na para sa tuig 2026 (Active)</span>
              </div>
            </div>
          </div>

          {/* ASSOCIATION ANNOUNCEMENTS & BULLETIN BOARD */}
          <div id="bulletin-board-section" className="bg-white border border-[#D5CFC1] rounded-3xl p-5 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#FAF8F5] pb-3 text-left">
              <div>
                <h3 className="text-base font-black text-[#1B4332] flex items-center gap-2 font-display">
                  <Megaphone className="w-5.5 h-5.5 text-[#BF360C]" />
                  <span>Mga Anunsyo ug Balita alang sa Mag-uuma</span>
                </h3>
                <p className="text-xs sm:text-sm text-[#2D3A22] mt-1 font-bold">
                  Mga balita, apod-apod og liso sa semento, ug presyo sa merkado gikan sa atong PIO.
                </p>
              </div>

              {/* Unread Counter */}
              {announcements.filter(ann => !readAnnouncements.includes(ann.id)).length > 0 && (
                <span className="bg-[#FFCC80] text-[#8D2300] border border-[#FFB74D] px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 shrink-0 animate-pulse">
                  <Bell className="w-4 h-4" />
                  {announcements.filter(ann => !readAnnouncements.includes(ann.id)).length} Bag-o (New)
                </span>
              )}
            </div>

            {/* Filters and Search Bar */}
            <div className="space-y-3">
              <div className="relative text-left">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-700" />
                <input
                  type="text"
                  placeholder="Pangitaa ang anunsyo o balita..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-[#FAF8F5] border-2 border-[#9E9785] rounded-xl text-slate-900 focus:outline-none focus:border-[#1B4332] font-semibold"
                />
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 max-w-full select-none">
                {['All', 'Price Advisory', 'Assistance', 'Weather', 'Meeting', 'General'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black border-2 transition-all cursor-pointer whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'bg-[#1B4332] border-[#1B4332] text-white shadow-md scale-105'
                        : 'bg-[#FAF8F5] border-[#D5CFC1] text-[#2D3A22] hover:bg-[#D8F3DC] hover:text-[#1B4332]'
                    }`}
                  >
                    {cat === 'All' ? 'Tanan' : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* List of Announcements */}
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {(() => {
                const filteredAnnouncements = announcements.filter(ann => {
                  const matchesSearch = ann.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                        ann.content.toLowerCase().includes(searchQuery.toLowerCase());
                  const matchesCategory = selectedCategory === 'All' || ann.category === selectedCategory;
                  return matchesSearch && matchesCategory;
                });

                if (filteredAnnouncements.length > 0) {
                  return filteredAnnouncements.map((ann) => {
                    const isRead = readAnnouncements.includes(ann.id);
                    const isExpanded = expandedAnnouncementId === ann.id;
                    
                    // Category Badge Colors (highly readable for senior citizens)
                    const categoryColors: Record<string, string> = {
                      'Price Advisory': 'bg-teal-100 text-teal-900 border-teal-300 font-bold',
                      'Assistance': 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold',
                      'Weather': 'bg-sky-100 text-sky-900 border-sky-300 font-bold',
                      'Meeting': 'bg-purple-100 text-purple-900 border-purple-300 font-bold',
                      'General': 'bg-[#FAF8F5] text-slate-900 border-[#D5CFC1] font-bold'
                    };

                    return (
                      <div 
                        key={ann.id} 
                        onClick={() => {
                          if (!isExpanded) {
                            setExpandedAnnouncementId(ann.id);
                            markAsRead(ann.id);
                          }
                        }}
                        className={`bg-[#FAF8F5] hover:bg-white border-2 rounded-2xl p-4 transition-all text-left space-y-2.5 cursor-pointer ${
                          isExpanded ? 'border-[#1B4332] ring-1 ring-[#1B4332]/25 shadow-md' : 'border-[#D5CFC1]'
                        } ${ann.priority === 'High' ? 'border-amber-500 bg-amber-50/20' : ''}`}
                      >
                        <div className="flex justify-between items-start gap-3 flex-wrap sm:flex-nowrap">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-black px-3 py-1 rounded-lg border uppercase tracking-wider ${categoryColors[ann.category] || categoryColors.General}`}>
                                {ann.category}
                              </span>
                              {ann.priority === 'High' && (
                                <span className="bg-rose-600 text-white font-black text-xs tracking-wider px-2 py-0.5 rounded uppercase">
                                  MAHIGPIT NA IMPORMANTE (IMPORTANT)
                                </span>
                              )}
                              {!isRead && (
                                <span className="bg-rose-600 text-white font-black text-[10px] px-1.5 py-0.5 rounded">BAG-O (NEW)</span>
                              )}
                            </div>
                            <h4 className="font-black text-[#1B4332] text-sm sm:text-base tracking-wide leading-snug">
                              {ann.title}
                            </h4>
                          </div>
                          
                          <span className="text-xs text-slate-700 font-black font-mono shrink-0">
                            {ann.datePosted}
                          </span>
                        </div>

                        <p className={`text-sm text-slate-800 leading-relaxed font-semibold ${isExpanded ? '' : 'line-clamp-2'}`}>
                          {ann.content}
                        </p>

                        {isExpanded && (
                          <div className="border-t border-[#D5CFC1] pt-3 flex justify-between items-center text-xs text-slate-700 font-extrabold">
                            <span>Gisulat ni: <strong className="text-[#1B4332] text-sm font-black">{ann.postedBy || 'PIO'}</strong></span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedAnnouncementId(null);
                              }}
                              className="text-rose-700 hover:underline font-black flex items-center gap-1 cursor-pointer bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200"
                            >
                              <span>I-collapse (Tagoa)</span>
                              <ChevronUp className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        {!isExpanded && (
                          <div className="flex items-center gap-1 text-xs text-[#1B4332] font-black hover:underline pt-1">
                            <span>Basaha ang tibuok detalye (Read Full Announcement)</span>
                            <ChevronDown className="w-4 h-4 text-emerald-700" />
                          </div>
                        )}
                      </div>
                    );
                  });
                } else {
                  return (
                    <div className="bg-[#FAF8F5]/50 border border-dashed border-[#D5CFC1] p-10 rounded-2xl text-center text-[#85947E] text-xs">
                      Walay anunsyo nga nahiangay sa imong gipangita.
                    </div>
                  );
                }
              })()}
            </div>
          </div>

          {/* PRINT SUITE PREVIEW CARD */}
          <div className="bg-white border border-[#E9E4D9] rounded-3xl p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#F0EBE1] pb-4">
              <div className="text-left">
                <h3 className="text-xs font-black text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4.5 h-4.5 text-[#1B4332]" />
                  <span>Imong Opisyal nga ID ug Sertipiko</span>
                </h3>
                <p className="text-[10px] text-[#85947E] font-semibold mt-0.5">I-print kini alang sa pamatuod sa imong pagka-miyembro sa gobyerno.</p>
              </div>

              <button
                onClick={handlePrintCredentials}
                className="flex items-center gap-1.5 px-4.5 py-2.5 bg-[#1B4332] hover:bg-[#143326] text-white text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>I-print ang mga Dokumento</span>
              </button>
            </div>

            {/* PREVIEW CONTAINER WINDOW (Tailored to warm earth tones) */}
            <div className="bg-[#FAF8F5] border border-[#E9E4D9] p-4 rounded-2xl grid grid-cols-1 xl:grid-cols-12 gap-4 select-none">
              
              <div className="xl:col-span-7 space-y-2 text-left">
                <span className="text-[9px] font-black text-[#85947E] uppercase tracking-wider block">ID Card Preview:</span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* FRONT OF THE ID CARD */}
                  <div className="bg-gradient-to-br from-[#1B4332] via-[#24543F] to-[#143326] border-2 border-[#D8F3DC]/30 rounded-2xl p-4 relative overflow-hidden h-[54mm] flex flex-col justify-between shadow-md text-white">
                    {/* Background seal */}
                    <div className="absolute -right-6 -bottom-6 text-white/5 rotate-12">
                      <Sprout className="w-24 h-24" />
                    </div>

                    <div className="flex items-start justify-between border-b border-white/10 pb-1.5 relative z-10">
                      <div className="flex items-center gap-1">
                        <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-4.5 h-4.5 object-cover rounded-sm shrink-0" />
                        <div>
                          <span className="text-[7px] font-black uppercase text-white block tracking-wider leading-none">Alegria Farmers</span>
                          <span className="text-[6px] text-[#B7E4C7] font-bold uppercase block leading-none">Association (AFA)</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[5px] text-white/60 uppercase font-bold block leading-none">Tuburan, Cebu</span>
                        <span className="text-[5.5px] text-[#D8F3DC] font-black uppercase block leading-none">
                          {currentUser.role === 'Member' ? 'REGULAR MEMBER' : `MEMBER / ${currentUser.role.replace('_', ' ').toUpperCase()}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-3 my-2 items-center relative z-10">
                      <div className="w-12 h-12 rounded-lg bg-black/25 border border-white/20 overflow-hidden flex items-center justify-center shrink-0">
                        {currentUser.avatarUrl ? (
                          <img src={currentUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <UserIcon className="w-5 h-5 text-white/40" />
                        )}
                      </div>
                      <div className="text-left space-y-0.5 truncate">
                        <div className="text-[10px] font-black uppercase text-white tracking-wide truncate">{currentUser.name}</div>
                        <div className="text-[7px] font-bold text-[#B7E4C7] font-sans flex items-center gap-0.5">
                          <MapPin className="w-2 h-2" />
                          <span>{currentUser.farmLocation}</span>
                        </div>
                        <div className="text-[6px] text-white/70">
                          Primary Crop: <strong className="text-white font-black">{currentUser.primaryCrops && currentUser.primaryCrops[0] || 'Utanon'}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center border-t border-white/10 pt-1.5 text-[6px] relative z-10">
                      <div>
                        <span className="text-white/40 block">MEMBER ID:</span>
                        <span className="font-mono font-bold text-[#D8F3DC] text-[7px]">{memberCode}</span>
                      </div>
                      <div className="bg-[#E65100] text-white font-black px-1.5 py-0.5 rounded text-[5.5px] uppercase tracking-wider">
                        EXPIRES: DEC 2026
                      </div>
                    </div>
                  </div>

                  {/* BACK OF THE ID CARD */}
                  <div className="bg-white border border-[#E9E4D9] rounded-2xl p-4 flex flex-col justify-between h-[54mm] text-[6px] leading-relaxed text-[#5D6B54] shadow-md text-left">
                    <div className="space-y-1">
                      <p className="font-black text-[#1B4332] border-b border-[#F0EBE1] pb-1 text-[7px] uppercase tracking-wider">Kasabutan ug Lagda</p>
                      <p>1. Kini nga ID nagpamatud-an nga ang tag-iya usa ka rehistradong mag-uuma sa Brgy. Alegria, Tuburan, Cebu.</p>
                      <p>2. Kinahanglan i-renew kada Disyembre pinaagi sa pagbayad og PHP 100 nga amot sa Tesorero.</p>
                      <p>3. Dili kini pwedeng ipahulam sa uban o gamiton sa dautang buhat.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-center mt-2 pt-1.5 border-t border-[#F0EBE1] text-[5.5px]">
                      <div className="space-y-0.5">
                        <div className="border-b border-[#D5CFC1] mx-auto w-3/4" />
                        <span className="text-[#2D3A22] font-extrabold block">Zenaida A. Elbiña</span>
                        <span className="text-[#1B4332] uppercase font-black block">President</span>
                      </div>
                      <div className="space-y-0.5">
                        <div className="border-b border-[#D5CFC1] mx-auto w-3/4" />
                        <span className="text-[#2D3A22] font-extrabold block">Gracelyn P Asendiente</span>
                        <span className="text-[#1B4332] uppercase font-black block">Treasurer</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* CERTIFICATE PREVIEW STATEMENT */}
              <div className="xl:col-span-5 text-left border-t xl:border-t-0 xl:border-l border-[#E9E4D9] pt-4 xl:pt-0 xl:pl-4">
                <span className="text-[9px] font-black text-[#85947E] uppercase tracking-wider block mb-2">Sertipiko Preview (Certificate):</span>
                <div className="bg-white text-slate-900 p-4 rounded-2xl border border-[#D5CFC1] text-center font-serif text-[10px] leading-relaxed relative shadow-sm">
                  <div className="border-2 border-double border-[#1B4332] p-3 space-y-2">
                    <Landmark className="w-5 h-5 text-[#1B4332] mx-auto stroke-[1.5]" />
                    <div>
                      <h4 className="text-[11px] font-black tracking-wide uppercase text-[#1B4332] font-sans leading-none">Alegria Farmers Association</h4>
                      <p className="text-[5px] tracking-wider uppercase font-sans text-slate-500 mt-0.5">Tuburan, Cebu • Giumo 2024</p>
                    </div>
                    
                    <h5 className="text-[9px] uppercase font-bold text-[#E65100] underline font-sans leading-none pt-1">Certificate of Good Standing</h5>
                    
                    <p className="text-[8px] px-2 leading-relaxed">
                      Kini nagpamatuod nga si <strong className="text-black uppercase font-sans font-black">{currentUser.name}</strong> usa ka aktibong miyembro sa **Alegria Farmers Association (AFA)**, nga nag-uma sa **{currentUser.farmLocation}**.
                    </p>

                    <div className="grid grid-cols-2 gap-4 mt-3 pt-2 border-t border-[#F0EBE1] text-[6px] font-sans">
                      <div>
                        <strong className="text-slate-800 block uppercase font-bold">Zenaida A. Elbiña</strong>
                        <span className="text-slate-500 block">AFA President</span>
                      </div>
                      <div>
                        <strong className="text-slate-800 block uppercase font-bold">Gracelyn P Asendiente</strong>
                        <span className="text-slate-500 block">AFA Treasurer</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
      )}

      {activeTab === 'announcements' && (
        <div id="member-announcements-panel" className="bg-[#FAF8F5] border border-[#E9E4D9] rounded-3xl p-6 shadow-sm no-print">
          <AnnouncementDashboard 
            announcements={announcements} 
            isOfficerMode={false}
          />
        </div>
      )}

      {activeTab === 'hog-raising' && (
        <div id="member-hog-raising-panel" className="bg-[#FAF8F5] border border-[#E9E4D9] rounded-3xl p-6 shadow-sm no-print">
          <HogRaisingIgpTracker
            state={hogRaisingState}
            members={members}
            onAddExpense={() => {}}
            onAddSale={() => {}}
            onAddChoreLog={onAddChoreLog}
            isTreasurerOrOfficer={false}
            currentUser={currentUser}
            isOfficerMode={false}
            closedYears={hogRaisingState.closedYears || [2025]}
          />
        </div>
      )}

      {activeTab === 'products' && (
        <div id="member-products-panel" className="bg-white border border-[#E9E4D9] rounded-3xl p-6 shadow-sm no-print space-y-6 text-left">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#F0EBE1] pb-4">
            <div>
              <h3 className="text-xl font-black text-[#1B4332] font-display flex items-center gap-2">
                <ShoppingBag className="w-6 h-6 text-[#1B4332]" />
                <span>Mga Produkto ug Abot sa Asosasyon (Association Produce & Products)</span>
              </h3>
              <p className="text-xs text-slate-600 mt-1 font-semibold">
                Kini ang opisyal nga listahan sa mga abot ug produkto nga gibaligya sa AFA ug sa atong mga kaubang mag-uuma sa Tuburan.
              </p>
            </div>
            <div className="bg-[#D8F3DC] text-[#1B4332] px-3.5 py-1.5 rounded-xl text-xs font-black border border-[#1B4332]/20">
              {products.filter(p => p.isPublished).length} Ka Produkto
            </div>
          </div>

          {products.filter(p => p.isPublished).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {products.filter(p => p.isPublished).map((prod) => {
                const isCollapsed = collapsedProductIds.includes(prod.id);
                const toggleProduct = () => {
                  setCollapsedProductIds((current) =>
                    current.includes(prod.id)
                      ? current.filter((id) => id !== prod.id)
                      : [...current, prod.id]
                  );
                };

                return (
                  <div
                    key={prod.id}
                    className="bg-[#FAF8F5] border border-[#D5CFC1] rounded-3xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-11 h-11 rounded-2xl bg-[#EAF4EC] flex items-center justify-center border border-[#D5E7D9] text-[#1B4332] shrink-0">
                          <ShoppingBag className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[10px] uppercase font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-[#1B4332] border border-emerald-200">
                              {prod.category || 'Association Product'}
                            </span>
                          </div>
                          <h4 className="text-sm sm:text-base md:text-lg font-black text-[#1B4332] font-display leading-snug break-words">
                            {prod.name}
                          </h4>
                          <span className="text-xs text-slate-600 font-extrabold leading-snug break-words block mt-0.5">
                            {prod.cebName || prod.name}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={toggleProduct}
                        className="shrink-0 bg-[#EAF4EC] border border-[#1B4332]/20 text-[#1B4332] text-[10px] font-black px-2 py-1.5 rounded-lg uppercase cursor-pointer"
                      >
                        {isCollapsed ? 'Maximize' : 'Minimize'}
                      </button>
                    </div>

                    <div className={`transition-all duration-200 overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[260px] opacity-100'}`}>
                      <p className="text-xs text-slate-700 leading-relaxed font-semibold mt-3 break-words">
                        {prod.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[#D5CFC1] space-y-3 mt-3">
                      <div className="flex items-center justify-between text-xs font-black">
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-extrabold block">Presyo / Yunit:</span>
                          <span className="text-[#BF360C] font-black font-mono text-base">
                            PHP {Number(prod.price || 0).toLocaleString()} / {prod.unit || 'unit'}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 uppercase font-extrabold block">Magamit nga Kadaghanon:</span>
                          <span className="text-[#1B4332] font-black text-xs">{prod.quantityAvailable || 'In Stock'}</span>
                        </div>
                      </div>

                      <div className="bg-[#EAF4EC] border border-[#1B4332]/20 p-2.5 rounded-xl space-y-1 text-xs">
                        <span className="block text-[10px] text-[#1B4332] uppercase font-black tracking-wider">
                          Mag-uuma nga Nagbaligya (Selling Farmer):
                        </span>
                        <div className="font-extrabold text-[#1B4332] flex items-center justify-between flex-wrap gap-1">
                          <span>{prod.farmerName || prod.contactPerson || 'AFA Member Farmer'}</span>
                          {prod.farmerSitio && <span className="text-[11px] text-slate-600 font-bold">📍 {prod.farmerSitio}</span>}
                        </div>
                        {(prod.farmerPhone || prod.contactPerson) && (
                          <div className="text-xs font-mono font-black text-[#BF360C] pt-0.5">
                            📞 Kontak: {prod.farmerPhone || prod.contactPerson}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-[#FAF8F5] border-2 border-dashed border-[#D5CFC1] rounded-2xl">
              <ShoppingBag className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-black text-slate-600">Walay produkto nga gi-publish sa pagkakaron.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'activities' && (
        <div id="member-activities-panel" className="bg-white border border-[#E9E4D9] rounded-3xl p-6 shadow-sm no-print space-y-6 text-left">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#F0EBE1] pb-4">
            <div>
              <h3 className="text-xl font-black text-[#1B4332] font-display flex items-center gap-2">
                <Calendar className="w-6 h-6 text-[#1B4332]" />
                <span>Mga Katilingbanong Kalihokan (Activities)</span>
              </h3>
              <p className="text-xs text-slate-600 mt-1 font-semibold">
                Susiha ang mga gieskedyul nga bayanihan, tigum, pagbansay, ug mga aktibidad sa atong asosasyon sa Tuburan.
              </p>
            </div>
            <div className="bg-[#D8F3DC] text-[#1B4332] px-3.5 py-1.5 rounded-xl text-xs font-black border border-[#1B4332]/20">
              {activities.length} Ka Kalihokan
            </div>
          </div>

          {activities.length > 0 ? (
            <div className="space-y-4">
              {activities.map((act) => (
                <div key={act.id} className="bg-[#FAF8F5] border-2 border-[#D5CFC1] rounded-2xl p-5 space-y-3 hover:border-[#1B4332] transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#D5CFC1] pb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase border ${
                        act.status === 'Scheduled' ? 'bg-sky-100 text-sky-800 border-sky-300' :
                        act.status === 'In Progress' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                        act.status === 'Completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                        'bg-slate-100 text-slate-800 border-slate-300'
                      }`}>
                        {act.status}
                      </span>
                      <span className="text-xs font-bold text-slate-500">• {act.category}</span>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-extrabold text-[#1B4332]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[#BF360C]" />
                        {act.dateScheduled}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#BF360C]" />
                        {act.timeScheduled}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <h4 className="text-base font-black text-[#1B4332] font-display">{act.title}</h4>
                    <p className="text-xs text-slate-700 leading-relaxed font-semibold">{act.description}</p>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-between text-xs font-extrabold text-slate-600 gap-2">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#1B4332]" />
                      Lugar: {act.location}
                    </span>
                    <span className="text-slate-500">Gi-organisar ni: {act.organizer}</span>
                  </div>

                  {act.documentedNotes && (
                    <div className="bg-[#EAF4EC] border-l-4 border-[#1B4332] p-3 rounded-r-xl text-xs text-slate-800 mt-2">
                      <strong className="block text-[#1B4332] font-black">Dokumentasyon / Note:</strong>
                      {act.documentedNotes}
                    </div>
                  )}

                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-[#FAF8F5] border-2 border-dashed border-[#D5CFC1] rounded-2xl">
              <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-black text-slate-600">Walay gieskedyul nga kalihokan sa pagkakaron.</p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================================= */}
      {/* EXCLUSIVELY FOR PRINT SHEET (HIDDEN IN APP VIEW, VISIBLE IN HARDCOPY PRINTING) */}
      {/* ========================================================================================= */}
      <div className="print-area-root hidden bg-white text-slate-900 w-[210mm] min-h-[297mm] p-[15mm] text-left leading-relaxed font-serif relative">
        
        {/* CERTIFICATE PRINT OUT SECTION */}
        <div className="border-4 border-double border-emerald-800 p-[10mm] text-center space-y-6 flex flex-col justify-between min-h-[135mm]">
          
          <div className="flex justify-between items-center border-b-2 border-slate-800 pb-4">
            <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-12 h-12 object-cover rounded-md border border-slate-300 shrink-0" />
            <div className="text-center flex-1">
              <p className="text-[10px] tracking-[0.2em] font-sans text-slate-500 uppercase leading-normal">Republic of the Philippines</p>
              <p className="text-[10px] tracking-[0.15em] font-sans text-slate-500 uppercase leading-normal">Province of Cebu • Municipality of Tuburan</p>
              <h4 className="text-base font-bold font-sans tracking-wide text-emerald-800 uppercase mt-1 leading-none">
                Alegria Farmers Association (AFA)
              </h4>
              <p className="text-[9px] font-sans text-slate-400 italic">Official Ledger Registry ID No: {memberCode}</p>
            </div>
            <Sprout className="w-12 h-12 text-emerald-700 shrink-0" />
          </div>

          <div className="space-y-4 py-6">
            <h2 className="text-xl font-bold uppercase tracking-widest text-slate-800 underline decoration-double font-sans">
              Certificate of Membership
            </h2>
            <p className="text-xs font-sans text-slate-500">To whom it may concern for Government Subsidies & Agricultural Assistance</p>
          </div>

          <p className="text-sm text-slate-800 leading-loose text-justify indent-10 font-serif">
            This is to certify that <strong className="text-black font-sans font-black uppercase text-base underline decoration-1 underline-offset-4">{currentUser.name}</strong>, of legal age, residing at <strong className="text-black font-sans font-bold">{currentUser.farmLocation}</strong>, Tuburan, Cebu, is a registered active member in good standing of the **Alegria Farmers Association (AFA)**.
          </p>

          <p className="text-sm text-slate-800 leading-loose text-justify indent-10 font-serif">
            Records indicate that the certified member actively engages in agricultural production in <strong className="text-black font-sans font-bold">{currentUser.farmLocation}</strong>, with primary focus on producing crops and livestock commodities including: <strong className="text-slate-800 font-sans font-semibold italic">{currentUser.primaryCrops?.join(', ') || 'Vegetables, Coffee, Baboyan'}</strong>.
          </p>

          <p className="text-sm text-slate-800 leading-loose text-justify indent-10 font-serif">
            This certificate is officially issued to serve as authentic proof of active cooperative enrollment for securing municipal, provincial, or national Department of Agriculture **assistance programs, fertilizer distributions, tractor rentals, seed subsidies, and agricultural financial aids**.
          </p>

          <div className="bg-slate-50 border border-slate-300 p-3 text-xs leading-relaxed font-sans text-slate-600 rounded-lg text-center max-w-lg mx-auto">
            <strong>⚠️ ID Validity Period:</strong> Membership status and digital ID credentials are valid for **one (1) year** commencing from date of payment and expiring on **December 31, 2026**. Annual dues of PHP 100.00 must be settled with the Treasurer each December to sustain active enrollment benefits.
          </div>

          <div className="pt-12 grid grid-cols-2 gap-12 text-center font-sans text-xs">
            <div className="space-y-12">
              <span className="text-slate-500 block">Attested and Signed:</span>
              <div className="space-y-1">
                <div className="w-40 border-b border-slate-400 mx-auto h-1" />
                <p className="font-bold uppercase text-slate-850">Zenaida A. Elbiña</p>
                <p className="text-[10px] text-slate-500">President, AFA</p>
              </div>
            </div>

            <div className="space-y-12">
              <span className="text-slate-500 block">Attested and Signed:</span>
              <div className="space-y-1">
                <div className="w-40 border-b border-slate-400 mx-auto h-1" />
                <p className="font-bold uppercase text-slate-850">Gracelyn P Asendiente</p>
                <p className="text-[10px] text-slate-500">Treasurer, AFA</p>
              </div>
            </div>
          </div>

          <div className="pt-6 text-center text-[9px] text-slate-400 font-sans">
            Barangay Alegria Farmers Association • Ledger Registry Record • Printed on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* SPACING */}
        <div className="h-[25mm] border-t border-dashed border-slate-300 mt-8 pt-4 text-center text-slate-400 text-xs font-sans no-print">
          --- Cut Here for Official ID Card Insert ---
        </div>

        {/* PRINT ID CARD SHEET */}
        <div className="grid grid-cols-2 gap-[10mm] max-w-[170mm] mx-auto mt-6">
          
          {/* FRONT */}
          <div className="border-2 border-emerald-800 bg-white p-4 h-[54mm] flex flex-col justify-between font-sans relative overflow-hidden text-slate-900 rounded-lg shadow-sm">
            <div className="flex items-start justify-between border-b border-emerald-800 pb-1.5">
              <div className="flex items-center gap-1">
                <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-5 h-5 object-cover rounded-sm border border-emerald-800/20 shrink-0" />
                <div>
                  <h4 className="text-[8px] font-black uppercase text-emerald-800 leading-none">Alegria Farmers</h4>
                  <span className="text-[6.5px] text-slate-600 block leading-none">Association (AFA)</span>
                </div>
              </div>
              <div className="text-right text-[5px] text-slate-500 leading-tight">
                <p className="uppercase font-bold">Province of Cebu</p>
                <p className="text-emerald-800 font-extrabold uppercase">Tuburan</p>
              </div>
            </div>

            <div className="flex gap-3 my-2 items-center">
              <div className="w-16 h-16 rounded bg-slate-100 border border-slate-300 overflow-hidden flex items-center justify-center shrink-0">
                {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-[8px] text-slate-400 font-bold uppercase">Farmer</span>
                )}
              </div>
              <div className="text-left space-y-0.5">
                <h5 className="text-[11px] font-black uppercase text-black leading-none">{currentUser.name}</h5>
                <p className="text-[8px] text-slate-600 flex items-center gap-0.5">
                  <MapPin className="w-2 h-2 text-emerald-700" />
                  {currentUser.farmLocation}
                </p>
                <p className="text-[7px] text-slate-500">
                  Crops: {currentUser.primaryCrops?.join(', ') || 'Vegetables'}
                </p>
                <p className="text-[7px] text-slate-500">
                  Status: {currentUser.status || 'Active Member'}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-end border-t border-slate-300 pt-1.5 text-[7px] text-slate-600">
              <div>
                <span className="text-slate-400 block text-[6px]">MEMBER ID CODE:</span>
                <strong className="font-mono text-black">{memberCode}</strong>
              </div>
              <div className="bg-emerald-800 text-white font-bold px-1 py-0.5 text-[6.5px] rounded">
                VALID: DEC 2026
              </div>
            </div>
          </div>

          {/* BACK */}
          <div className="border-2 border-slate-400 bg-white p-4 h-[54mm] flex flex-col justify-between font-sans text-slate-700 text-[7px] leading-relaxed rounded-lg shadow-sm">
            <div className="space-y-1">
              <h5 className="font-bold text-black border-b border-slate-300 pb-1 text-[8px]">TERMS OF MEMBERSHIP</h5>
              <p>1. Certified active registered farmer in Barangay Alegria, Tuburan, Cebu.</p>
              <p>2. Dues must be renewed annually at PHP 100.00 every December with the Treasurer.</p>
              <p>3. This card guarantees registered status for claim of local subsidies.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center mt-3 pt-2 border-t border-slate-200 text-[6px]">
              <div className="space-y-0.5">
                <div className="border-b border-slate-300 mx-auto w-16" />
                <span className="text-slate-900 block font-bold">Zenaida A. Elbiña</span>
                <span className="text-emerald-800 uppercase block font-semibold">President</span>
              </div>
              <div className="space-y-0.5">
                <div className="border-b border-slate-300 mx-auto w-16" />
                <span className="text-slate-900 block font-bold">Gracelyn P Asendiente</span>
                <span className="text-emerald-800 uppercase block font-semibold">Treasurer</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}

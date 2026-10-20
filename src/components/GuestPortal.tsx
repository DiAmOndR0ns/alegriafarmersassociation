import React, { useState } from 'react';
import { 
  Sprout, Trophy, BookOpen, LogIn, ArrowRight, Sparkles, Coffee, 
  Heart, Milestone, TrendingUp, Calendar, Users, Award, ShieldCheck, 
  Check, ChevronLeft, ChevronRight, Lock, ShieldAlert, Megaphone,
  MapPin, Clock, Tag, AlertTriangle, Boxes, Package, Phone, X, ShoppingBag
} from 'lucide-react';
import { HogRaisingState, Member, Product, Announcement, AssociationActivity } from '../types';
import { useLanguage, LanguageToggle } from '../i18n/LanguageContext';

interface GuestPortalProps {
  onEnterLogin: () => void;
  members: Member[];
  hogRaising: HogRaisingState;
  products?: Product[];
  announcements?: Announcement[];
  activities?: AssociationActivity[];
}

export default function GuestPortal({
  onEnterLogin,
  members,
  hogRaising,
  products = [],
  announcements = [],
  activities = []
}: GuestPortalProps) {
  const { isEnglish: en, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'home' | 'announcements' | 'activities' | 'products' | 'history' | 'achievements'>('home');
  const [selectedProductModal, setSelectedProductModal] = useState<any | null>(null);
  const [collapsedProductIds, setCollapsedProductIds] = useState<string[]>([]);

  const toggleCollapse = (productId: string) => {
    setCollapsedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  };

  // Dynamically calculate stats to accurately reflect the registered roster
  const registeredMembersCount = members.length;
  const activeMembersCount = members.filter(m => m.status === 'Active').length;

  // Theme styling tailored for senior citizens (high contrast, warm, large readable text)
  const theme = {
    bg: 'bg-bafa-neutral-50 text-bafa-700',
    cardBg: 'bg-white border-bafa-neutral-300 shadow-md',
    headerText: 'text-bafa-700 font-black',
    accentText: 'text-bafa-coral-600 font-black',
    accentBg: 'bg-bafa-gold-200 text-bafa-coral-600',
    primaryBtn: 'bg-bafa-700 hover:bg-bafa-800 text-white shadow-lg text-sm sm:text-base font-black px-5 sm:px-6 py-3 sm:py-3.5 rounded-2xl cursor-pointer'
  };

  // Default Showcase Product & Rental Data reflecting database products
  const defaultProductsList = [
    {
      id: 'prod-chairs-rental',
      name: 'Chairs Rental',
      cebName: 'Open to everyone · for any event or gathering',
      desc: 'Durable, clean monobloc plastic chairs available for assemblies, weddings, fiestas, wakes, and community gatherings.',
      specs: 'Heavy-Duty Monobloc Chairs',
      price: 'PHP 10 per chair / day',
      quantityAvailable: '150 chairs',
      farmerName: 'AFA Community Logistics & Asset Committee',
      farmerSitio: 'Sitio Tapon',
      farmerPhone: '0917-345-6789',
      category: 'Rental & Services',
      stockStatus: 'In Stock',
      icon: Boxes,
      color: 'bg-emerald-100 border-emerald-300 text-emerald-900'
    },
    {
      id: 'prod-sacks-rental',
      name: 'Harvest & Storage Sacks Rental',
      cebName: 'Open to everyone · for harvest season',
      desc: 'Clean, durable 50kg woven sacks available to all farmers and residents for corn, coffee, copra, and other harvests.',
      specs: '50kg Capacity Woven Polypropylene Sacks',
      price: 'PHP 5 per sack / use',
      quantityAvailable: '250 sacks',
      farmerName: 'AFA Warehouse & Logistics Committee',
      farmerSitio: 'Sitio Lamak',
      farmerPhone: '0917-345-6789',
      category: 'Rental & Services',
      stockStatus: 'In Stock',
      icon: Package,
      color: 'bg-amber-100 border-amber-300 text-amber-900'
    },
    {
      id: 'prod-coffee',
      name: 'Kape sa Tuburan (Tuburan Coffee)',
      cebName: 'Espesyal nga Roasted Coffee Beans & Ginaling nga Kape',
      desc: 'Lunsay nga kape gikan sa mga bungtod sa Tuburan. Organiko, humot, ug lami kaayo ang pagka-galing.',
      specs: '100% Organic Robusta & Liberica beans',
      price: 'PHP 250 matag 250g pack',
      quantityAvailable: '45 ka pack (250g bags)',
      farmerName: 'Zenaida A. Elbiña',
      farmerSitio: 'Sitio Tapon',
      farmerPhone: '0945-876-1234',
      category: 'Coffee & Crops',
      stockStatus: 'In Stock',
      icon: Coffee,
      color: 'bg-stone-100 border-stone-300 text-stone-900'
    },
    {
      id: 'prod-corn',
      name: 'Dalag ug Puti nga Mais (Cebu Yellow & White Corn)',
      cebName: 'Lab-as nga Mais alang sa Pagkaon ug Binhi',
      desc: 'Gitanom sa tabunok nga yuta sa Alegria nga walay kemikal nga makadaot. Tam-is ug lab-as kaayo.',
      specs: 'Bag-ong ani sa Alegria',
      price: 'PHP 45 matag kilo',
      quantityAvailable: '250 ka kilo',
      farmerName: 'Gracelyn P. Asendiente',
      farmerSitio: 'Sitio Pundok 2',
      farmerPhone: '0917-345-6789',
      category: 'Produce',
      stockStatus: 'In Stock',
      icon: Sprout,
      color: 'bg-yellow-100 border-yellow-300 text-yellow-900'
    },
    {
      id: 'prod-coconut',
      name: 'Lubi ug Kopras (Organic Coconut & Copra)',
      cebName: 'Pang-unang Tinubdan sa Atong Mag-uuma',
      desc: 'Katas sa lubi ug taas nga kalidad nga kopras para sa mantika. Direkta gikan sa mga mag-uuma sa 4 ka opisyal nga Sitio sa Alegria.',
      specs: 'Premium Copra & Fresh Buko',
      price: 'PHP 20 matag buok',
      quantityAvailable: '500 ka buok',
      farmerName: 'Lorena B. Pinote',
      farmerSitio: 'Sitio Pundok 1',
      farmerPhone: '0998-123-4567',
      category: 'Produce',
      stockStatus: 'In Stock',
      icon: Sparkles,
      color: 'bg-emerald-100 border-emerald-300 text-emerald-900'
    }
  ];

  // Milestones Data
  const milestones = [
    {
      year: '2026',
      title: 'Community IGP & Rental Services Expansion',
      cebTitle: 'Opisyal nga Pagpalapad sa mga Proyekto sa Asosasyon (IGP & Rentals)',
      desc: 'Gipalapdan sa AFA ang mga kagamitan ug serbisyo sama sa abang sa mga lingkoranan ug sako nga bukas alang sa tanan aron makahatag og dugang kita sa mga miyembro.',
      icon: Trophy
    },
    {
      year: '2025',
      title: 'Pioneer Coffee Partner Award',
      cebTitle: 'Pasidungog sa Labing Maayo nga Kape sa Probinsya',
      desc: 'Giila ang Alegria nga usa sa nag-unang tig-suplay sa lunsay nga Tuburan Coffee nga de-kalidad.',
      icon: Award
    },
    {
      year: '2024',
      title: 'Bilingual Digital Integration',
      cebTitle: 'Paglusad sa Offline-First Mobile Portal',
      desc: 'Gisugdan ang paggamit sa daling masabtan nga sistema aron ang mga lolo ug lola nga mag-uuma dali rang makasusi sa presyo ug tigom.',
      icon: ShieldCheck
    },
    {
      year: '2022',
      title: 'AFA Official Incorporation',
      cebTitle: 'Opisyal nga Pagkatukod sa Atong Asosasyon',
      desc: 'Naghiusa ang mga mag-uuma gikan sa upat (4) ka opisyal nga Sitio sa Alegria aron magtinabangay ug mapanalipdan ang presyo sa uma.',
      icon: BookOpen
    }
  ];

  return (
    <div id="guest-portal-root" className={`min-h-screen ${theme.bg} flex flex-col font-sans antialiased text-slate-800 selection:bg-bafa-100`}>
      
      {/* PUBLIC HEADER */}
      <header className="bg-white border-b-2 border-bafa-neutral-300 py-3.5 sm:py-4 px-3.5 sm:px-6 shadow-sm sticky top-0 z-30 no-print">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3.5 w-full sm:w-auto min-w-0">
            <div className="bg-white p-1 rounded-full shadow-md shrink-0 overflow-hidden border-2 border-bafa-600">
              <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-14 h-14 sm:w-16 sm:h-16 object-contain block rounded-full" />
            </div>
            <div className="text-left min-w-0 flex-1">
              <h1 className="text-sm sm:text-lg md:text-xl font-black tracking-tight text-bafa-700 uppercase font-display leading-tight break-words">
                Alegria Farmers Association
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end shrink-0">
            <LanguageToggle />
            <button
              onClick={onEnterLogin}
              className="w-full sm:w-auto bg-bafa-coral-600 hover:bg-bafa-coral-500 text-white font-black text-xs sm:text-sm md:text-base px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span>{en ? 'Log In' : 'Pagsulod (Log In)'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* GUEST BANNER */}
      <section className="bg-[#1B4332] text-white py-8 sm:py-12 md:py-14 px-4 sm:px-6 text-center shadow-inner">
        <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4 min-w-0">
          <h2 className="text-xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight font-display break-words max-w-3xl mx-auto px-2 text-white">
            {en ? 'Together in Farming and Growing Our Homeland' : 'Magkauban sa Pag-uma ug Pagpalambo sa Atong Yutang Natawhan'}
          </h2>
        </div>
      </section>

      {/* TABS NAVIGATION WITH SCROLL INDICATOR ARROWS */}
      <div className="bg-[#FAF8F5] border-b-2 border-[#D5CFC1] static md:sticky md:top-[73px] z-20 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-1.5 flex flex-col items-center">

          <div className="flex sm:hidden items-center justify-center gap-1.5 w-full px-2.5 py-1 text-[11px] font-black text-[#1B4332] bg-[#EAF4EC] rounded-lg mb-1.5 border border-emerald-800/20 shadow-xs">
            <span>{en ? 'Scroll or swipe the menu below' : 'I-scroll o i-swipe ang menu sa ubos'}</span>
          </div>

          <div className="relative w-full flex items-center">
            <div className="w-full flex justify-start sm:justify-center gap-1 sm:gap-2 overflow-x-auto py-1 select-none scrollbar-thin scrollbar-thumb-[#1B4332]/20 px-3 sm:px-6">
              {[
                { id: 'home', label: 'Overview', icon: Sparkles },
                { id: 'announcements', label: 'Announcements', icon: Megaphone },
                { id: 'activities', label: 'Activities', icon: Calendar },
                { id: 'products', label: 'Products', icon: Coffee },
                { id: 'achievements', label: 'Achievements', icon: Trophy },
                { id: 'history', label: 'History', icon: BookOpen }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`shrink-0 min-w-max px-3.5 sm:px-5 py-2.5 sm:py-3.5 text-xs sm:text-sm md:text-base font-black transition-all duration-200 flex items-center gap-1.5 sm:gap-2 border-b-4 cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'border-[#1B4332] text-[#1B4332] bg-[#D8F3DC] rounded-t-xl scale-[1.01] shadow-xs'
                        : 'border-transparent text-slate-700 hover:text-[#1B4332] hover:bg-white hover:shadow-xs hover:border-[#1B4332]/40 rounded-t-xl'
                    }`}
                  >
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-[#1B4332]" />
                    <span className="font-display">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* CORE CONTENT SWITCHER */}
      <main className="flex-1 p-3.5 sm:p-6 max-w-7xl mx-auto w-full space-y-6 sm:space-y-8 min-w-0">

        {/* TAB 1: OVERVIEW & DASHBOARD */}
        {activeTab === 'home' && (
          <div className="space-y-6 sm:space-y-8 text-left min-w-0">

            {/* Dynamic Statistics Grid with Hover Functions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">

              <div className="bg-white rounded-3xl p-4 sm:p-6 flex items-center gap-4 sm:gap-5 shadow-sm min-w-0">
                <div className="p-3 sm:p-4 rounded-2xl bg-[#EAF4EC] text-[#1B4332] shrink-0">
                  <Users className="w-8 h-8 sm:w-10 sm:h-10" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] sm:text-xs font-black text-slate-500 uppercase tracking-wider leading-tight">{en ? 'Registered Farmers' : 'Mga Rehistradong Mag-uuma'}</span>
                  <span className="text-2xl sm:text-3xl font-black text-[#1B4332] font-mono leading-tight block break-words">{registeredMembersCount} {en ? 'Members' : 'Miyembro'}</span>
                  <span className="block text-[11px] sm:text-xs text-slate-600 mt-0.5 sm:mt-1 font-bold break-words">{activeMembersCount} {en ? 'Active across 4 Sitios' : 'Aktibo sa 4 ka Sitio'}</span>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-4 sm:p-6 flex items-center gap-4 sm:gap-5 shadow-sm min-w-0">
                <div className="p-3 sm:p-4 rounded-2xl bg-emerald-100 text-[#1B4332] shrink-0">
                  <Boxes className="w-8 h-8 sm:w-10 sm:h-10" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] sm:text-xs font-black text-slate-500 uppercase tracking-wider leading-tight">{en ? 'Community IGP & Rentals' : 'Komunidad IGP & Rentals'}</span>
                  <span className="text-xl sm:text-2xl font-black text-[#1B4332] font-mono leading-tight block break-words">{en ? 'Chairs & Sacks' : 'Lingkoranan & Sako'}</span>
                  <span className="block text-[11px] sm:text-xs text-emerald-700 mt-0.5 sm:mt-1 font-bold break-words">{en ? 'Open for rent to everyone' : 'Bukas abangan alang sa tanan'}</span>
                </div>
              </div>

            </div>

            {/* Quick Introduction Banner */}
            <div className="bg-white rounded-3xl p-4 sm:p-6 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center shadow-md min-w-0">
              <div className="md:col-span-8 space-y-3 sm:space-y-4 min-w-0">
                <h3 className="text-lg sm:text-xl md:text-2xl font-black text-[#1B4332] font-display break-words">
                  {en ? 'About Alegria Farmers Association' : 'Mahitungod sa Alegria Farmers Association'}
                </h3>
                <p className="text-xs sm:text-sm md:text-base text-slate-700 leading-relaxed font-semibold break-words">
                  {en
                    ? 'AFA empowers our local farmers with modern support and added income — from our famous Tuburan Coffee, bananas, and corn, to community projects such as equipment rentals.'
                    : 'Ang AFA gilusad aron tagaan og gahum, modernong tabang, ug dugang kita ang atong mga lokal nga mag-uuma. Gikan sa atong iladong Kape sa Tuburan, saging, mais, hangtod sa mga proyekto sa komunidad.'}
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-4 pt-2">
                  <button
                    onClick={() => setActiveTab('history')}
                    className="w-full sm:w-auto bg-[#1B4332] hover:bg-[#143326] text-white font-black text-xs sm:text-sm px-4 sm:px-5 py-3 rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-all shadow shrink-0"
                  >
                    <span>{en ? 'Read Our History' : 'Basaha Atong Kasaysayan'}</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                  <button
                    onClick={() => setActiveTab('products')}
                    className="w-full sm:w-auto bg-white border-2 border-[#9E9785] text-[#1B4332] hover:bg-slate-50 font-black text-xs sm:text-sm px-4 sm:px-5 py-3 rounded-xl cursor-pointer transition-all flex items-center justify-center shrink-0"
                  >
                    <span>{en ? 'View Our Products' : 'Tan-awa Atong mga Produkto'}</span>
                  </button>
                </div>
              </div>

              <div className="md:col-span-4 bg-[#FAF8F5] p-4 sm:p-6 rounded-2xl space-y-3.5 min-w-0">
                <h4 className="font-black text-[#1B4332] text-xs sm:text-sm md:text-base uppercase tracking-wider flex items-center gap-1.5 border-b border-[#D5CFC1] pb-2 break-words">
                  <ShieldCheck className="w-5 h-5 text-[#BF360C] shrink-0" />
                  <span>Kasaligan nga Serbisyo</span>
                </h4>
                <ul className="space-y-2.5 text-xs sm:text-sm font-bold text-slate-700">
                  <li className="flex items-start gap-2 break-words">
                    <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <span>LGU & DA Certified Registered Association</span>
                  </li>
                  <li className="flex items-start gap-2 break-words">
                    <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <span>100% Financial Transparency & Live Audit Trail</span>
                  </li>
                  <li className="flex items-start gap-2 break-words">
                    <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <span>Active Support & Subsidies for All Members</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* LATEST ANNOUNCEMENTS & ACTIVITIES PREVIEW BANNER */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Latest Announcements Preview */}
              <div className="bg-white rounded-3xl p-4 sm:p-6 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#D5CFC1] pb-2.5">
                  <h4 className="font-black text-[#1B4332] text-sm sm:text-base flex items-center gap-2">
                    <Megaphone className="w-4 h-4 sm:w-5 sm:h-5 text-[#BF360C]" />
                    <span>Announcements</span>
                  </h4>
                  <button
                    onClick={() => setActiveTab('announcements')}
                    className="text-xs font-black text-[#BF360C] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>Tan-awa Tanan</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2.5">
                  {announcements.slice(0, 3).map((ann) => (
                    <div key={ann.id} className="p-3 bg-[#FAF8F5] rounded-2xl space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                        <span className={`px-2 py-0.5 rounded font-black uppercase text-[10px] ${
                          ann.priority === 'High' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                          ann.priority === 'Medium' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                          'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}>
                          {ann.priority} Priority
                        </span>
                        <span className="text-slate-500 font-semibold">{ann.datePosted}</span>
                      </div>
                      <h5 className="font-black text-slate-900 text-xs sm:text-sm">{ann.title}</h5>
                      <p className="text-xs text-slate-600 line-clamp-2">{ann.content}</p>
                    </div>
                  ))}
                  {announcements.length === 0 && (
                    <p className="text-xs text-slate-500 italic text-center py-4">Walay bag-ong pahibalo karon.</p>
                  )}
                </div>
              </div>

              {/* Upcoming Community Activities Preview */}
              <div className="bg-white rounded-3xl p-4 sm:p-6 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#D5CFC1] pb-2.5">
                  <h4 className="font-black text-[#1B4332] text-sm sm:text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-700" />
                    <span>Activities</span>
                  </h4>
                  <button
                    onClick={() => setActiveTab('activities')}
                    className="text-xs font-black text-emerald-800 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>Tan-awa Tanan</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2.5">
                  {activities.slice(0, 3).map((act) => (
                    <div key={act.id} className="p-3 bg-[#FAF8F5] rounded-2xl space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                        <span className="px-2 py-0.5 rounded font-black text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                          {act.category}
                        </span>
                        <span className="text-slate-500 font-semibold">{act.scheduledDate || act.dateScheduled} • {act.scheduledTime || act.timeScheduled}</span>
                      </div>
                      <h5 className="font-black text-slate-900 text-xs sm:text-sm">{act.title}</h5>
                      <div className="text-[11px] text-slate-600 flex items-center gap-2 flex-wrap font-medium">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-500" />{act.location}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3 text-slate-500" />{act.targetAudience}</span>
                      </div>
                    </div>
                  ))}
                  {activities.length === 0 && (
                    <p className="text-xs text-slate-500 italic text-center py-4">Walay naka-eskedyul nga kalihokan karon.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Portal Switch Card */}
            <div className="bg-[#FFF8E1] rounded-3xl p-4 sm:p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm min-w-0">
              <div className="space-y-1 min-w-0">
                <h4 className="text-base sm:text-lg font-black text-[#5D4037] flex items-center gap-2 flex-wrap break-words">
                  <Milestone className="w-5 h-5 sm:w-6 sm:h-6 text-[#FFB300] shrink-0" />
                  <span>Are you a Registered AFA Member or Officer?</span>
                </h4>
              </div>
              <button
                onClick={onEnterLogin}
                className="w-full md:w-auto bg-[#BF360C] hover:bg-[#8D2300] text-white font-black text-xs sm:text-sm px-5 sm:px-6 py-3 sm:py-3.5 rounded-2xl cursor-pointer shadow-md shrink-0 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span>Access Member / Officer Portal</span>
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              </button>
            </div>

          </div>
        )}

        {/* TAB: ANNOUNCEMENTS (PAHIBALO) */}
        {activeTab === 'announcements' && (
          <div className="space-y-6 sm:space-y-8 text-left min-w-0">
            <div className="bg-white border-2 border-[#D5CFC1] p-4 sm:p-6 md:p-8 rounded-3xl shadow-sm space-y-3 min-w-0">
              <div className="border-b-2 border-[#F0EBE1] pb-3.5 sm:pb-4 flex items-center gap-2.5 flex-wrap">
                <Megaphone className="w-6 h-6 sm:w-7 sm:h-7 text-[#BF360C] shrink-0" />
                <h3 className="text-lg sm:text-xl md:text-2xl font-black text-[#1B4332] font-display break-words">
                 Official Bulletins
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 min-w-0">
              {announcements.map((ann) => (
                <div key={ann.id} className="bg-white border-2 border-[#D5CFC1] hover:border-[#1B4332] hover:shadow-lg transition-all rounded-3xl p-5 sm:p-6 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase ${
                        ann.priority === 'High' ? 'bg-rose-100 text-rose-900 border border-rose-300' :
                        ann.priority === 'Medium' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                        'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      }`}>
                        {ann.priority} Priority
                      </span>
                      <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {ann.datePosted}
                      </span>
                    </div>

                    <h4 className="text-base sm:text-lg font-black text-[#1B4332] leading-snug">{ann.title}</h4>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">{ann.content}</p>
                  </div>

                  <div className="pt-3 border-t border-[#F0EBE1] flex items-center justify-between text-xs text-slate-500 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-emerald-700" />
                      {ann.category}
                    </span>
                    <span>Gipatik ni: {ann.postedBy}</span>
                  </div>
                </div>
              ))}
              {announcements.length === 0 && (
                <div className="col-span-full bg-white p-8 rounded-3xl border-2 border-[#D5CFC1] text-center text-slate-500 font-bold text-sm">
                  Walay opisyal nga pahibalo sa pagkakaron.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: ACTIVITIES (MGA KALIHOKAN) */}
        {activeTab === 'activities' && (
          <div className="space-y-6 sm:space-y-8 text-left min-w-0">
            <div className="bg-white border-2 border-[#D5CFC1] p-4 sm:p-6 md:p-8 rounded-3xl shadow-sm space-y-3 min-w-0">
              <div className="border-b-2 border-[#F0EBE1] pb-3.5 sm:pb-4 flex items-center gap-2.5 flex-wrap">
                <Calendar className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-700 shrink-0" />
                <h3 className="text-lg sm:text-xl md:text-2xl font-black text-[#1B4332] font-display break-words">
                  Community Activities
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 min-w-0">
              {activities.map((act) => (
                <div key={act.id} className="bg-white border-2 border-[#D5CFC1] hover:border-emerald-700 hover:shadow-lg transition-all rounded-3xl p-5 sm:p-6 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                        {act.category}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                        act.status === 'Completed' ? 'bg-slate-100 text-slate-700 border border-slate-300' :
                        act.status === 'In Progress' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                        'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {act.status}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-base sm:text-lg font-black text-[#1B4332] leading-snug">{act.title}</h4>
                      {act.cebTitle && <span className="text-xs text-slate-600 font-bold block mt-0.5">{act.cebTitle}</span>}
                    </div>

                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">{act.description}</p>
                  </div>

                  <div className="pt-3 border-t border-[#F0EBE1] space-y-1.5 text-xs text-slate-600 font-bold">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 text-slate-800"><Calendar className="w-3.5 h-3.5 text-emerald-700" />{act.scheduledDate || act.dateScheduled} • {act.scheduledTime || act.timeScheduled}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-rose-600" />{act.location}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>Tumong: {act.targetAudience}</span>
                      {act.attendeesCount !== undefined && act.attendeesCount > 0 && (
                        <span>Tambong: {act.attendeesCount} Mag-uuma</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {activities.length === 0 && (
                <div className="col-span-full bg-white p-8 rounded-3xl border-2 border-[#D5CFC1] text-center text-slate-500 font-bold text-sm">
                  Walay natala nga kalihokan sa pagkakaron.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: KASAYSAYAN (HISTORY) */}
        {activeTab === 'history' && (
          <div className="space-y-6 text-left bg-white p-4 sm:p-6 md:p-8 rounded-3xl shadow-sm min-w-0">
            <div className="border-b-2 border-[#F0EBE1] pb-3.5 sm:pb-4 flex items-center gap-2.5 flex-wrap">
              <BookOpen className="w-6 h-6 sm:w-7 sm:h-7 text-[#BF360C] shrink-0" />
              <h3 className="text-lg sm:text-xl md:text-2xl font-black text-[#1B4332] font-display break-words">
              Our History
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start pt-2 min-w-0">
              <div className="lg:col-span-8 space-y-4 sm:space-y-6 text-xs sm:text-sm md:text-base text-slate-700 leading-relaxed font-semibold min-w-0 break-words">
                <p>
                  Ang <strong className="text-[#1B4332]">Alegria Farmers Association (AFA)</strong> nagsugod isip usa ka gamay nga grupo sa mga mag-uuma sa Barangay Alegria, Tuburan, Cebu.
                  Sa wala pa matukod ang opisayl nga asosasyon, ang mga mag-uuma nag-atubang ug dakong kalisod sa pagbaligya sa ilang abot tungod sa kalayo sa merkado ug sa ubos kaayo nga presyo nga gitanyag sa mga middlemen.
                </p>
                <p>
                  Tungod niini, niadtong tuig 2022, sa tabang sa atong lider nga si <strong className="text-[#1B4332]">Presidente Zenaida A. Elbiña</strong> kauban ang suporta sa Lokal nga Kagamhanan (LGU) ug Department of Agriculture (DA),
                  ang asosasyon opisyal nga na-rehistro ug natukod. Ang panguna nga katuyoan mao ang paghiusa sa upat (4) ka opisyal nga Sitio sa Alegria (Sitio Tapon, Sitio Pundok 1, Sitio Pundok 2, Sitio Lamak) aron adunay usa ka tingog ug hiniusang kusog.
                </p>

                <div className="bg-[#FAF8F5] border-l-4 border-[#1B4332] p-4 sm:p-5 rounded-r-2xl space-y-2 min-w-0 break-words">
                  <h4 className="font-black text-[#1B4332] text-sm sm:text-base uppercase tracking-wider">Atong Misyon (Our Mission)</h4>
                  <p className="text-xs sm:text-sm text-slate-800 leading-relaxed italic">
                    "Paghatag og kasaligan, malungtaron, ug de-kalidad nga suporta sa matag mag-uuma pinaagi sa paghatag og pundo, makinarya, libreng liso, ug modernong kahibalo aron masiguro ang kauswagan sa matag pamilya sa Alegria."
                  </p>
                </div>

                <p>
                  Karon, ang AFA nagserbisyo na sa daghang aktibong pamilya sa mag-uuma. Mapasigarbohon kami nga nakatukod og mga programa sama sa collective selling sa <strong className="text-[#BF360C]">Kape sa Tuburan</strong>,
                  fertilizer distribution sessions, ug ang mga livelihood projects ug <strong className="text-[#1B4332]">Kagamitan nga Abangan (Chairs & Sacks Rentals)</strong> nga bukas para sa tanan nga gipaluyohan sa Asosasyon.
                </p>
              </div>

              <div className="lg:col-span-4 space-y-6 min-w-0">
                <div className="bg-[#FAF8F5] border-2 border-[#D5CFC1] p-4 sm:p-6 rounded-2xl space-y-3.5 min-w-0">
                  <h4 className="font-black text-[#1B4332] text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5 border-b border-[#D5CFC1] pb-2 font-display break-words">
                    <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-[#BF360C] shrink-0" />
                    <span>Atong mga Core Values</span>
                  </h4>
                  <div className="space-y-3 text-xs sm:text-sm text-slate-700 min-w-0">
                    <div className="space-y-1 text-left min-w-0 break-words">
                      <strong className="text-[#1B4332] block font-bold">1. Pagkahiusa (Unity)</strong>
                      <p className="text-slate-600 font-medium text-xs sm:text-sm">Usa ka pamilya, usa ka tinguha para sa tanan.</p>
                    </div>
                    <div className="space-y-1 text-left min-w-0 break-words">
                      <strong className="text-[#1B4332] block font-bold">2. Kamatinud-anon (Transparency)</strong>
                      <p className="text-slate-600 font-medium font-mono text-xs sm:text-sm">Limpyo ug bukas nga pagdumala sa kwarta ug pundo.</p>
                    </div>
                    <div className="space-y-1 text-left min-w-0 break-words">
                      <strong className="text-[#1B4332] block font-bold">3. Kakugi (Diligence)</strong>
                      <p className="text-slate-600 font-medium text-xs sm:text-sm">Walay hunong nga pagpaningkamot sa yuta ug uma.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#EAF4EC] border-2 border-[#1B4332]/30 p-4 sm:p-6 rounded-2xl space-y-3.5 text-left min-w-0">
                  <h4 className="font-black text-[#1B4332] text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5 border-b border-emerald-950/15 pb-2 font-display break-words">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#1B4332] shrink-0" />
                    <span>Mga Opisyales sa AFA (2026)</span>
                  </h4>
                  <div className="space-y-2 text-xs text-slate-700 font-medium min-w-0">
                    {[
                      { title: 'President', name: 'Zenaida A. Elbiña' },
                      { title: 'Vice President', name: 'Anselna B. Arnado' },
                      { title: 'Secretary', name: 'Jennylyn S. Lumactao' },
                      { title: 'Asst. Secretary', name: 'Joan A. Cebas' },
                      { title: 'Treasurer', name: 'Gracelyn P. Asendiente' },
                      { title: 'Asst. Treasurer', name: 'Ana Lourdes D. Pasaylo' },
                      { title: 'Auditor', name: 'Lorena B. Pinote' },
                      { title: 'PIO 1', name: 'Ida S. Manera' },
                      { title: 'PIO 2', name: 'Rosalinda G. Bangga' }
                    ].map((officer, i) => (
                      <div key={i} className="flex items-center justify-between border-b border-emerald-950/10 pb-1.5 gap-2 min-w-0">
                        <span className="font-extrabold text-[#1B4332] text-[11px] sm:text-xs shrink-0">{officer.title}:</span>
                        <span className="font-bold text-slate-800 text-[11px] sm:text-xs text-right break-words min-w-0">{officer.name}</span>
                      </div>
                    ))}
                  </div>

                  <h4 className="font-black text-[#1B4332] text-[11px] sm:text-xs uppercase tracking-wider pt-2 border-t border-emerald-950/15 font-display break-words">
                    Board of Directors (BOD)
                  </h4>
                  <ul className="list-disc pl-4 text-xs text-slate-700 space-y-1 font-semibold break-words">
                    <li>Silvestra S. Simbajon</li>
                    <li>Diosdada M. Asendiente</li>
                    <li>Mirasol E. Tan</li>
                    <li>Romalina S. Evero</li>
                    <li>Judeline G. Romero</li>
                    <li>Marvie P. Conahap</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MGA KALAMPOSAN (ACHIEVEMENTS) */}
        {activeTab === 'achievements' && (
          <div className="space-y-6 sm:space-y-8 text-left min-w-0">
            <div className="bg-white border-2 border-[#D5CFC1] p-4 sm:p-6 md:p-8 rounded-3xl shadow-sm space-y-3 min-w-0">
              <div className="border-b-2 border-[#F0EBE1] pb-3.5 sm:pb-4 flex items-center gap-2.5 flex-wrap">
                <Trophy className="w-6 h-6 sm:w-7 sm:h-7 text-amber-600 shrink-0" />
                <h3 className="text-lg sm:text-xl md:text-2xl font-black text-[#1B4332] font-display break-words">
                  Key Milestones
                </h3>
              </div>
            </div>

            {/* Timeline View */}
            <div className="relative border-l-3 sm:border-l-4 border-[#1B4332] ml-3 sm:ml-8 pl-4 sm:pl-10 space-y-6 sm:space-y-8 min-w-0">
              {milestones.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={index} className="relative space-y-2 animate-slide-up bg-white p-4 sm:p-6 rounded-2xl border-2 border-[#D5CFC1] hover:border-[#1B4332] hover:shadow-lg hover:-translate-y-0.5 hover:bg-[#FAFDFB] transition-all duration-200 shadow-sm min-w-0 cursor-pointer">
                    {/* Circle badge on timeline line */}
                    <div className="absolute -left-[17px] sm:-left-[22px] top-5 sm:top-6 bg-[#1B4332] text-white p-1.5 sm:p-2 rounded-full border-2 sm:border-4 border-[#FAF7F2] shadow-md z-10 flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 flex-wrap min-w-0">
                      <span className="text-base sm:text-lg font-mono font-black text-[#BF360C]">{item.year}</span>
                      <span className="bg-[#EAF4EC] text-[#1B4332] px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-black border border-[#2D6A4F]/20 font-display break-words max-w-full inline-block">
                        {item.title}
                      </span>
                    </div>

                    <h4 className="text-sm sm:text-base md:text-lg font-black text-[#1B4332] font-display break-words leading-tight">
                      {item.cebTitle}
                    </h4>

                    <p className="text-xs sm:text-sm text-slate-700 font-semibold leading-relaxed break-words">
                      {item.desc}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Achievements Summary Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-2 min-w-0">
              <div className="bg-[#EAF4EC] border-2 border-[#1B4332]/30 hover:border-[#1B4332] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-3xl p-4 sm:p-6 space-y-2.5 min-w-0 cursor-pointer">
                <span className="bg-[#1B4332] text-white text-[10px] font-black px-3 py-1 rounded-md uppercase tracking-wider inline-block">
                  Lokal nga Pagsuporta
                </span>
                <h4 className="text-base sm:text-lg font-black text-[#1B4332] break-words">100% Secured LGU Coordination</h4>
                <p className="text-xs sm:text-sm text-slate-700 font-semibold leading-relaxed break-words">
                  Ang tanang pundo nga nadawat sa asosasyon direkta nga narekord ug gisubay sa atong Tesorero ug Auditor para masiguro nga walay mausik.
                  Ang LGU sa Tuburan naghatag kanato og commendation isip usa sa labing transparent ug aktibo nga farmers association sa probinsya.
                </p>
              </div>

              <div className="bg-[#FFF3E0] border-2 border-orange-200 hover:border-orange-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-3xl p-4 sm:p-6 space-y-2.5 min-w-0 cursor-pointer">
                <span className="bg-[#BF360C] text-white text-[10px] font-black px-3 py-1 rounded-md uppercase tracking-wider inline-block">
                  Komunidad ug Miyembro
                </span>
                <h4 className="text-base sm:text-lg font-black text-orange-950 break-words">Miyembro nga Adunay Sumpay nga Kita</h4>
                <p className="text-xs sm:text-sm text-slate-700 font-semibold leading-relaxed break-words">
                  Pinaagi sa mga Livelihood Projects ug Rental IGP (sama sa abang sa mga lingkoranan ug sako nga bukas alang sa tanan), ang matag miyembro makadawat og bahin o dividends gikan sa halin ug abot sa asosasyon.
                  Kini naghatag og sigurado ug kasaligan nga dugang kwarta nga magamit sa pamilya para sa pagpa-skwela sa mga anak o medisina sa mga senior citizen.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: MGA PRODUKTO (PRODUCTS) */}
        {activeTab === 'products' && (
          <div className="space-y-6 sm:space-y-8 text-left min-w-0">
            <div className="bg-white border-2 border-[#D5CFC1] p-4 sm:p-5 rounded-3xl shadow-sm space-y-1.5 min-w-0">
              <div className="border-b-2 border-[#F0EBE1] pb-3 flex items-center gap-2.5 flex-wrap">
                <Coffee className="w-6 h-6 text-amber-700 shrink-0" />
                <h3 className="text-lg sm:text-xl font-black text-[#1B4332] font-display break-words">
                  {en ? 'Product Catalog' : 'Katalogo sa Produkto'}
                </h3>
              </div>
            </div>

            {/* Products Grid — condensed cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 min-w-0">
              {((products.length > 0 ? products : defaultProductsList).filter(
                (p: any) => !p.name?.toLowerCase().includes('baboy') &&
                            !p.name?.toLowerCase().includes('hog') &&
                            !p.cebName?.toLowerCase().includes('baboy') &&
                            !p.category?.toLowerCase().includes('hog')
              )).map((prod: any) => {
                const Icon = prod.icon || (prod.category?.includes('Rental') ? Boxes : Coffee);
                const cardColor = prod.color || (prod.category?.includes('Rental') ? 'bg-emerald-100 border-emerald-300 text-emerald-900' : 'bg-stone-100 border-stone-300 text-stone-900');
                return (
                  <div
                    key={prod.id}
                    onClick={() => setSelectedProductModal(prod)}
                    className="bg-white border-2 border-[#D5CFC1] hover:border-[#1B4332] hover:shadow-lg transition-all duration-200 rounded-2xl p-4 flex items-start gap-3 min-w-0 cursor-pointer group"
                  >
                    <div className={`p-2.5 rounded-xl ${cardColor} border shadow-inner shrink-0`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h4 className="text-sm font-black text-[#1B4332] font-display leading-snug break-words group-hover:text-emerald-800 transition-colors">
                        {prod.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-100 text-[#1B4332] border border-emerald-200">
                          {prod.category || 'Association Assets'}
                        </span>
                        {prod.category?.includes('Rental') && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                            Open to All
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 font-semibold leading-relaxed line-clamp-2 break-words">
                        {prod.desc || prod.description || prod.cebName}
                      </p>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] font-bold text-slate-600 truncate">
                          {prod.quantityAvailable || prod.specs || prod.unit || 'Available'}
                        </span>
                        <span className="text-xs font-mono font-black text-[#BF360C] shrink-0">
                          {typeof prod.price === 'number' ? `PHP ${prod.price.toLocaleString()}` : prod.price}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>


            {/* Buying Note Card */}
            <div className="bg-[#EAF4EC] rounded-2xl p-4 sm:p-5 text-center space-y-1.5 max-w-3xl mx-auto min-w-0">
              <h4 className="text-sm sm:text-base font-black text-[#1B4332] font-display break-words">{en ? 'Want to order or rent?' : 'Gusto ka mopalit o mo-abang?'}</h4>
              <p className="text-xs text-slate-700 font-semibold leading-relaxed break-words">
                {en
                  ? 'Contact or visit President Zenaida A. Elbiña or any AFA officer to place an order or book a rental.'
                  : 'Kontaka o bisitaha si Presidente Zenaida A. Elbiña o bisan kinsa nga Opisyales sa AFA aron mo-order o mo-book og abang.'}
              </p>
            </div>
          </div>
        )}

      </main>

      {/* PUBLIC FOOTER */}
      <footer className="bg-[#1B4332] border-t-2 border-[#143326] py-6 sm:py-8 px-4 sm:px-6 text-center text-xs text-[#B7E4C7] shrink-0 mt-8 sm:mt-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center md:items-start gap-4 text-center md:text-left min-w-0">
          <div className="space-y-1 min-w-0">
            <span className="font-black block text-sm text-white break-words">Alegria Farmers Association (AFA)</span>
            <span className="break-words">Tuburan, Cebu Province, Central Visayas, Philippines</span>
          </div>
          <div className="flex flex-col items-center md:items-end gap-1.5 shrink-0">
            <span className="flex items-center gap-1.5 bg-[#143326] px-3.5 py-1.5 rounded-xl border border-emerald-600/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-black text-[10px] tracking-wider uppercase">LGU & DA REGISTERED PORTAL</span>
            </span>
            <a href="/privacy" className="text-[11px] font-bold text-[#D8F3DC] hover:text-white hover:underline">Privacy Policy</a>
            <span className="text-[10px] text-[#B7E4C7] break-words">© 2026 AFA • Design Optimized for Senior Citizen Accessibility</span>
          </div>
        </div>
      </footer>

      {/* PRODUCT DETAIL MODAL */}
      {selectedProductModal && (
        <div
          className="fixed inset-0 bg-[#0B1F17]/80 backdrop-blur-sm z-50 overflow-y-auto p-3 sm:p-4 flex items-center justify-center animate-fade-in"
          onClick={() => setSelectedProductModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
          >
            {/* HEADER */}
            <div className="relative bg-[#1B4332] px-5 py-4 sm:px-6 sm:py-5 text-white shrink-0">
              <button
                type="button"
                onClick={() => setSelectedProductModal(null)}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3 sm:gap-4 pr-10 min-w-0">
                <div className="p-2.5 sm:p-3 rounded-2xl bg-white/15 text-white shrink-0">
                  {selectedProductModal.category?.includes('Rental') ? <Boxes className="w-6 h-6" /> : <Coffee className="w-6 h-6" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-100 border border-emerald-300/30">
                      {selectedProductModal.category || 'General'}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${selectedProductModal.category?.includes('Rental') ? 'bg-amber-300 text-amber-950' : 'bg-white/20 text-white'}`}>
                      {selectedProductModal.category?.includes('Rental') ? t('Abangan sa Tanan', 'Rentable by All') : selectedProductModal.stockStatus || 'Available'}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-black leading-tight break-words">{selectedProductModal.name}</h3>
                  {selectedProductModal.cebName && (
                    <p className="text-xs sm:text-sm text-emerald-100/80 mt-0.5 break-words">{selectedProductModal.cebName}</p>
                  )}
                </div>
              </div>
            </div>

            {/* BODY */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-left">

              {/* PRICE + STOCK TILES */}
              <div className="grid grid-cols-2 gap-3 items-stretch">
                <div className="rounded-2xl border-2 border-[#F0D5B4] bg-[#FFF7EC] px-4 py-3 flex flex-col justify-between">
                  <span className="block text-[10px] font-black uppercase tracking-wider text-[#8A5A1E]">
                    {en ? 'Rental Rate' : 'Presyo / Rate'}
                  </span>
                  <span className="block text-xl sm:text-2xl font-black font-mono text-[#BF360C] mt-1 break-words leading-tight">
                    {typeof selectedProductModal.price === 'number'
                      ? `PHP ${selectedProductModal.price.toLocaleString()}`
                      : selectedProductModal.price}
                  </span>
                  {selectedProductModal.unit && (
                    <span className="block text-[11px] font-bold text-[#8A5A1E]/80 mt-0.5 break-words">{selectedProductModal.unit}</span>
                  )}
                </div>

                <div className="rounded-2xl border-2 border-[#CFE6D6] bg-[#F1F9F3] px-4 py-3 flex flex-col justify-between">
                  <span className="block text-[10px] font-black uppercase tracking-wider text-[#2D6A4F]">
                    {en ? 'Available' : 'Magamit'}
                  </span>
                  <span className="block text-sm sm:text-base font-black text-[#1B4332] mt-1 break-words leading-snug">
                    {selectedProductModal.quantityAvailable || selectedProductModal.stockStatus || (en ? 'In stock' : 'Naa sa stock')}
                  </span>
                </div>
              </div>

              {/* DESCRIPTION */}
              {(selectedProductModal.desc || selectedProductModal.description) && (
                <div className="space-y-1.5">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-[#4A5F57]">
                    {t('Deskripsyon', 'Description')}
                  </h4>
                  <p className="text-sm text-slate-800 leading-relaxed font-medium break-words">
                    {selectedProductModal.desc || selectedProductModal.description}
                  </p>
                </div>
              )}

              {/* SPECS */}
              {selectedProductModal.specs && (
                <div className="space-y-1.5">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-[#4A5F57]">
                    {t('Detalye', 'Specifications')}
                  </h4>
                  <p className="text-xs font-semibold text-slate-700 bg-[#FAF8F5] border border-[#E9E4D9] rounded-xl px-3 py-2 break-words">
                    {selectedProductModal.specs}
                  </p>
                </div>
              )}

              {/* CUSTODIAN */}
              <div className="rounded-2xl border-2 border-[#E9E4D9] bg-[#FAF8F5] px-4 py-3 space-y-2">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-[#4A5F57] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>{t('Magtatag-iya / Custodian', 'Custodian')}</span>
                </h4>
                <p className="text-sm font-black text-[#1B4332] break-words">
                  {selectedProductModal.farmerName || selectedProductModal.contactPerson || 'AFA Committee'}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-slate-700">
                  {selectedProductModal.farmerSitio && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#2D6A4F] shrink-0" /> {selectedProductModal.farmerSitio}
                    </span>
                  )}
                  {selectedProductModal.farmerPhone && (
                    <span className="flex items-center gap-1 font-mono text-[#BF360C]">
                      <Phone className="w-3.5 h-3.5 shrink-0" /> {selectedProductModal.farmerPhone}
                    </span>
                  )}
                </div>
              </div>

              {/* HOW TO ORDER */}
              <div className="rounded-2xl bg-[#EAF4EC] border-2 border-[#B7E3C4] px-4 py-3 flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#1B4332] shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-[#1B4332] leading-relaxed">
                  {t('Pakigkita sa opisyal sa AFA o sa Alegria Farmers Center aron mo-order o moabang.',
                     'Contact an AFA officer or visit the Alegria Farmers Center to order or rent.')}
                </p>
              </div>
            </div>

            {/* FOOTER */}
            <div className="bg-[#FAF8F5] px-4 sm:px-6 py-3 border-t border-[#E9E4D9] shrink-0">
              <button
                type="button"
                onClick={() => setSelectedProductModal(null)}
                className="w-full py-2.5 bg-[#1B4332] hover:bg-[#143326] text-white text-sm font-black rounded-xl cursor-pointer transition-colors"
              >
                {t('Sirad-i', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

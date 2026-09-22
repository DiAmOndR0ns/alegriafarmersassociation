import React, { useState } from 'react';
import { 
  Sprout, Trophy, BookOpen, LogIn, ArrowRight, Sparkles, Coffee, 
  Heart, Milestone, TrendingUp, Calendar, Users, Award, ShieldCheck, 
  Check, ChevronLeft, ChevronRight, Lock, ShieldAlert, Megaphone,
  MapPin, Clock, Tag, AlertTriangle, Boxes, Package, Phone, X, ShoppingBag
} from 'lucide-react';
import { HogRaisingState, Member, Product, Announcement, AssociationActivity } from '../types';

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
      name: 'Abang sa Lingkoranan (Plastic Chairs Rental)',
      cebName: 'Mga Lingkoranan nga Abangan Alang sa Tanan (Rentable by Everyone)',
      desc: 'Lig-on ug limpyo nga mga monobloc plastic chairs nga maabangan alang sa mga asembliya, kasal, pista, lubong, ug panagtigom sa komunidad.',
      specs: 'Heavy-Duty Monobloc Chairs (Bukas alang sa tanan)',
      price: 'PHP 10 matag adlaw / lingkoranan',
      quantityAvailable: '150 ka buok lingkoranan',
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
      name: 'Abang sa Sako (Harvest & Storage Sacks Rental)',
      cebName: 'Mga Sako nga Abangan para sa Ting-ani (Rentable by Everyone)',
      desc: 'Limpyo ug lig-on nga mga 50kg woven sacks nga maabangan sa tanang mag-uuma ug lumulupyo alang sa ting-ani sa mais, kape, kopras, ug abot sa uma.',
      specs: '50kg Capacity Woven Polypropylene Sacks (Bukas alang sa tanan)',
      price: 'PHP 5 matag gamit / sako',
      quantityAvailable: '250 ka buok sako',
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
            <div className="bg-bafa-800 p-1.5 rounded-2xl text-white shadow-md shrink-0 overflow-hidden border border-bafa-600">
              <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-9 h-9 sm:w-11 sm:h-11 object-cover block rounded-xl" />
            </div>
            <div className="text-left min-w-0 flex-1">
              <h1 className="text-sm sm:text-lg md:text-xl font-black tracking-tight text-bafa-700 uppercase font-display leading-tight break-words">
                Alegria Farmers Association
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end shrink-0">
            <button
              onClick={onEnterLogin}
              className="w-full sm:w-auto bg-bafa-coral-600 hover:bg-bafa-coral-500 text-white font-black text-xs sm:text-sm md:text-base px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span>Log In</span>
            </button>
          </div>
        </div>
      </header>

      {/* GUEST BANNER */}
      <section className="bg-[#1B4332] text-white py-8 sm:py-12 md:py-14 px-4 sm:px-6 text-center shadow-inner">
        <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4 min-w-0">
          <h2 className="text-xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight font-display break-words max-w-3xl mx-auto px-2 text-white">
            Magkauban sa Pag-uma ug Pagpalambo sa Atong Yutang Natawhan
          </h2>
          <p className="text-xs sm:text-sm md:text-base text-[#D8F3DC] max-w-2xl mx-auto font-medium leading-relaxed break-words px-2">
            Kini ang public portal sa Alegria Farmers Association (AFA). 
            Gidisenyo kini aron sayon ug daling matan-aw ang atong kasaysayan, mga kalamposan, ug ang lab-as nga mga produkto.          </p>
        </div>
      </section>

      {/* TABS NAVIGATION WITH SCROLL INDICATOR ARROWS */}
      <div className="bg-[#FAF8F5] border-b-2 border-[#D5CFC1] static md:sticky md:top-[73px] z-20 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-1.5 flex flex-col items-center">
          
          {/* Mobile Phone Scroll Hint Indicator */}
          <div className="flex sm:hidden items-center justify-between w-full px-2.5 py-1 text-[11px] font-black text-[#1B4332] bg-[#EAF4EC] rounded-lg mb-1.5 border border-emerald-800/20 shadow-xs">
            <span className="flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5 text-[#BF360C]" />
              I-scroll o i-swipe ang menu sa ubos →
            </span>
              <ChevronRight className="w-3.5 h-3.5 text-[#BF360C]" />
          </div>

          <div className="relative w-full flex items-center">
            {/* Left Scroll Indicator Arrow */}
            <div className="hidden sm:flex absolute left-0 z-10 p-1 bg-[#FAF8F5] items-center text-[#1B4332]">
              <ChevronLeft className="w-5 h-5 text-[#BF360C] animate-bounce-x" />
            </div>

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

            {/* Right Scroll Indicator Arrow */}
            <div className="hidden sm:flex absolute right-0 z-10 p-1 bg-[#FAF8F5] items-center text-[#1B4332]">
              <ChevronRight className="w-5 h-5 text-[#BF360C] animate-bounce-x" />
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
                  <span className="block text-[11px] sm:text-xs font-black text-slate-500 uppercase tracking-wider leading-tight">Mga Rehistradong Mag-uuma</span>
                  <span className="text-2xl sm:text-3xl font-black text-[#1B4332] font-mono leading-tight block break-words">{registeredMembersCount} Miyembro</span>
                  <span className="block text-[11px] sm:text-xs text-slate-600 mt-0.5 sm:mt-1 font-bold break-words">{activeMembersCount} Aktibo sa 4 ka Sitio</span>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-4 sm:p-6 flex items-center gap-4 sm:gap-5 shadow-sm min-w-0">
                <div className="p-3 sm:p-4 rounded-2xl bg-emerald-100 text-[#1B4332] shrink-0">
                  <Boxes className="w-8 h-8 sm:w-10 sm:h-10" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] sm:text-xs font-black text-slate-500 uppercase tracking-wider leading-tight">Komunidad IGP & Rentals</span>
                  <span className="text-xl sm:text-2xl font-black text-[#1B4332] font-mono leading-tight block break-words">Lingkoranan & Sako</span>
                  <span className="block text-[11px] sm:text-xs text-emerald-700 mt-0.5 sm:mt-1 font-bold break-words">Bukas abangan alang sa tanan</span>
                </div>
              </div>

            </div>

            {/* Quick Introduction Banner */}
            <div className="bg-white rounded-3xl p-4 sm:p-6 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center shadow-md min-w-0">
              <div className="md:col-span-8 space-y-3 sm:space-y-4 min-w-0">
                <h3 className="text-lg sm:text-xl md:text-2xl font-black text-[#1B4332] font-display break-words">
                  Mahitungod sa Alegria Farmers Association
                </h3>
                <p className="text-xs sm:text-sm md:text-base text-slate-700 leading-relaxed font-semibold break-words">
                  Ang AFA gilusad aron tagaan og gahum, modernong tabang, ug dugang kita ang atong mga lokal nga mag-uuma. 
                  Gikan sa atong iladong <strong className="text-[#BF360C]">Kape sa Tuburan</strong>, saging, mais, hangtod sa mga proyekto sa komunidad sama sa <strong className="text-[#1B4332]">Abang sa Lingkoranan ug Sako</strong>, 
                  atong paningkamotan nga mapalambo ang agrikultura pinaagi sa kooperasyon.
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-4 pt-2">
                  <button
                    onClick={() => setActiveTab('history')}
                    className="w-full sm:w-auto bg-[#1B4332] hover:bg-[#143326] text-white font-black text-xs sm:text-sm px-4 sm:px-5 py-3 rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-all shadow shrink-0"
                  >
                    <span>Basaha Atong Kasaysayan</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                  <button
                    onClick={() => setActiveTab('products')}
                    className="w-full sm:w-auto bg-white border-2 border-[#9E9785] text-[#1B4332] hover:bg-slate-50 font-black text-xs sm:text-sm px-4 sm:px-5 py-3 rounded-xl cursor-pointer transition-all flex items-center justify-center shrink-0"
                  >
                    <span>Tan-awa Atong mga Produkto</span>
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
                <p className="text-xs sm:text-sm text-[#7D5C4F] font-semibold break-words">
                  Sign in to access your personal dashboard, log caretaker chores, view dividends, and print certified credentials.
                </p>
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
              <p className="text-xs sm:text-sm md:text-base text-slate-700 font-semibold leading-relaxed break-words">
                Kini ang opisyal nga mga pahibalo nga gipagawas sa Public Information Officer (PIO) ug mga Opisyales sa AFA alang sa tanang miyembro ug komunidad sa Barangay Alegria.
              </p>
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
              <p className="text-xs sm:text-sm md:text-base text-slate-700 font-semibold leading-relaxed break-words">
                Subaya ang mga umaabot ug nangaging mga seminar, training, distribution sa liso ug abono, ug mga miting sa mag-uuma sa Alegria.
              </p>
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
              <p className="text-xs sm:text-sm md:text-base text-slate-700 font-semibold leading-relaxed break-words">
                Kini ang listahan sa mga dagkong dungog ug kalamposan nga nakab-ot sa atong asosasyon pinaagi sa pagtinabangay sa matag miyembro, opisyales, ug lokal nga kagamhanan sa Tuburan.
              </p>
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
            <div className="bg-white border-2 border-[#D5CFC1] p-4 sm:p-6 md:p-8 rounded-3xl shadow-sm space-y-3 min-w-0">
              <div className="border-b-2 border-[#F0EBE1] pb-3.5 sm:pb-4 flex items-center gap-2.5 flex-wrap">
                <Coffee className="w-6 h-6 sm:w-7 sm:h-7 text-amber-700 shrink-0" />
                <h3 className="text-lg sm:text-xl md:text-2xl font-black text-[#1B4332] font-display break-words">
                  Our Agriculture Produce
                </h3>
              </div>
              <p className="text-xs sm:text-sm md:text-base text-slate-700 font-semibold leading-relaxed break-words">
                Garbo sa Barangay Alegria! Ang mosunod mao ang mga pang-unang produkto nga gitanom, gibuhi, ug ginama sa mga kamot sa atong kugihan nga mga mag-uuma.
              </p>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 min-w-0">
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
                    className="bg-white border-2 border-[#D5CFC1] hover:border-[#1B4332] hover:shadow-xl hover:-translate-y-1 hover:bg-[#F8FCF9] transition-all duration-300 rounded-3xl p-4 sm:p-6 flex flex-col justify-between min-w-0 cursor-pointer group"                  >
                    <div className="space-y-3.5 min-w-0">
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <div className={`p-2.5 sm:p-3 rounded-2xl ${cardColor} border shadow-inner shrink-0 group-hover:scale-105 transition-transform`}>
                          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[10px] uppercase font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-[#1B4332] border border-emerald-200">
                              {prod.category || 'Rental & Produce'}
                            </span>
                            {prod.category?.includes('Rental') && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                                Rentable by Everyone
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm sm:text-base md:text-lg font-black text-[#1B4332] font-display leading-snug break-words group-hover:text-emerald-800 transition-colors">
                            {prod.name}
                          </h4>
                          <span className="text-xs text-slate-600 font-extrabold leading-snug break-words block mt-0.5">
                            {prod.cebName}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-700 font-semibold leading-relaxed break-words line-clamp-3">
                        {prod.desc || prod.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#F0EBE1] space-y-3 min-w-0">
                      {/* Quantity & Price */}
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between text-xs font-black gap-2 min-w-0">
                        <div className="space-y-0.5 min-w-0">
                          <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">Magamit nga Kadaghanon (Quantity):</span>
                          <span className="text-[#1B4332] font-bold text-xs break-words">{prod.quantityAvailable || prod.specs || prod.unit || 'Magamit sa Asosasyon'}</span>
                        </div>
                        <div className="sm:text-right space-y-0.5 min-w-0 shrink-0">
                          <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">Standard Presyo / Rate:</span>
                          <span className="text-[#BF360C] font-mono font-black text-xs sm:text-sm break-words">{typeof prod.price === 'number' ? `PHP ${prod.price.toLocaleString()} / ${prod.unit || 'buok'}` : prod.price}</span>
                        </div>
                      </div>

                      {/* Selling Farmer Contact Details */}
                      <div className="bg-[#FAF8F5] border border-[#E2DCCE] p-3 rounded-2xl space-y-1.5 min-w-0">
                        <span className="block text-[10px] text-amber-900 uppercase font-extrabold tracking-wider break-words">
                          Nalambigit nga Mag-uuma / Custodian:
                        </span>
                        <div className="text-xs font-black text-[#1B4332] flex flex-col sm:flex-row sm:items-center justify-between gap-1 min-w-0">
                          <span className="break-words min-w-0">{prod.farmerName || prod.contactPerson || 'Miyembro nga Mag-uuma sa AFA'}</span>
                          {prod.farmerSitio && <span className="text-[11px] text-slate-600 font-bold shrink-0">📍 {prod.farmerSitio}</span>}
                        </div>
                        {(prod.farmerPhone || prod.contactPerson) && (
                          <div className="text-xs font-mono font-bold text-[#BF360C] pt-0.5 flex items-center gap-1 flex-wrap break-all sm:break-words">
                            <span>📞 Kontak: {prod.farmerPhone || prod.contactPerson}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProductModal(prod);
                        }}
                        className="w-full py-2.5 bg-[#1B4332] hover:bg-[#143326] text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm group-hover:bg-[#143326]"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Tan-awa ang Detalye / Abangi (View Details & Rent)</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>


            {/* Buying Note Card */}
            <div className="bg-[#EAF4EC] rounded-3xl p-5 sm:p-8 text-center space-y-3 sm:space-y-4 max-w-3xl mx-auto min-w-0">
              <h4 className="text-base sm:text-lg md:text-xl font-black text-[#1B4332] font-display break-words">Gusto ba ka mopalit o mo-order?</h4>
              <p className="text-xs sm:text-sm text-slate-700 font-semibold leading-relaxed break-words">
                Ang tanang halin niini direkta nga moadto sa atong mga kaubang mag-uuma sa upat (4) ka opisyal nga Sitio (Sitio Tapon, Sitio Pundok 1, Sitio Pundok 2, Sitio Lamak) sa Alegria, Tuburan, Cebu. 
                Aron pagpalit, palihug kontaka o bisitaha si Presidente Zenaida A. Elbiña o bisan kinsa nga Opisyales sa AFA sa personal.
              </p>
              <div className="font-bold text-[#BF360C] text-xs sm:text-sm break-words">
                Salamat sa inyong padayong pagsuporta sa lokal nga mga mag-uuma sa Alegria!
              </div>
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
            <span className="text-[10px] text-[#85947E] break-words">© 2026 AFA • Design Optimized for Senior Citizen Accessibility</span>
          </div>
        </div>
      </footer>

      {/* GUEST PRODUCT & RENTAL DETAILS MODAL (STRICTLY REFLECTS DATABASE) */}
      {selectedProductModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 overflow-y-auto p-3 sm:p-4 flex items-center justify-center animate-fade-in">
          <div className="bg-white border-2 border-[#D5CFC1] rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            {/* Header */}
            <div className="bg-[#1B4332] px-5 py-4 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-white/15 text-white shrink-0">
                  <Boxes className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black truncate">{selectedProductModal.name}</h3>
                  <p className="text-xs text-emerald-200 truncate">{selectedProductModal.cebName || 'Opisyal nga Produkto / Gamit sa Asosasyon'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProductModal(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-xl font-bold shrink-0 ml-2"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-left flex-1 text-slate-800">
              {/* Category & Status */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 bg-emerald-100 text-[#1B4332] border border-emerald-300 rounded-full text-xs font-black uppercase tracking-wider">
                  {selectedProductModal.category || 'Rental & Produce'}
                </span>
                {selectedProductModal.category?.includes('Rental') && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-xs font-black">
                    Bukas Abangan Alang sa Tanan (Rentable by Everyone)
                  </span>
                )}
                <span className="px-3 py-1 bg-sky-100 text-sky-900 border border-sky-300 rounded-full text-xs font-bold font-mono">
                  {selectedProductModal.stockStatus || 'In Stock'}
                </span>
              </div>

              {/* Price & Quantity Available Card */}
              <div className="bg-[#FAF7F2] border border-[#E8E2D5] p-4 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Standard Presyo / Rental Rate:</span>
                  <span className="text-xl sm:text-2xl font-black text-[#BF360C] font-mono">
                    {typeof selectedProductModal.price === 'number' 
                      ? `PHP ${selectedProductModal.price.toLocaleString()} / ${selectedProductModal.unit || 'unit'}` 
                      : selectedProductModal.price}
                  </span>
                </div>
                <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Magamit nga Stock (Available):</span>
                  <span className="text-sm font-black text-[#1B4332]">
                    {selectedProductModal.quantityAvailable || selectedProductModal.specs || selectedProductModal.unit || 'Available in stock'}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider">Deskripsyon & Gamit:</h5>
                <p className="text-sm text-slate-700 leading-relaxed font-medium bg-white p-3.5 rounded-2xl border border-slate-200">
                  {selectedProductModal.desc || selectedProductModal.description || 'De-kalidad nga produkto o kagamitan gikan sa Alegria Farmers Association.'}
                </p>
              </div>

              {/* Specs */}
              {selectedProductModal.specs && (
                <div className="space-y-1.5">
                  <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider">Kapasidad / Detalye (Specs):</h5>
                  <div className="text-xs font-semibold text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono">
                    {selectedProductModal.specs}
                  </div>
                </div>
              )}

              {/* Farmer / Custodian Contact Box */}
              <div className="bg-[#EAF4EC] border border-[#B7E3C4] p-4 rounded-2xl space-y-2">
                <h5 className="text-xs font-black text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#1B4332]" />
                  <span>Nalambigit nga Mag-uuma / Custodian:</span>
                </h5>
                <div className="text-sm font-black text-[#1B4332]">
                  {selectedProductModal.farmerName || selectedProductModal.contactPerson || 'AFA Logistics & Custodian Committee'}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 font-semibold pt-1">
                  {selectedProductModal.farmerSitio && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#1B4332]" />
                      <span>{selectedProductModal.farmerSitio}</span>
                    </span>
                  )}
                  {(selectedProductModal.farmerPhone || selectedProductModal.contactPerson) && (
                    <span className="flex items-center gap-1 font-mono font-bold text-[#BF360C]">
                      <Phone className="w-3.5 h-3.5 text-[#BF360C]" />
                      <span>{selectedProductModal.farmerPhone || selectedProductModal.contactPerson}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Order/Rental Instructions */}
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 leading-relaxed">
                <strong>Pahibalo sa Pag-abang o Pagpalit:</strong> Ang mga kagamitan sama sa lingkoranan ug sako, ingon man ang mga lab-as nga abot, bukas abangan ug paliton sa tanang lumulupyo ug bisita. Pakig-alayon lamang sa giasayn nga mag-uuma o bisitaha ang Alegria Farmers Center.
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedProductModal(null)}
                className="px-5 py-2.5 bg-[#1B4332] hover:bg-[#143326] text-white text-xs sm:text-sm font-black rounded-xl cursor-pointer transition-all shadow-sm"
              >
                Sirad-i (Close)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

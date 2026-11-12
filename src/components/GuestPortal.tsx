import React, { useEffect, useRef, useState } from 'react';
import { 
  Trophy, BookOpen, LogIn, ArrowRight, Sparkles, Coffee,
  Heart, Milestone, TrendingUp, Calendar, Users, Award, ShieldCheck, 
  Check, ChevronLeft, ChevronRight, Lock, ShieldAlert, Megaphone,
  MapPin, Clock, Tag, AlertTriangle, Boxes, Phone, X, ShoppingBag
} from 'lucide-react';
import { HogRaisingState, Member, PublicProduct, Announcement, AssociationActivity, AssociationAchievement, User } from '../types';
import { resolveBoardMemberNames, resolveOfficerName, resolveOfficerRoster } from '../utils/officers';
import { getAvailableEggCount, isEggCatalogProduct } from '../utils/eggInventory';
import { useLanguage, LanguageToggle } from '../i18n/LanguageContext';

interface GuestPortalProps {
  onEnterLogin: () => void;
  members: Member[];
  hogRaising: HogRaisingState;
  products?: PublicProduct[];
  announcements?: Announcement[];
  activities?: AssociationActivity[];
  achievements?: AssociationAchievement[];
  users?: User[];
}

const isPoultryProject = (produce: string) => /poultry|rtl|manok|chicken/i.test(produce);

export const getPublishedProducts = (products: PublicProduct[], hogRaising?: HogRaisingState) => {
  const eggProduct = products.find(isEggCatalogProduct);
  const publishedProducts = products.filter(product =>
    product.isPublished && (!eggProduct || product.id !== eggProduct.id) && !isEggCatalogProduct(product)
  );

  if (!eggProduct || !hogRaising) {
    return products.filter(product => product.isPublished);
  }

  const eggProjects = new Set([
    'Poultry Raising (RTL)',
    ...(hogRaising.produces || []).filter(isPoultryProject),
    ...(hogRaising.eggHarvests || [])
      .map(harvest => harvest.produce || 'Poultry Raising (RTL)')
      .filter(isPoultryProject),
    ...(hogRaising.sales || [])
      .filter(sale => sale.hogStage === 'Eggs' || sale.hogStage === 'General' || sale.hogStage === undefined)
      .map(sale => sale.produce || 'Poultry Raising (RTL)')
      .filter(isPoultryProject)
  ]);
  const availableEggs = [...eggProjects].reduce(
    (total, produce) => total + getAvailableEggCount(
      hogRaising.eggHarvests || [],
      hogRaising.sales || [],
      produce
    ),
    0
  );

  if (availableEggs <= 0 || !Number.isFinite(eggProduct.price) || eggProduct.price <= 0) {
    return publishedProducts;
  }

  const automaticEggListing: PublicProduct = {
    ...eggProduct,
    isPublished: true,
    stockStatus: 'In Stock',
    quantityAvailable: `${availableEggs.toLocaleString()} eggs available`
  };

  return [
    ...publishedProducts,
    automaticEggListing
  ];
};

export default function GuestPortal({
  onEnterLogin,
  members,
  hogRaising,
  products = [],
  announcements = [],
  activities = [],
  achievements = [],
  users = []
}: GuestPortalProps) {
  const { isEnglish: en, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'home' | 'announcements' | 'activities' | 'products' | 'history' | 'achievements'>('home');
  const [displayAchievements, setDisplayAchievements] = useState(achievements);
  const [displayProducts, setDisplayProducts] = useState(() => getPublishedProducts(products, hogRaising));
  const [selectedProductModal, setSelectedProductModal] = useState<any | null>(null);
  const productDialogRef = useRef<HTMLDivElement>(null);
  const productDialogCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDisplayAchievements(achievements);
  }, [achievements]);

  useEffect(() => {
    setDisplayProducts(getPublishedProducts(products, hogRaising));
  }, [products, hogRaising]);

  useEffect(() => {
    let active = true;
    fetch('/api/achievements?resource=products')
      .then(async response => {
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        return response.json();
      })
      .then(result => {
        if (active && result?.success && Array.isArray(result.products)) {
          const refreshedProducts = new Map(products.map(product => [product.id, product]));
          result.products.forEach((product: PublicProduct) => refreshedProducts.set(product.id, product));
          setDisplayProducts(getPublishedProducts([...refreshedProducts.values()], hogRaising));
        }
      })
      .catch(error => {
        if (active) console.warn('[Guest Products] Unable to refresh published products.', error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/achievements')
      .then(async response => {
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        return response.json();
      })
      .then(result => {
        if (active && result?.success && Array.isArray(result.achievements)) {
          setDisplayAchievements(result.achievements);
        }
      })
      .catch(error => {
        if (active) console.warn('[Guest Achievements] Unable to refresh published achievements.', error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedProductModal) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = productDialogRef.current;
    productDialogCloseRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedProductModal(null);
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;
      const focusableElements = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        event.preventDefault();
      } else if (event.shiftKey && (document.activeElement === firstElement || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (document.activeElement === lastElement || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [selectedProductModal]);

  // Dynamically calculate stats to accurately reflect the registered roster
  const registeredMembersCount = members.length;
  const activeMembersCount = members.filter(m => m.status === 'Active').length;
  const boardMemberNames = resolveBoardMemberNames(users);
  const tabs: { id: 'home' | 'announcements' | 'activities' | 'products' | 'history' | 'achievements'; label: string; icon: typeof Sparkles }[] = [
    { id: 'home', label: t('Kinatibuk-ang Tan-aw', 'Overview'), icon: Sparkles },
    { id: 'announcements', label: t('Pahibalo', 'Announcements'), icon: Megaphone },
    { id: 'activities', label: t('Kalihokan', 'Activities'), icon: Calendar },
    { id: 'products', label: t('Produkto', 'Products'), icon: Coffee },
    { id: 'achievements', label: t('Kalampusan', 'Achievements'), icon: Trophy },
    { id: 'history', label: t('Kasaysayan', 'History'), icon: BookOpen }
  ];
  const priorityLabel = (priority: string) => {
    if (priority === 'High') return t('High');
    if (priority === 'Medium') return t('Medium');
    return t('Low');
  };
  const activityStatusLabel = (status: string) => {
    if (status === 'Completed') return t('Nahuman', 'Completed');
    if (status === 'In Progress') return t('Nagpadayon', 'In progress');
    if (status === 'Postponed') return t('Gibalhin sa petsa', 'Postponed');
    if (status === 'Cancelled') return t('Gikansela', 'Cancelled');
    return t('Naka-iskedyul', 'Scheduled');
  };

  // Theme styling tailored for senior citizens (high contrast, warm, large readable text)
  const theme = {
    bg: 'bg-bafa-neutral-50 text-bafa-700',
    cardBg: 'bg-white border-bafa-neutral-300 shadow-md',
    headerText: 'text-bafa-700 font-black',
    accentText: 'text-bafa-coral-600 font-black',
    accentBg: 'bg-bafa-gold-200 text-bafa-coral-600',
    primaryBtn: 'bg-bafa-700 hover:bg-bafa-800 text-white shadow-lg text-sm sm:text-base font-black px-5 sm:px-6 py-3 sm:py-3.5 rounded-2xl cursor-pointer'
  };

  return (
    <div id="guest-portal-root" className={`min-h-screen ${theme.bg} flex flex-col font-sans antialiased text-slate-800 selection:bg-bafa-100`}>
      
      {/* PUBLIC HEADER */}
      <header className="bg-white border-b-2 border-bafa-neutral-300 py-3.5 sm:py-4 px-3.5 sm:px-6 shadow-sm sticky top-0 z-30 no-print">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3.5 w-full sm:w-auto min-w-0">
            <div className="bg-white p-1.5 rounded-full shadow-md shrink-0 overflow-hidden border-2 border-bafa-600">
              <img src="/afa-logo.png" alt="Alegria Farmers Association logo" className="w-16 h-16 sm:w-20 sm:h-20 object-contain block rounded-full" />
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
              <span>{t('Pagsulod', 'Log In')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* GUEST BANNER */}
      <section className="bg-[#1B4332] text-white py-8 sm:py-12 md:py-14 px-4 sm:px-6 text-center shadow-inner">
        <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4 min-w-0">
          <h2 className="text-xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight font-display break-words max-w-3xl mx-auto px-2 text-white">
            {t('Magkauban sa Pag-uma ug Pagpalambo sa Atong Yutang Natawhan', 'Working together to grow our farms and community')}
          </h2>
        </div>
      </section>

      {/* TABS NAVIGATION WITH SCROLL INDICATOR ARROWS */}
      <nav aria-label={t('Pangunang menu', 'Main menu')} className="bg-[#FAF8F5] border-b-2 border-[#D5CFC1] static md:sticky md:top-[73px] z-20 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-center gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`min-h-12 px-3 sm:px-5 py-2.5 text-sm sm:text-base font-black transition-all duration-200 flex items-center justify-center gap-2 border-2 cursor-pointer ${
                      isActive
                        ? 'border-[#1B4332] text-[#1B4332] bg-[#D8F3DC] rounded-xl shadow-xs'
                        : 'border-transparent text-slate-700 hover:text-[#1B4332] hover:bg-white hover:shadow-xs hover:border-[#1B4332]/40 rounded-xl'
                    }`}
                  >
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-[#1B4332]" />
                    <span className="font-display">{tab.label}</span>
                  </button>
                );
              })}
          </div>
        </div>
      </nav>

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
                  <span className="block text-sm font-black text-slate-600 uppercase tracking-wider leading-tight">{t('Rehistradong mga Mag-uuma', 'Registered Farmers')}</span>
                  <span className="text-2xl sm:text-3xl font-black text-[#1B4332] font-mono leading-tight block break-words">{registeredMembersCount} {t('Miyembro', 'Members')}</span>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-4 sm:p-6 flex items-center gap-4 sm:gap-5 shadow-sm min-w-0">
                <div className="p-3 sm:p-4 rounded-2xl bg-emerald-100 text-[#1B4332] shrink-0">
                  <Boxes className="w-8 h-8 sm:w-10 sm:h-10" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-slate-600 uppercase tracking-wider leading-tight">{t('Mga gamit ug abangan sa komunidad', 'Community rentals')}</span>
                  <span className="text-xl sm:text-2xl font-black text-[#1B4332] font-mono leading-tight block break-words">{t('Lingkoranan ug sako', 'Chairs & sacks')}</span>
                </div>
              </div>

            </div>

            {/* Quick Introduction Banner */}
            <div className="bg-white rounded-3xl p-4 sm:p-6 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center shadow-md min-w-0">
              <div className="md:col-span-8 space-y-3 sm:space-y-4 min-w-0">
                <h3 className="text-lg sm:text-xl md:text-2xl font-black text-[#1B4332] font-display break-words">
                  {t('Mahitungod sa Alegria Farmers Association', 'About Alegria Farmers Association')}
                </h3>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-4 pt-2">
                  <button
                    onClick={() => setActiveTab('history')}
                    className="w-full sm:w-auto bg-[#1B4332] hover:bg-[#143326] text-white font-black text-xs sm:text-sm px-4 sm:px-5 py-3 rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-all shadow shrink-0"
                  >
                    <span>{t('Basaha ang among kasaysayan', 'Read our history')}</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                  <button
                    onClick={() => setActiveTab('products')}
                    className="w-full sm:w-auto bg-white border-2 border-[#9E9785] text-[#1B4332] hover:bg-slate-50 font-black text-xs sm:text-sm px-4 sm:px-5 py-3 rounded-xl cursor-pointer transition-all flex items-center justify-center shrink-0"
                  >
                    <span>{t('Tan-awa ang among mga produkto', 'View our products')}</span>
                  </button>
                </div>
              </div>


            </div>

            {/* LATEST ANNOUNCEMENTS & ACTIVITIES PREVIEW BANNER */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Latest Announcements Preview */}
              <div className="bg-white rounded-3xl p-4 sm:p-6 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#D5CFC1] pb-2.5">
                  <h4 className="font-black text-[#1B4332] text-sm sm:text-base flex items-center gap-2">
                    <Megaphone className="w-4 h-4 sm:w-5 sm:h-5 text-[#BF360C]" />
                    <span>{t('Pahibalo', 'Announcements')}</span>
                  </h4>
                  <button
                    onClick={() => setActiveTab('announcements')}
                    className="text-xs font-black text-[#BF360C] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>{t('Tan-awa ang tanan', 'View all')}</span>
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
                          {priorityLabel(ann.priority)} {t('prayoridad', 'priority')}
                        </span>
                        <span className="text-slate-500 font-semibold">{ann.datePosted}</span>
                      </div>
                      <h5 className="font-black text-slate-900 text-sm sm:text-base">{ann.title}</h5>
                      <p className="text-sm text-slate-700 line-clamp-2">{ann.content}</p>
                    </div>
                  ))}
                  {announcements.length === 0 && (
                    <p className="text-sm text-slate-600 italic text-center py-4">{t('Walay bag-ong pahibalo karon.', 'There are no new announcements right now.')}</p>
                  )}
                </div>
              </div>

              {/* Upcoming Community Activities Preview */}
              <div className="bg-white rounded-3xl p-4 sm:p-6 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#D5CFC1] pb-2.5">
                  <h4 className="font-black text-[#1B4332] text-sm sm:text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-700" />
                    <span>{t('Kalihokan', 'Activities')}</span>
                  </h4>
                  <button
                    onClick={() => setActiveTab('activities')}
                    className="text-xs font-black text-emerald-800 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>{t('Tan-awa ang tanan', 'View all')}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2.5">
                  {activities.slice(0, 3).map((act) => (
                    <div key={act.id} className="p-3 bg-[#FAF8F5] rounded-2xl space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded font-black text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                            {act.category}
                          </span>
                          <span className={`px-2 py-0.5 rounded font-black text-[10px] border ${
                            act.status === 'Completed' ? 'bg-slate-100 text-slate-700 border-slate-300' :
                            act.status === 'In Progress' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                            act.status === 'Postponed' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                            act.status === 'Cancelled' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                            'bg-blue-100 text-blue-800 border-blue-300'
                          }`}>
                            {activityStatusLabel(act.status)}
                          </span>
                        </div>
                        <span className="text-slate-700 font-semibold">
                          {t('Petsa ug oras:', 'Date and time:')} {act.scheduledDate || act.dateScheduled} • {act.scheduledTime || act.timeScheduled}
                        </span>
                      </div>
                      <h5 className="font-black text-slate-900 text-sm sm:text-base">{act.title}</h5>
                      {act.statusReason && (act.status === 'Postponed' || act.status === 'Cancelled') && (
                        <p className={`text-xs leading-relaxed ${
                          act.status === 'Cancelled' ? 'text-rose-800' : 'text-orange-800'
                        }`}>
                          <strong>{act.status === 'Cancelled' ? t('Rason sa pagkansela:', 'Cancellation reason:') : t('Rason sa pagbalhin sa petsa:', 'Postponement reason:')}</strong>{' '}
                          {act.statusReason}
                        </p>
                      )}
                      <div className="text-[11px] text-slate-600 flex items-center gap-2 flex-wrap font-medium">
                        <span className="flex items-center gap-1"><MapPin className="w-4 h-4 text-slate-600" />{act.location}</span>
                        <span className="flex items-center gap-1">{act.targetAudience}</span>
                      </div>
                    </div>
                  ))}
                  {activities.length === 0 && (
                    <p className="text-sm text-slate-600 italic text-center py-4">{t('Walay naka-eskedyul nga kalihokan karon.', 'There are no scheduled activities right now.')}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Portal Switch Card */}
            <div className="bg-[#FFF8E1] rounded-3xl p-4 sm:p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm min-w-0">
              <div className="space-y-1 min-w-0">
                <h4 className="text-base sm:text-lg font-black text-[#5D4037] flex items-center gap-2 flex-wrap break-words">
                  <Milestone className="w-5 h-5 sm:w-6 sm:h-6 text-[#FFB300] shrink-0" />
                  <span>{t('Rehistrado ba ikaw nga miyembro o opisyal sa AFA?', 'Are you a registered AFA member or officer?')}</span>
                </h4>
              </div>
              <button
                onClick={onEnterLogin}
                className="w-full md:w-auto bg-[#BF360C] hover:bg-[#8D2300] text-white font-black text-xs sm:text-sm px-5 sm:px-6 py-3 sm:py-3.5 rounded-2xl cursor-pointer shadow-md shrink-0 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span>{t('Sulod sa portal sa miyembro / opisyal', 'Open the member / officer portal')}</span>
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
                  {t('Opisyal nga mga Pahibalo', 'Official Announcements')}
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
                        {priorityLabel(ann.priority)} {t('prayoridad', 'priority')}
                      </span>
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {t('Gipatik:', 'Posted:')} {ann.datePosted}
                      </span>
                    </div>

                    <h4 className="text-base sm:text-lg font-black text-[#1B4332] leading-snug">{ann.title}</h4>
                    <p className="text-sm sm:text-base text-slate-800 leading-relaxed font-medium">{ann.content}</p>
                  </div>

                  <div className="pt-3 border-t border-[#F0EBE1] flex items-center justify-between text-xs text-slate-500 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-emerald-700" />
                      {ann.category}
                    </span>
                    <span>{t('Gipatik ni:', 'Posted by:')} {ann.postedBy}</span>
                  </div>
                </div>
              ))}
              {announcements.length === 0 && (
                <div className="col-span-full bg-white p-8 rounded-3xl border-2 border-[#D5CFC1] text-center text-slate-500 font-bold text-sm">
                  {t('Walay opisyal nga pahibalo sa pagkakaron.', 'There are no official announcements right now.')}
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
                  {t('Kalihokan sa Komunidad', 'Community Activities')}
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
                        act.status === 'Postponed' ? 'bg-orange-100 text-orange-800 border border-orange-300' :
                        act.status === 'Cancelled' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                        'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {activityStatusLabel(act.status)}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-base sm:text-lg font-black text-[#1B4332] leading-snug">{act.title}</h4>
                      {act.cebTitle && <span className="text-xs text-slate-600 font-bold block mt-0.5">{act.cebTitle}</span>}
                    </div>

                    <p className="text-sm sm:text-base text-slate-800 leading-relaxed font-medium">{act.description}</p>
                    {act.statusReason && (act.status === 'Postponed' || act.status === 'Cancelled') && (
                      <p className={`rounded-xl border p-3 text-xs leading-relaxed ${
                        act.status === 'Cancelled'
                          ? 'border-rose-200 bg-rose-50 text-rose-900'
                          : 'border-orange-200 bg-orange-50 text-orange-900'
                      }`}>
                        <strong>{act.status === 'Cancelled' ? t('Rason sa pagkansela:', 'Cancellation reason:') : t('Rason sa pagbalhin sa petsa:', 'Postponement reason:')}</strong>{' '}
                        {act.statusReason}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[#F0EBE1] space-y-1.5 text-xs text-slate-600 font-bold">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="flex items-center gap-1 text-slate-800"><Calendar aria-hidden="true" className="w-4 h-4 text-emerald-700 shrink-0" />{t('Petsa ug oras:', 'Date and time:')} {act.scheduledDate || act.dateScheduled} • {act.scheduledTime || act.timeScheduled}</span>
                      <span className="flex items-center gap-1 text-slate-800"><MapPin aria-hidden="true" className="w-4 h-4 text-rose-700 shrink-0" />{t('Lugar:', 'Location:')} {act.location}</span>
                    </div>
                    <div className="text-sm text-slate-700">{t('Kinsa ang apil:', 'For:')} {act.targetAudience}</div>
                  </div>
                </div>
              ))}
              {activities.length === 0 && (
                <div className="col-span-full bg-white p-8 rounded-3xl border-2 border-[#D5CFC1] text-center text-slate-500 font-bold text-sm">
                  {t('Walay natala nga kalihokan sa pagkakaron.', 'There are no activities listed right now.')}
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
                {t('Atong Kasaysayan', 'Our History')}
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start pt-2 min-w-0">
              <div className="lg:col-span-8 space-y-4 sm:space-y-6 text-xs sm:text-sm md:text-base text-slate-700 leading-relaxed font-semibold min-w-0 break-words">
                {en ? (
                  <>
                    <p>
                      <strong className="text-[#1B4332]">Alegria Farmers Association (AFA)</strong> began as a small group of farmers in Barangay Alegria, Tuburan, Cebu.
                      Before the association was established, farmers struggled to sell their harvest because markets were far away and middlemen offered low prices.
                    </p>
                    <p>
                      In 2000, with support from the local government and the Department of Agriculture (DA), the association was officially registered and established.
                      Its goal was to bring together Alegria's four sitios (Tapon, Pundok 1, Pundok 2, and Lamak) so farmers could speak and work together.
                      The association is now led by President {resolveOfficerName(users, 'President')}.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      Ang <strong className="text-[#1B4332]">Alegria Farmers Association (AFA)</strong> nagsugod isip usa ka gamay nga grupo sa mga mag-uuma sa Barangay Alegria, Tuburan, Cebu.
                      Sa wala pa matukod ang asosasyon, naglisod ang mga mag-uuma sa pagbaligya sa ilang abot tungod kay layo ang merkado ug ubos ang presyo nga gitanyag sa mga mamalitay.
                    </p>
                    <p>
                      Niadtong 2000, uban sa suporta sa lokal nga kagamhanan ug Department of Agriculture (DA), opisyal nga natukod ug narehistro ang asosasyon.
                      Tumong niini nga mahiusa ang upat ka sitio sa Alegria (Tapon, Pundok 1, Pundok 2, ug Lamak) aron magtinabangay ug maghiusa ang mga mag-uuma.
                      Gipangulohan karon sa Presidente nga si {resolveOfficerName(users, 'President')} ang asosasyon.
                    </p>
                  </>
                )}

                <div className="bg-[#FAF8F5] border-l-4 border-[#1B4332] p-4 sm:p-5 rounded-r-2xl space-y-2 min-w-0 break-words">
                  <h4 className="font-black text-[#1B4332] text-sm sm:text-base uppercase tracking-wider">{t('Atong Misyon', 'Our Mission')}</h4>
                  <p className="text-sm sm:text-base text-slate-800 leading-relaxed italic">
                    {t(
                      '"Paghatag og kasaligan, malungtaron, ug de-kalidad nga suporta sa matag mag-uuma pinaagi sa pundo, makinarya, libreng liso, ug modernong kahibalo aron masiguro ang kauswagan sa matag pamilya sa Alegria."',
                      '"To provide reliable, sustainable, and quality support to every farmer through funding, equipment, seeds, and modern knowledge, helping every family in Alegria prosper."'
                    )}
                  </p>
                </div>
              </div>

              <div className="lg:col-span-4 space-y-6 min-w-0">
                <div className="bg-[#FAF8F5] border-2 border-[#D5CFC1] p-4 sm:p-6 rounded-2xl space-y-3.5 min-w-0">
                  <h4 className="font-black text-[#1B4332] text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5 border-b border-[#D5CFC1] pb-2 font-display break-words">
                    <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-[#BF360C] shrink-0" />
                    <span>{t('Atong mga Prinsipyo', 'Our Core Values')}</span>
                  </h4>
                  <div className="space-y-3 text-xs sm:text-sm text-slate-700 min-w-0">
                    <div className="space-y-1 text-left min-w-0 break-words">
                      <strong className="text-[#1B4332] block font-bold">{t('1. Pagkahiusa', '1. Unity')}</strong>
                      <p className="text-slate-700 font-medium text-sm">{t('Usa ka pamilya, usa ka tinguha para sa tanan.', 'One community, working toward shared goals.')}</p>
                    </div>
                    <div className="space-y-1 text-left min-w-0 break-words">
                      <strong className="text-[#1B4332] block font-bold">{t('2. Kamatinud-anon', '2. Transparency')}</strong>
                      <p className="text-slate-700 font-medium text-sm">{t('Limpyo ug bukas nga pagdumala sa kwarta ug pundo.', 'Managing money and resources honestly and openly.')}</p>
                    </div>
                    <div className="space-y-1 text-left min-w-0 break-words">
                      <strong className="text-[#1B4332] block font-bold">{t('3. Kakugi', '3. Diligence')}</strong>
                      <p className="text-slate-700 font-medium text-sm">{t('Walay hunong nga pagpaningkamot sa yuta ug uma.', 'Working steadily to care for our land and farms.')}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#EAF4EC] border-2 border-[#1B4332]/30 p-4 sm:p-6 rounded-2xl space-y-3.5 text-left min-w-0">
                  <h4 className="font-black text-[#1B4332] text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5 border-b border-emerald-950/15 pb-2 font-display break-words">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#1B4332] shrink-0" />
                    <span>{t('Opisyales sa AFA (2026)', 'AFA Officers (2026)')}</span>
                  </h4>
                  <div className="space-y-2 text-xs text-slate-700 font-medium min-w-0">
                    {resolveOfficerRoster(users).map((officer, i) => (
                      <div key={i} className="flex items-center justify-between border-b border-emerald-950/10 pb-1.5 gap-2 min-w-0">
                        <span className="font-extrabold text-[#1B4332] text-[11px] sm:text-xs shrink-0">{officer.title}:</span>
                        <span className="font-bold text-slate-800 text-[11px] sm:text-xs text-right break-words min-w-0">{officer.name}</span>
                      </div>
                    ))}
                  </div>

                  <h4 className="font-black text-[#1B4332] text-[11px] sm:text-xs uppercase tracking-wider pt-2 border-t border-emerald-950/15 font-display break-words">
                    {t('Lupon sa mga Direktor (BOD)', 'Board of Directors (BOD)')}
                  </h4>
                  {boardMemberNames.length > 0 ? (
                    <ul className="list-disc pl-4 text-xs text-slate-700 space-y-1 font-semibold break-words">
                      {boardMemberNames.map((name, i) => <li key={`${name}-${i}`}>{name}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm font-medium text-slate-700">{t('Wala pay natudlong miyembro sa lupon.', 'No board members have been designated yet.')}</p>
                  )}
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
                  {t('Mahinungdanong mga Kalampusan', 'Key Milestones')}
                </h3>
              </div>
            </div>

            {/* Timeline View */}
            <div className="relative border-l-3 sm:border-l-4 border-[#1B4332] ml-3 sm:ml-8 pl-4 sm:pl-10 space-y-6 sm:space-y-8 min-w-0">
              {[...displayAchievements]
                .sort((a, b) => b.year.localeCompare(a.year) || a.title.localeCompare(b.title))
                .map((item) => {
                const Icon = {
                  Trophy,
                  Award,
                  ShieldCheck,
                  BookOpen,
                  Milestone
                }[item.icon] || Trophy;
                return (
                  <div key={item.id} className="relative space-y-2 animate-slide-up bg-white p-4 sm:p-6 rounded-2xl border-2 border-[#D5CFC1] hover:border-[#1B4332] hover:shadow-lg hover:-translate-y-0.5 hover:bg-[#FAFDFB] transition-all duration-200 shadow-sm min-w-0">
                    {/* Circle badge on timeline line */}
                    <div className="absolute -left-[17px] sm:-left-[22px] top-5 sm:top-6 bg-[#1B4332] text-white p-1.5 sm:p-2 rounded-full border-2 sm:border-4 border-[#FAF7F2] shadow-md z-10 flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 flex-wrap min-w-0">
                      <span className="text-base sm:text-lg font-mono font-black text-[#BF360C]">{item.year}</span>
                    </div>

                    <h4 className="text-sm sm:text-base md:text-lg font-black text-[#1B4332] font-display break-words leading-tight">
                      {en ? item.title : (item.cebTitle || item.title)}
                    </h4>

                    <p className="text-xs sm:text-sm text-slate-700 font-semibold leading-relaxed break-words">
                      {item.description}
                    </p>
                  </div>
                );
              })}
              {displayAchievements.length === 0 && (
                <div className="bg-white border-2 border-dashed border-[#D5CFC1] rounded-2xl p-6 text-sm text-slate-600">
                  {t('Wala pay gipatik nga mga kalampusan ang asosasyon.', 'The association has not published any achievements yet.')}
                </div>
              )}
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
                  {t('Lista sa mga Produkto', 'Product Catalog')}
                </h3>
              </div>
            </div>

            {/* Products Grid — condensed cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 min-w-0">
              {displayProducts.map((prod) => {
                const Icon = prod.category.includes('Rental') ? Boxes : Coffee;
                const cardColor = prod.category.includes('Rental')
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                  : 'bg-stone-100 border-stone-300 text-stone-900';
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => setSelectedProductModal(prod)}
                    aria-label={`${t('Tan-awa ang detalye sa', 'View details for')} ${prod.name}`}
                    className="w-full min-h-24 text-left bg-white border-2 border-[#D5CFC1] hover:border-[#1B4332] hover:shadow-lg transition-all duration-200 rounded-2xl p-4 flex items-start gap-3 min-w-0 cursor-pointer group"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <h4 className="text-sm font-black text-[#1B4332] font-display leading-snug break-words group-hover:text-emerald-800 transition-colors">
                        {prod.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm uppercase font-black px-2 py-0.5 rounded-full bg-emerald-100 text-[#1B4332] border border-emerald-200">
                          {prod.category}
                        </span>
                        {prod.category?.includes('Rental') && (
                          <span className="text-sm font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                            {t('Abangan sa tanan', 'Open to everyone')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 font-semibold leading-relaxed line-clamp-2 break-words">
                        {prod.description}
                      </p>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-sm font-bold text-slate-700 truncate">
                          {prod.quantityAvailable || prod.unit}
                        </span>
                        <span className="text-xs font-mono font-black text-[#BF360C] shrink-0">
                          PHP {prod.price.toLocaleString()}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 pt-1 text-sm font-black text-[#1B4332]">
                        {t('Tan-awa ang detalye', 'View details')}
                        <ArrowRight aria-hidden="true" className="w-4 h-4" />
                      </span>
                    </div>
                  </button>
                );
              })}
              {displayProducts.length === 0 && (
                <p className="col-span-full bg-white p-6 rounded-2xl border-2 border-[#D5CFC1] text-center text-base font-semibold text-slate-700">
                  {t('Walay produkto nga gilista karon.', 'No products are listed right now.')}
                </p>
              )}
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
              <span className="font-black text-sm tracking-wider uppercase">{t('Rehistradong Portal sa LGU ug DA', 'LGU & DA Registered Portal')}</span>
            </span>
            <a href="/privacy" className="inline-flex min-h-11 items-center text-sm font-bold text-[#D8F3DC] hover:text-white hover:underline">{t('Palisiya sa Pribasiya', 'Privacy Policy')}</a>
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
            ref={productDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-dialog-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
          >
            {/* HEADER */}
            <div className="relative bg-[#1B4332] px-5 py-4 sm:px-6 sm:py-5 text-white shrink-0">
              <button
                ref={productDialogCloseRef}
                type="button"
                onClick={() => setSelectedProductModal(null)}
                className="absolute top-3 right-3 min-w-11 min-h-11 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                aria-label={t('Sirad-i ang mga detalye sa produkto', 'Close product details')}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3 sm:gap-4 pr-10 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-100 border border-emerald-300/30">
                      {selectedProductModal.category || t('Kinatibuk-an', 'General')}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${selectedProductModal.category?.includes('Rental') ? 'bg-amber-300 text-amber-950' : 'bg-white/20 text-white'}`}>
                      {selectedProductModal.category?.includes('Rental') ? t('Abangan sa tanan', 'Rentable by all') : selectedProductModal.stockStatus || t('Anaa', 'Available')}
                    </span>
                  </div>
                  <h3 id="product-dialog-title" className="text-lg sm:text-xl font-black leading-tight break-words">{selectedProductModal.name}</h3>
                </div>
              </div>
            </div>

            {/* BODY */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-left">

              {/* PRICE + STOCK TILES */}
              <div className="grid grid-cols-2 gap-3 items-stretch">
                <div className="rounded-2xl border-2 border-[#F0D5B4] bg-[#FFF7EC] px-4 py-3 flex flex-col justify-between">
                  <span className="block text-[10px] font-black uppercase tracking-wider text-[#8A5A1E]">
                    {t('Presyo', 'Price')}
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
                    {t('Anaa', 'Availability')}
                  </span>
                  <span className="block text-sm sm:text-base font-black text-[#1B4332] mt-1 break-words leading-snug">
                    {selectedProductModal.quantityAvailable || selectedProductModal.stockStatus || t('Anaa sa stock', 'In stock')}
                  </span>
                </div>
              </div>

              {/* DESCRIPTION */}
              {(selectedProductModal.desc || selectedProductModal.description) && (
                <div className="space-y-1.5">
                  <h4 className="text-sm font-black uppercase tracking-wider text-[#4A5F57]">
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
                  <h4 className="text-sm font-black uppercase tracking-wider text-[#4A5F57]">
                    {t('Detalye', 'Specifications')}
                  </h4>
                  <p className="text-sm font-semibold text-slate-800 bg-[#FAF8F5] border border-[#E9E4D9] rounded-xl px-3 py-2 break-words">
                    {selectedProductModal.specs}
                  </p>
                </div>
              )}

              {/* CUSTODIAN */}
              <div className="rounded-2xl border-2 border-[#E9E4D9] bg-[#FAF8F5] px-4 py-3 space-y-2">
                <h4 className="text-sm font-black uppercase tracking-wider text-[#4A5F57] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>{t('Magtatag-iya / Custodian', 'Custodian')}</span>
                </h4>
                <p className="text-sm font-black text-[#1B4332] break-words">
                  {selectedProductModal.farmerName || selectedProductModal.contactPerson || t('Komite sa AFA', 'AFA Committee')}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-slate-800">
                  {selectedProductModal.farmerSitio && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#2D6A4F] shrink-0" /> {selectedProductModal.farmerSitio}
                    </span>
                  )}
                  {selectedProductModal.farmerPhone && (
                    <a
                      href={`tel:${String(selectedProductModal.farmerPhone).replace(/[^\d+]/g, '')}`}
                      className="min-h-11 inline-flex items-center gap-2 font-mono text-[#9A2D0A] underline underline-offset-2"
                    >
                      <Phone className="w-4 h-4 shrink-0" />
                      <span>{t('Tawag:', 'Call:')} {selectedProductModal.farmerPhone}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* FOOTER */}
            <div className="bg-[#FAF8F5] px-4 sm:px-6 py-3 border-t border-[#E9E4D9] shrink-0">
              <button
                type="button"
                onClick={() => setSelectedProductModal(null)}
                className="w-full min-h-11 py-2.5 bg-[#1B4332] hover:bg-[#143326] text-base font-black rounded-xl cursor-pointer transition-colors"
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

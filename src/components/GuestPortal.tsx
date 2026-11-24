import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Trophy, BookOpen, LogIn, ArrowRight, Sparkles, ShoppingBag,
  Heart, Milestone, Calendar, Users, Award, ShieldCheck,
  Check, Megaphone, MapPin, Clock, Tag, Boxes, Phone, X,
  Sprout, Copy, CalendarPlus, MessageSquare, Compass
} from 'lucide-react';
import {
  LivestockIgpState, Member, PublicProduct, Announcement,
  AssociationActivity, AssociationAchievement, User
} from '../types';
import { resolveBoardMemberNames, resolveOfficerName, resolveOfficerRoster } from '../utils/officers';
import { getTotalAvailableEggCount, isEggCatalogProduct } from '../utils/eggInventory';
import { useLanguage } from '../i18n/LanguageContext';

/** Shape returned by GET /api/public/summary (aggregates + officer names only). */
export interface PublicSummary {
  success: boolean;
  totalMembers: number;
  activeMembers: number;
  officers: { role: string; name: string }[];
  boardMembers: string[];
  announcements: Announcement[];
  activities: AssociationActivity[];
}

export type PortalTabId = 'products' | 'announcements' | 'activities' | 'about';

interface GuestPortalProps {
  onEnterLogin: () => void;
  onOpenPrivacy?: () => void;
  members: Member[];
  livestockIgp: LivestockIgpState;
  products?: PublicProduct[];
  announcements?: Announcement[];
  activities?: AssociationActivity[];
  achievements?: AssociationAchievement[];
  users?: User[];
  cachedSummary?: PublicSummary | null;
  cachedAchievements?: AssociationAchievement[] | null;
  cachedProducts?: PublicProduct[] | null;
  onPublicDataLoaded?: (payload: {
    summary?: PublicSummary;
    achievements?: AssociationAchievement[];
    products?: PublicProduct[];
  }) => void;
}

/** Module-level fallback cache so navigating to/from Login never flashes blank. */
const portalMemoryCache: {
  summary: PublicSummary | null;
  achievements: AssociationAchievement[] | null;
  products: PublicProduct[] | null;
} = {
  summary: null,
  achievements: null,
  products: null
};

const isPoultryProject = (produce: string) => /poultry|rtl|manok|chicken/i.test(produce);

export const UPCOMING_HARVEST_TAG = 'Upcoming Harvest';

export const getPublishedProducts = (products: PublicProduct[], livestockIgp?: LivestockIgpState) => {
  const eggProduct = products.find(isEggCatalogProduct);
  const publishedProducts = products.filter(product =>
    product.isPublished && (!eggProduct || product.id !== eggProduct.id) && !isEggCatalogProduct(product)
  );

  if (!eggProduct || !livestockIgp) {
    return products.filter(product => product.isPublished);
  }

  const availableEggs = getTotalAvailableEggCount(
    livestockIgp.eggHarvests || [],
    livestockIgp.sales || []
  );

  // If verified egg stock is available and a price is configured, auto-publish with live stock.
  if (availableEggs > 0 && Number.isFinite(eggProduct.price) && eggProduct.price > 0) {
    const automaticEggListing: PublicProduct = {
      ...eggProduct,
      isPublished: true,
      stockStatus: 'In Stock',
      quantityAvailable: `${availableEggs.toLocaleString()} eggs available`
    };
    return [...publishedProducts, automaticEggListing];
  }

  // Keep published IGP egg products visible with an "Upcoming Harvest" badge instead of hiding them.
  if (eggProduct.isPublished) {
    const upcomingEggListing: PublicProduct = {
      ...eggProduct,
      isPublished: true,
      stockStatus: 'Pre-Order',
      quantityAvailable: UPCOMING_HARVEST_TAG
    };
    return [...publishedProducts, upcomingEggListing];
  }

  return publishedProducts;
};

export const formatProductQuantity = (product: PublicProduct, en: boolean): string => {
  const raw = String(product.quantityAvailable || '').trim();
  if (!raw) {
    return product.unit || (en ? 'Available' : 'Anaa');
  }
  if (/^upcoming harvest$/i.test(raw)) {
    return en ? 'Upcoming Harvest' : 'Umaabot nga Harvest';
  }
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const formattedNumber = Number(raw).toLocaleString();
    const unitLower = String(product.unit || '').toLowerCase();
    if (/kilo|kg|\bkl\b/.test(unitLower) || /pastil/i.test(product.name)) {
      return `${formattedNumber} kl`;
    }
    if (product.unit) {
      return `${formattedNumber} ${product.unit.replace(/^(per|matag)\s+/i, '')}`;
    }
    return `${formattedNumber} ${en ? 'units' : 'buok'}`;
  }
  const eggsMatch = raw.match(/^([\d,]+)\s+eggs available$/i);
  if (eggsMatch && !en) {
    return `${eggsMatch[1]} itlog nga anaa`;
  }
  return raw;
};

export const resolveProductArtwork = (product: PublicProduct): string => {
  if (product.imageUrl && product.imageUrl.trim()) {
    return product.imageUrl.trim();
  }
  const signature = `${product.name || ''} ${product.cebName || ''} ${product.category || ''} ${product.description || ''}`;
  if (/pastil|kakanin|cooked|food|rice|balot/i.test(signature)) {
    return '/assets/product-pastil.jpg';
  }
  if (/chair|lingkoranan|monobloc|sack|sako|rental|abangan|tent|table/i.test(signature)) {
    return '/assets/product-chairs.jpg';
  }
  if (/egg|itlog|poultry|chicken|manok/i.test(signature)) {
    return '/assets/product-eggs.jpg';
  }
  return '/assets/hero-alegria.jpg';
};

const CEB_MONTHS = ['ENE', 'PEB', 'MAR', 'ABR', 'MAY', 'HUN', 'HUL', 'AGO', 'SEP', 'OKT', 'NOB', 'DIS'];
const EN_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const parseCalendarLeaf = (dateStr: string | undefined, en: boolean): { month: string; day: string; year: string } => {
  if (!dateStr) return { month: en ? 'TBA' : 'PETSA', day: '--', year: '' };
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const monthIdx = Math.max(0, Math.min(11, Number(isoMatch[2]) - 1));
    const day = isoMatch[3].padStart(2, '0');
    return { month: (en ? EN_MONTHS : CEB_MONTHS)[monthIdx], day, year };
  }
  const parsed = new Date(dateStr);
  if (!Number.isNaN(parsed.getTime())) {
    const monthIdx = parsed.getMonth();
    const day = String(parsed.getDate()).padStart(2, '0');
    return { month: (en ? EN_MONTHS : CEB_MONTHS)[monthIdx], day, year: String(parsed.getFullYear()) };
  }
  return { month: en ? 'DATE' : 'PETSA', day: dateStr.slice(0, 2), year: '' };
};

const getInitials = (name: string): string => {
  const parts = name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'AF';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const SITIO_PROFILES = [
  {
    id: 'Sitio Tapon',
    name: 'Sitio Tapon',
    tagCeb: 'Sentro & Merkado',
    tagEn: 'Hub & Market',
    cropsCeb: 'Mais, Lubi, Utanon, ug Baboyan/Manokan (IGP)',
    cropsEn: 'Corn, Coconut, Vegetables & Poultry/Hog IGP',
    focusCeb: 'Sentro sa tigomanan, bodega sa abangan (lingkoranan ug sako), ug bagsakan sa abot.',
    focusEn: 'Assembly hub, community rental depot (chairs & sacks), and collective harvest trading post.',
    coordinatorCeb: 'Koordineytor sa Sitio Tapon • AFA Executive Committee',
    coordinatorEn: 'Sitio Tapon Coordinator • AFA Executive Committee'
  },
  {
    id: 'Sitio Pundok 1',
    name: 'Sitio Pundok 1',
    tagCeb: 'Bukirang Uma',
    tagEn: 'Upland Farms',
    cropsCeb: 'Saging, Kakaw, Kape, ug Lagutmon',
    cropsEn: 'Banana, Cacao, Coffee & Root Crops',
    focusCeb: 'Nag-unang tig-suplay sa preskong prutas, saging, ug organikong abot sa kabukiran.',
    focusEn: 'Primary supplier of fresh upland produce, bananas, cacao, and smallholder orchard crops.',
    coordinatorCeb: 'Koordineytor sa Sitio Pundok 1 • Board Representative',
    coordinatorEn: 'Sitio Pundok 1 Coordinator • Board Representative'
  },
  {
    id: 'Sitio Pundok 2',
    name: 'Sitio Pundok 2',
    tagCeb: 'Anihan & Kape',
    tagEn: 'Harvest & Crops',
    cropsCeb: 'Mais, Saging, Kamote, ug Preskong Utanon',
    cropsEn: 'Corn, Banana, Sweet Potato & Fresh Greens',
    focusCeb: 'Aktibo sa bayani-style nga pag-uma, binhi nga programa, ug pag-andam sa lokal nga Pastil.',
    focusEn: 'Active in bayanihan crop sharing, DA seed dispersal, and local Pastil food processing.',
    coordinatorCeb: 'Koordineytor sa Sitio Pundok 2 • Board Representative',
    coordinatorEn: 'Sitio Pundok 2 Coordinator • Board Representative'
  },
  {
    id: 'Sitio Lamak',
    name: 'Sitio Lamak',
    tagCeb: 'Basakan & Tubig',
    tagEn: 'Lowland & Terraces',
    cropsCeb: 'Humay, Mais, Lubi, ug Itlog sa Manok',
    cropsEn: 'Rice, Corn, Coconut & Free-Range Eggs',
    focusCeb: 'Tabunok nga basakan ug nagsuporta sa poultry layer ug sustenableng patubig.',
    focusEn: 'Fertile lowland terraces supporting rice production, irrigation stewardship, and poultry layers.',
    coordinatorCeb: 'Koordineytor sa Sitio Lamak • Board Representative',
    coordinatorEn: 'Sitio Lamak Coordinator • Board Representative'
  },
  {
    id: 'Sitio Patag 1',
    name: 'Sitio Patag 1',
    tagCeb: 'Patag & Uma',
    tagEn: 'Plains & Farming',
    cropsCeb: 'Mais, Utanon, Lubi, ug Hayopan',
    cropsEn: 'Corn, Vegetables, Coconut & Livestock',
    focusCeb: 'Patag nga umahan alang sa produksyon sa mais, utanon, ug komunal nga pag-atiman sa hayopan.',
    focusEn: 'Fertile plains supporting corn cultivation, vegetable farming, and communal livestock raising.',
    coordinatorCeb: 'Koordineytor sa Sitio Patag 1 • Board Representative',
    coordinatorEn: 'Sitio Patag 1 Coordinator • Board Representative'
  }
] as const;

export default function GuestPortal({
  onEnterLogin,
  onOpenPrivacy,
  members,
  livestockIgp,
  products = [],
  announcements = [],
  activities = [],
  achievements = [],
  users = [],
  cachedSummary = null,
  cachedAchievements = null,
  cachedProducts = null,
  onPublicDataLoaded
}: GuestPortalProps) {
  const { isEnglish: en, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<PortalTabId>('products');
  const [selectedSitioId, setSelectedSitioId] = useState<string>(SITIO_PROFILES[0].id);
  const [announcementFilter, setAnnouncementFilter] = useState<string>('All');
  const [activityFilter, setActivityFilter] = useState<string>('All');
  const [productFilter, setProductFilter] = useState<string>('All');
  const [portalToast, setPortalToast] = useState<string | null>(null);

  const initialSummary = cachedSummary || portalMemoryCache.summary;
  const initialAchievements = cachedAchievements || portalMemoryCache.achievements || achievements;
  const initialProductsSource = cachedProducts || portalMemoryCache.products || products;

  const [summary, setSummary] = useState<PublicSummary | null>(initialSummary);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(!initialSummary && announcements.length === 0 && activities.length === 0 && members.length === 0);
  const [displayAchievements, setDisplayAchievements] = useState<AssociationAchievement[]>(initialAchievements);
  const [displayProducts, setDisplayProducts] = useState<PublicProduct[]>(() =>
    getPublishedProducts(initialProductsSource, livestockIgp)
  );
  const [displayAnnouncements, setDisplayAnnouncements] = useState<Announcement[]>(
    initialSummary?.announcements ?? announcements
  );
  const [displayActivities, setDisplayActivities] = useState<AssociationActivity[]>(
    initialSummary?.activities ?? activities
  );
  const [selectedProductModal, setSelectedProductModal] = useState<PublicProduct | null>(null);
  const productDialogRef = useRef<HTMLDivElement>(null);
  const productDialogCloseRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const notifyPortal = (message: string) => {
    setPortalToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setPortalToast(null), 2800);
  };

  useEffect(() => {
    document.body.classList.add('has-mobile-dock');
    return () => {
      document.body.classList.remove('has-mobile-dock');
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (cachedSummary) {
      portalMemoryCache.summary = cachedSummary;
      setSummary(cachedSummary);
      setIsLoadingSummary(false);
      if (Array.isArray(cachedSummary.announcements)) setDisplayAnnouncements(cachedSummary.announcements);
      if (Array.isArray(cachedSummary.activities)) setDisplayActivities(cachedSummary.activities);
    }
  }, [cachedSummary]);

  useEffect(() => {
    if (achievements.length > 0 && !portalMemoryCache.achievements) {
      setDisplayAchievements(achievements);
    }
  }, [achievements]);

  useEffect(() => {
    setDisplayAnnouncements(previous => (previous.length === 0 ? announcements : previous));
  }, [announcements]);

  useEffect(() => {
    setDisplayActivities(previous => (previous.length === 0 ? activities : previous));
  }, [activities]);

  useEffect(() => {
    const mergedSource = cachedProducts || portalMemoryCache.products || products;
    setDisplayProducts(getPublishedProducts(mergedSource, livestockIgp));
  }, [products, livestockIgp, cachedProducts]);

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
          const list = [...refreshedProducts.values()];
          portalMemoryCache.products = list;
          setDisplayProducts(getPublishedProducts(list, livestockIgp));
          onPublicDataLoaded?.({ products: list });
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
          portalMemoryCache.achievements = result.achievements;
          setDisplayAchievements(result.achievements);
          onPublicDataLoaded?.({ achievements: result.achievements });
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
    let active = true;
    fetch('/api/public/summary')
      .then(async response => {
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        return response.json();
      })
      .then(result => {
        if (active && result?.success) {
          const loaded = result as PublicSummary;
          portalMemoryCache.summary = loaded;
          setSummary(loaded);
          if (Array.isArray(loaded.announcements)) setDisplayAnnouncements(loaded.announcements);
          if (Array.isArray(loaded.activities)) setDisplayActivities(loaded.activities);
          onPublicDataLoaded?.({ summary: loaded });
        }
      })
      .catch(error => {
        if (active) console.warn('[Guest Summary] Unable to load the association summary.', error);
      })
      .finally(() => {
        if (active) setIsLoadingSummary(false);
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

  const selectTab = (tabId: PortalTabId, scrollToMain = false) => {
    setActiveTab(tabId);
    if (scrollToMain && mainRef.current) {
      mainRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const registeredMembersCount = summary ? summary.totalMembers : members.length;
  const boardMemberNames = summary && summary.boardMembers.length > 0
    ? summary.boardMembers
    : resolveBoardMemberNames(users);
  const officerRoster: { title: string; name: string }[] = summary && summary.officers.length > 0
    ? summary.officers.map(officer => ({ title: officer.role, name: officer.name }))
    : resolveOfficerRoster(users);

  // Fix "Presidente nga si AFA President": read from summary.officers first!
  const presidentName = useMemo(() => {
    const fromSummary = summary?.officers?.find(o => o.role.trim().toLowerCase() === 'president')?.name;
    if (fromSummary && fromSummary.trim()) return fromSummary.trim();
    const fromRoster = officerRoster.find(o => o.title.trim().toLowerCase() === 'president')?.name;
    if (fromRoster && fromRoster.trim() && fromRoster !== 'AFA President') return fromRoster.trim();
    return resolveOfficerName(users, 'President');
  }, [summary, officerRoster, users]);

  const localizeOfficerTitle = (roleTitle: string): string => {
    const normalized = roleTitle.trim().toLowerCase().replace(/[\s_-]+/g, '_');
    switch (normalized) {
      case 'president':
        return t('Presidente', 'President');
      case 'vice_president':
        return t('Bise-Presidente', 'Vice President');
      case 'secretary':
        return t('Kalihim', 'Secretary');
      case 'assistant_secretary':
        return t('Katabang nga Kalihim', 'Assistant Secretary');
      case 'treasurer':
        return t('Mamahandi', 'Treasurer');
      case 'assistant_treasurer':
        return t('Katabang nga Mamahandi', 'Assistant Treasurer');
      case 'auditor':
        return t('Tig-audit', 'Auditor');
      case 'pio':
        return t('PIO (Tigpahibalo)', 'PIO');
      default:
        return roleTitle;
    }
  };

  const localizePriority = (priority: string): string => {
    if (priority === 'High') return t('TAAS NGA PRAYORIDAD', 'HIGH PRIORITY');
    if (priority === 'Medium') return t('TUNGATUNGA', 'MEDIUM PRIORITY');
    return t('UBOS NGA PRAYORIDAD', 'LOW PRIORITY');
  };

  const localizeActivityStatus = (status: string): string => {
    if (status === 'Completed') return t('Nahuman', 'Completed');
    if (status === 'In Progress') return t('Nagpadayon', 'In Progress');
    if (status === 'Postponed') return t('Gibalhin', 'Postponed');
    if (status === 'Cancelled') return t('Gikansela', 'Cancelled');
    return t('Naka-eskedyul', 'Scheduled');
  };

  const localizeStockStatus = (product: PublicProduct): string => {
    if (/^upcoming harvest$/i.test(String(product.quantityAvailable || ''))) {
      return t('Umaabot nga Harvest', 'Upcoming Harvest');
    }
    if (product.category?.includes('Rental')) {
      return t('Abangan sa Tanan', 'Open to Everyone');
    }
    const status = String(product.stockStatus || '').toLowerCase();
    if (status.includes('out')) return t('Nahurot na', 'Out of Stock');
    if (status.includes('low') || status.includes('limited')) return t('Gamay na lang', 'Low Stock');
    if (status.includes('pre')) return t('Umaabot nga Harvest', 'Pre-Order');
    return t('Anaa sa Stock', 'In Stock');
  };

  const handleCopyText = async (formattedText: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(formattedText);
      } else {
        const helper = document.createElement('textarea');
        helper.value = formattedText;
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        document.body.removeChild(helper);
      }
      notifyPortal(t('Nakopya na para sa Messenger / SMS!', 'Copied for Messenger / SMS!'));
    } catch {
      notifyPortal(t('Dili makakopya karon. Palihug sulayi pag-usab.', 'Unable to copy right now. Please try again.'));
    }
  };

  const handleCopyAnnouncement = (ann: Announcement) => {
    const msg = [
      `[AFA PAHIBALO / NOTICE]`,
      `${ann.title}`,
      `${t('Petsa', 'Date')}: ${ann.datePosted} | ${localizePriority(ann.priority)}`,
      '',
      ann.content,
      '',
      `— Alegria Farmers Association (FAMS), Tuburan, Cebu`
    ].join('\n');
    void handleCopyText(msg);
  };

  const handleCopyActivity = (act: AssociationActivity) => {
    const dateVal = act.scheduledDate || act.dateScheduled || '';
    const timeVal = act.scheduledTime || act.timeScheduled || '';
    const msg = [
      `[AFA KALIHOKAN / ACTIVITY]`,
      `${act.title}${act.cebTitle ? ` (${act.cebTitle})` : ''}`,
      `${t('Petsa ug Oras', 'Date & Time')}: ${dateVal}${timeVal ? ` • ${timeVal}` : ''}`,
      `${t('Lugar', 'Location')}: ${act.location}`,
      act.targetAudience ? `${t('Kinsa ang apil', 'Audience')}: ${act.targetAudience}` : '',
      '',
      act.description,
      '',
      `— Alegria Farmers Association (FAMS), Tuburan, Cebu`
    ].filter(Boolean).join('\n');
    void handleCopyText(msg);
  };

  const handleDownloadIcs = (act: AssociationActivity) => {
    const rawDate = (act.scheduledDate || act.dateScheduled || '').replace(/[^0-9]/g, '');
    const datePart = rawDate.length >= 8 ? rawDate.slice(0, 8) : new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const timeMatch = String(act.scheduledTime || act.timeScheduled || '').match(/(\d{1,2}):(\d{2})/);
    const startHour = timeMatch ? timeMatch[1].padStart(2, '0') : '08';
    const startMin = timeMatch ? timeMatch[2].padStart(2, '0') : '00';
    const endHour = String((Number(startHour) + 2) % 24).padStart(2, '0');
    const dtStart = `${datePart}T${startHour}${startMin}00`;
    const dtEnd = `${datePart}T${endHour}${startMin}00`;
    const escapeIcs = (val: string) =>
      String(val || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Alegria Farmers Association//FAMS Portal//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:afa-${act.id}@alegriafarmersassociation`,
      `DTSTAMP:${datePart}T000000Z`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcs(act.title)}`,
      `LOCATION:${escapeIcs(act.location || 'Barangay Alegria, Tuburan, Cebu')}`,
      `DESCRIPTION:${escapeIcs(act.description || '')}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `afa-${act.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'activity'}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notifyPortal(t('Gi-download na ang kalendaryo (.ics)!', 'Calendar file (.ics) downloaded!'));
  };

  const desktopTabs: { id: PortalTabId; label: string; icon: typeof Sparkles }[] = [
    { id: 'products', label: t('Merkado', 'Market'), icon: ShoppingBag },
    { id: 'announcements', label: t('Pahibalo', 'Notices'), icon: Megaphone },
    { id: 'activities', label: t('Kalihokan', 'Events'), icon: Calendar },
    { id: 'about', label: t('Bahin', 'About'), icon: BookOpen }
  ];

  const announcementFilters = [
    { id: 'All', label: t('Tanan', 'All') },
    { id: 'High', label: t('Importante', 'High Priority') },
    { id: 'Meeting', label: t('Miting', 'Meeting') },
    { id: 'Assistance', label: t('Tabang', 'Assistance') },
    { id: 'Weather', label: t('Panahon', 'Weather') },
    { id: 'Price Advisory', label: t('Presyo', 'Prices') }
  ];

  const filteredAnnouncements = useMemo(() => {
    if (announcementFilter === 'All') return displayAnnouncements;
    if (announcementFilter === 'High') return displayAnnouncements.filter(a => a.priority === 'High');
    return displayAnnouncements.filter(a => a.category === announcementFilter);
  }, [displayAnnouncements, announcementFilter]);

  const activityFilters = [
    { id: 'All', label: t('Tanan', 'All') },
    { id: 'Scheduled', label: t('Naka-eskedyul', 'Scheduled') },
    { id: 'In Progress', label: t('Nagpadayon', 'In Progress') },
    { id: 'Completed', label: t('Nahuman', 'Completed') }
  ];

  const filteredActivities = useMemo(() => {
    if (activityFilter === 'All') return displayActivities;
    return displayActivities.filter(a => a.status === activityFilter);
  }, [displayActivities, activityFilter]);

  const productCategories = useMemo(() => {
    const cats = new Set<string>();
    displayProducts.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return ['All', ...Array.from(cats)];
  }, [displayProducts]);

  const filteredProducts = useMemo(() => {
    if (productFilter === 'All') return displayProducts;
    return displayProducts.filter(p => p.category === productFilter);
  }, [displayProducts, productFilter]);

  const activeSitio = SITIO_PROFILES.find(s => s.id === selectedSitioId) || SITIO_PROFILES[0];

  const handlePrivacyClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!onOpenPrivacy) return;
    event.preventDefault();
    onOpenPrivacy();
  };

  return (
    <div id="guest-portal-root" className="min-h-screen bg-[#F3FAF5] text-[#163327] flex flex-col font-sans antialiased selection:bg-[#D6EFD9]">

      {/* COMPACT SINGLE-ROW STICKY HEADER */}
      <header className="portal-sticky-header no-print">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-[62px] sm:h-[66px] flex items-center justify-between gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => selectTab('products', false)}
            className="flex items-center gap-2 sm:gap-3 min-w-0 text-left cursor-pointer bg-transparent border-0 p-0"
          >
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white p-0.5 shadow-sm border-2 border-[#1B4332]/80 shrink-0 overflow-hidden">
              <img
                src="/afa-logo.png"
                alt="Alegria Farmers Association official emblem"
                className="w-full h-full object-contain block rounded-full"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-[13px] sm:text-base md:text-lg font-extrabold tracking-tight text-[#1B4332] uppercase font-display leading-tight truncate">
                Alegria Farmers Association
              </h1>
            </div>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Recessed Inline CEB | EN Segmented Control */}
            <div
              role="group"
              aria-label={t('Pinulongan sa portal', 'Portal language')}
              className="recessed-control inline-flex items-center p-0.5 rounded-xl"
            >
              <button
                type="button"
                onClick={() => setLanguage('mixed')}
                aria-pressed={!en}
                className={`min-h-[38px] px-2.5 sm:px-3 py-1 rounded-[10px] text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${!en ? 'recessed-pill-active' : 'text-[#455C50] hover:text-[#1B4332]'
                  }`}
              >
                CEB
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                aria-pressed={en}
                className={`min-h-[38px] px-2.5 sm:px-3 py-1 rounded-[10px] text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${en ? 'recessed-pill-active' : 'text-[#455C50] hover:text-[#1B4332]'
                  }`}
              >
                EN
              </button>
            </div>

            <button
              type="button"
              onClick={onEnterLogin}
              className="btn-bevel-terracotta px-3 sm:px-4 py-2 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('Pagsulod', 'Log In')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ORGANIC SUNRISE HERO BANNER */}
      <section id="top" className="hero-sunrise">
        <img
          src="/assets/hero-alegria.jpg"
          alt=""
          aria-hidden="true"
          className="hero-bg-img"
        />
        <div className="hero-overlay" aria-hidden="true" />
        <svg className="hero-topo" viewBox="0 0 1200 420" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-40 340 Q 220 250 480 310 T 1020 260 T 1260 320" fill="none" stroke="#FFF0C2" strokeWidth="1.5" />
          <path d="M-40 280 Q 260 190 540 245 T 1040 190 T 1260 255" fill="none" stroke="#D6EFD9" strokeWidth="1.2" />
          <path d="M-40 215 Q 280 125 580 185 T 1080 125 T 1260 190" fill="none" stroke="#FFF0C2" strokeWidth="1" />
        </svg>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-7 sm:py-11 md:py-14 text-center sm:text-left">
          <div className="max-w-3xl space-y-3.5 sm:space-y-4">
            {/* Non-wrapping Heritage Pill */}
            <div className="heritage-pill">
              <Sprout className="w-4 h-4 heritage-pill-icon" aria-hidden="true" />
              <span>
                {t(
                  'DOLE Reg. No. 2315 • FAMS Portal • Barangay Alegria, Tuburan',
                  'DOLE Reg. No. 2315 • FAMS Portal • Barangay Alegria, Tuburan'
                )}
              </span>
            </div>

            <h2 className="font-display text-2xl sm:text-4xl md:text-[2.65rem] font-bold tracking-tight leading-[1.15] text-white drop-shadow-xs">
              {t(
                'Magkauban sa Pag-uma ug Pagpalambo sa Atong Yutang Natawhan',
                'Growing Together for a Resilient Barangay Alegria'
              )}
            </h2>


            {/* Dual Hero CTAs: 2-column side-by-side grid on <480px */}
            <div className="grid grid-cols-2 sm:inline-flex gap-2.5 sm:gap-3 pt-1.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => selectTab('products', true)}
                className="btn-bevel-gold px-4 sm:px-6 py-3 rounded-xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>{t('Merkado', 'Market')}</span>
                <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => selectTab('announcements', true)}
                className="btn-bevel-ghost px-4 sm:px-6 py-3 rounded-xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Megaphone className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('Mga Pahibalo', 'Notices')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Woven Banig Bottom Accent Strip */}
        <div className="hero-banig-border" aria-hidden="true" />
      </section>

      {/* DESKTOP TAB BAR (Hidden <768px to avoid duplicating mobile bottom dock) */}
      <nav aria-label={t('Pangunang menu', 'Main menu')} className="tab-nav-wrapper no-print">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="flex items-center justify-center gap-2">
            {desktopTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id, true)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-4 lg:px-5 py-2.5 text-sm lg:text-base font-bold transition-all duration-150 flex items-center justify-center gap-2 rounded-xl border cursor-pointer ${isActive
                    ? 'bg-[#D6EFD9] border-[#1B4332]/30 text-[#1B4332] shadow-xs'
                    : 'border-transparent text-[#455C50] hover:text-[#1B4332] hover:bg-white'
                    }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* MAIN PORTAL CONTENT */}
      <main id="portal-main" ref={mainRef} className="flex-1 px-3.5 sm:px-6 py-5 sm:py-8 max-w-7xl mx-auto w-full space-y-6 sm:space-y-8 min-w-0">

        {/* TAB 2: ANNOUNCEMENTS (PAHIBALO) */}
        {activeTab === 'announcements' && (
          <div className="space-y-5 sm:space-y-6 text-left min-w-0 animate-fade-in">
            <div className="dim-card rounded-3xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#FFE9DC] text-[#C2410C] flex items-center justify-center shrink-0">
                  <Megaphone className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-[#1B4332]">
                    {t('Opisyal nga mga Pahibalo', 'Official Announcements')}
                  </h3>
                </div>
              </div>

              <div className="filter-bar" role="group" aria-label={t('Salain ang mga pahibalo', 'Filter announcements')}>
                {announcementFilters.map(filter => {
                  const active = announcementFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setAnnouncementFilter(filter.id)}
                      className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-all cursor-pointer ${active
                        ? 'bg-[#1B4332] text-white border-[#123326] shadow-xs'
                        : 'bg-[#FAF8F5] text-[#1B4332] border-[#D5CFC1] hover:bg-[#EAF6EE]'
                        }`}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {isLoadingSummary ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[0, 1].map(i => (
                  <div key={i} className="dim-card rounded-3xl p-6 space-y-3">
                    <div className="h-5 w-36 rounded skeleton-shimmer" />
                    <div className="h-6 w-3/4 rounded skeleton-shimmer" />
                    <div className="h-16 w-full rounded skeleton-shimmer" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                {filteredAnnouncements.map((ann) => {
                  const leaf = parseCalendarLeaf(ann.datePosted, en);
                  return (
                    <article key={ann.id} className="dim-card dim-card-interactive rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className="calendar-leaf" aria-hidden="true">
                          <div className="calendar-leaf-month is-terracotta">{leaf.month}</div>
                          <div className="calendar-leaf-day">{leaf.day}</div>
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`portal-badge px-2.5 py-0.5 rounded-lg font-extrabold ${ann.priority === 'High' ? 'bg-rose-100 text-rose-900 border border-rose-300' :
                              ann.priority === 'Medium' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                                'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              }`}>
                              {localizePriority(ann.priority)}
                            </span>
                            <span className="portal-badge px-2.5 py-0.5 rounded-lg bg-[#FAF8F5] border border-[#D5CFC1] text-[#354B40] font-bold">
                              {ann.category}
                            </span>
                          </div>
                          <h4 className="font-display text-lg font-bold text-[#1B4332] leading-snug">{ann.title}</h4>
                          <p className="text-sm sm:text-base text-[#264136] leading-relaxed">{ann.content}</p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#E3EFE6] flex flex-wrap items-center justify-between gap-2.5">
                        <span className="portal-meta text-sm font-semibold text-[#455C50]">
                          {t('Gipatik ni:', 'Posted by:')} <strong className="text-[#1B4332]">{ann.postedBy}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyAnnouncement(ann)}
                          className="btn-bevel-secondary px-3.5 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Copy className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span>{t('Kopyaha sa Messenger / SMS', 'Copy for Messenger / SMS')}</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
                {filteredAnnouncements.length === 0 && (
                  <div className="col-span-full dim-card rounded-3xl p-8 text-center text-[#455C50] font-semibold">
                    {t('Walay opisyal nga pahibalo sa maong kategoriya karon.', 'There are no official notices in this category right now.')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ACTIVITIES (KALIHOKAN) */}
        {activeTab === 'activities' && (
          <div className="space-y-5 sm:space-y-6 text-left min-w-0 animate-fade-in">
            <div className="dim-card rounded-3xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#D6EFD9] text-[#1B4332] flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-[#1B4332]">
                    {t('Kalihokan sa Komunidad', 'Community Activities')}
                  </h3>
                </div>
              </div>

              <div className="filter-bar" role="group" aria-label={t('Salain ang mga kalihokan', 'Filter activities')}>
                {activityFilters.map(filter => {
                  const active = activityFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setActivityFilter(filter.id)}
                      className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-all cursor-pointer ${active
                        ? 'bg-[#1B4332] text-white border-[#123326] shadow-xs'
                        : 'bg-[#FAF8F5] text-[#1B4332] border-[#D5CFC1] hover:bg-[#EAF6EE]'
                        }`}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {isLoadingSummary ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[0, 1].map(i => (
                  <div key={i} className="dim-card rounded-3xl p-6 space-y-3">
                    <div className="h-5 w-36 rounded skeleton-shimmer" />
                    <div className="h-6 w-3/4 rounded skeleton-shimmer" />
                    <div className="h-16 w-full rounded skeleton-shimmer" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                {filteredActivities.map((act) => {
                  const dateVal = act.scheduledDate || act.dateScheduled;
                  const timeVal = act.scheduledTime || act.timeScheduled;
                  const leaf = parseCalendarLeaf(dateVal, en);
                  return (
                    <article key={act.id} className="dim-card dim-card-interactive rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className="calendar-leaf" aria-hidden="true">
                          <div className="calendar-leaf-month">{leaf.month}</div>
                          <div className="calendar-leaf-day">{leaf.day}</div>
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="portal-badge px-2.5 py-0.5 rounded-lg font-extrabold bg-[#D6EFD9] text-[#1B4332]">
                              {localizeActivityStatus(act.status)}
                            </span>
                            <span className="portal-badge px-2.5 py-0.5 rounded-lg bg-[#FAF8F5] border border-[#D5CFC1] text-[#354B40] font-bold">
                              {act.category}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-display text-lg font-bold text-[#1B4332] leading-snug">{act.title}</h4>
                            {act.cebTitle && (
                              <span className="portal-meta block text-sm font-semibold text-[#455C50] mt-0.5">{act.cebTitle}</span>
                            )}
                          </div>
                          <p className="text-sm sm:text-base text-[#264136] leading-relaxed">{act.description}</p>
                        </div>
                      </div>

                      <div className="space-y-3 pt-3 border-t border-[#E3EFE6]">
                        <div className="portal-meta flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-semibold text-[#354B40]">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-[#2D6A4F] shrink-0" aria-hidden="true" />
                            <span>{dateVal}{timeVal ? ` • ${timeVal}` : ''}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-[#C2410C] shrink-0" aria-hidden="true" />
                            <span>{act.location}</span>
                          </span>
                        </div>
                        {act.targetAudience && (
                          <p className="portal-meta text-sm font-semibold text-[#455C50]">
                            {t('Kinsa ang apil:', 'Audience:')} <strong className="text-[#1B4332]">{act.targetAudience}</strong>
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleDownloadIcs(act)}
                            className="btn-bevel-forest px-3.5 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <CalendarPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>{t('I-save (.ics)', 'Add to Calendar (.ics)')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyActivity(act)}
                            className="btn-bevel-secondary px-3.5 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Copy className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>{t('Kopyaha sa Messenger / SMS', 'Copy for Messenger / SMS')}</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {filteredActivities.length === 0 && (
                  <div className="col-span-full dim-card rounded-3xl p-8 text-center text-[#455C50] font-semibold">
                    {t('Walay natala nga kalihokan sa maong kategoriya karon.', 'There are no activities listed in this category right now.')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PRODUCTS ("MERKADO SA MAG-UUMA") */}
        {activeTab === 'products' && (
          <div className="space-y-5 sm:space-y-6 text-left min-w-0 animate-fade-in">
            <div className="dim-card rounded-3xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#FFF0C2] text-[#8A5404] flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-[#1B4332]">
                    {t('Merkado sa Mag-uuma', 'Farmers’ Market & Rentals')}
                  </h3>
                </div>
              </div>

              {productCategories.length > 1 && (
                <div className="filter-bar" role="group" aria-label={t('Kategoriya sa produkto', 'Product categories')}>
                  {productCategories.map(cat => {
                    const active = productFilter === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setProductFilter(cat)}
                        className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-all cursor-pointer ${active
                          ? 'bg-[#1B4332] text-white border-[#123326] shadow-xs'
                          : 'bg-[#FAF8F5] text-[#1B4332] border-[#D5CFC1] hover:bg-[#EAF6EE]'
                          }`}
                      >
                        {cat === 'All' ? t('Tanan', 'All') : cat}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filteredProducts.map((prod) => {
                const isUpcoming = /^upcoming harvest$/i.test(String(prod.quantityAvailable || ''));
                const isRental = Boolean(prod.category?.includes('Rental'));
                const artwork = resolveProductArtwork(prod);
                const qtyText = formatProductQuantity(prod, en);

                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => setSelectedProductModal(prod)}
                    aria-label={`${t('Tan-awa ang detalye sa', 'View details for')} ${prod.name}`}
                    className="dim-card dim-card-interactive group w-full text-left rounded-3xl p-3.5 sm:p-4 flex flex-col justify-between gap-3 cursor-pointer"
                  >
                    <div className="space-y-3 w-full">
                      <div className="product-media-frame">
                        <img src={artwork} alt={prod.name} loading="lazy" />
                        <span className={`portal-badge absolute top-2.5 left-2.5 z-10 px-2.5 py-0.5 rounded-full font-extrabold shadow-sm ${isUpcoming
                          ? 'bg-[#FFF0C2] text-[#7A4904] border border-[#E9B34A]'
                          : isRental
                            ? 'bg-[#1B4332] text-white border border-white/25'
                            : 'bg-white/95 text-[#1B4332] border border-[#1B4332]/20'
                          }`}>
                          {localizeStockStatus(prod)}
                        </span>
                      </div>

                      <div className="space-y-1.5 px-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-display text-base sm:text-lg font-bold text-[#1B4332] leading-snug group-hover:text-[#2D6A4F] transition-colors">
                              {prod.name}
                            </h4>
                            {prod.cebName && (
                              <span className="portal-meta block text-sm font-semibold text-[#455C50]">{prod.cebName}</span>
                            )}
                          </div>
                          <span className="font-mono text-base sm:text-lg font-extrabold text-[#C2410C] shrink-0">
                            ₱{Number(prod.price || 0).toLocaleString()}
                          </span>
                        </div>

                        <p className="text-sm text-[#354B40] line-clamp-2 leading-relaxed">
                          {prod.description}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-[#E5F0E8] w-full flex items-center justify-between gap-2 px-0.5">
                      <span className="portal-meta text-sm font-bold text-[#455C50] truncate">
                        {qtyText}
                      </span>
                      <span className="inline-flex items-center gap-1 text-sm font-extrabold text-[#1B4332] shrink-0">
                        {t('Detalye', 'Details')}
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </span>
                    </div>
                  </button>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="col-span-full dim-card rounded-3xl p-8 text-center text-[#455C50] font-semibold">
                  {t('Walay produkto nga gilista sa maong kategoriya karon.', 'No products are listed in this category right now.')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: ABOUT (KPI STATS, 5-SITIO MAP, HISTORY, ACHIEVEMENTS & OFFICERS) */}
        {activeTab === 'about' && (
          <div className="space-y-6 text-left min-w-0 animate-fade-in">
            {/* HISTORY, MISSION & CORE VALUES */}
            <div className="dim-card rounded-3xl p-5 sm:p-7 space-y-6">
              <div className="border-b border-[#D6EFD9] pb-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFE9DC] text-[#C2410C] flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-[#1B4332]">
                    {t('Atong Kasaysayan ug Liderato', 'Our History & Leadership')}
                  </h3>
                  <p className="portal-meta text-sm text-[#455C50]">
                    {t('DOLE Reg. No. 2315 • Barangay Alegria, Tuburan, Cebu', 'DOLE Reg. No. 2315 • Barangay Alegria, Tuburan, Cebu')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7 space-y-4 text-sm sm:text-base text-[#264136] leading-relaxed">
                  {en ? (
                    <>
                      <p>
                        <strong className="text-[#1B4332]">Alegria Farmers Association (AFA)</strong> began as a small group of farmers in Barangay Alegria, Tuburan, Cebu.
                        Before the association was established, farmers struggled to sell their harvest because markets were far away and middlemen offered low prices.
                      </p>
                      <p>
                        In 2000, with support from the local government and the Department of Agriculture (DA), the association was officially registered and established.
                        Its goal was to bring together Alegria’s five sitios (Tapon, Pundok 1, Pundok 2, Lamak, and Patag 1) so farmers could speak and work together.
                        The association is currently led by President <strong className="text-[#1B4332]">{presidentName}</strong>.
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
                        Tumong niini nga mahiusa ang lima ka sitio sa Alegria (Tapon, Pundok 1, Pundok 2, Lamak, ug Patag 1) aron magtinabangay ug maghiusa ang mga mag-uuma.
                        Gipangulohan karon sa Presidente nga si <strong className="text-[#1B4332]">{presidentName}</strong> ang asosasyon.
                      </p>
                    </>
                  )}

                  <div className="dim-card-warm border-l-4 border-l-[#1B4332] p-4 sm:p-5 rounded-r-2xl space-y-1.5">
                    <h4 className="font-extrabold text-[#1B4332] text-sm uppercase tracking-wider">
                      {t('Atong Misyon', 'Our Mission')}
                    </h4>
                    <p className="text-sm sm:text-base text-[#18372D] italic leading-relaxed">
                      {t(
                        '"Paghatag og kasaligan, malungtaron, ug de-kalidad nga suporta sa matag mag-uuma pinaagi sa pundo, makinarya, libreng liso, ug modernong kahibalo aron masiguro ang kauswagan sa matag pamilya sa Alegria."',
                        '"To provide reliable, sustainable, and quality support to every farmer through funding, equipment, seeds, and modern knowledge, helping every family in Alegria prosper."'
                      )}
                    </p>
                  </div>
                </div>

                {/* Core Values Card */}
                <div className="lg:col-span-5">
                  <div className="dim-card-warm rounded-2xl p-5 space-y-3.5">
                    <h4 className="font-display font-bold text-[#1B4332] text-base flex items-center gap-2 border-b border-[#E5DEC9] pb-2.5">
                      <Heart className="w-5 h-5 text-[#C2410C] shrink-0" aria-hidden="true" />
                      <span>{t('Atong mga Prinsipyo', 'Our Core Values')}</span>
                    </h4>
                    <div className="space-y-3 text-sm text-[#264136]">
                      <div>
                        <strong className="text-[#1B4332] block font-extrabold">{t('1. Pagkahiusa', '1. Unity')}</strong>
                        <p className="text-[#455C50]">{t('Usa ka pamilya, usa ka tinguha para sa tanan.', 'One community, working toward shared goals.')}</p>
                      </div>
                      <div>
                        <strong className="text-[#1B4332] block font-extrabold">{t('2. Kamatinud-anon', '2. Transparency')}</strong>
                        <p className="text-[#455C50]">{t('Limpyo ug bukas nga pagdumala sa kwarta ug pundo.', 'Managing money and resources honestly and openly.')}</p>
                      </div>
                      <div>
                        <strong className="text-[#1B4332] block font-extrabold">{t('3. Kakugi', '3. Diligence')}</strong>
                        <p className="text-[#455C50]">{t('Walay hunong nga pagpaningkamot sa yuta ug uma.', 'Working steadily to care for our land and farms.')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AWARDS & KEY MILESTONES */}
            <section className="space-y-5">
              <div className="dim-card rounded-3xl p-4 sm:p-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFF0C2] text-[#8A5404] flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-[#1B4332]">
                    {t('Mga Pasidungog ug Kalampusan', 'Awards & Key Milestones')}
                  </h3>
                  <p className="portal-meta text-sm text-[#455C50]">
                    {t('Mga proyekto, rehistro, ug kalamboan sa Alegria Farmers Association sukad 2000.', 'Recognitions, grants, and milestones of the Alegria Farmers Association since 2000.')}
                  </p>
                </div>
              </div>

              <div className="relative border-l-[3px] border-[#1B4332]/40 ml-3 sm:ml-6 pl-5 sm:pl-8 space-y-5">
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
                      <article key={item.id} className="relative dim-card dim-card-interactive rounded-2xl p-5 sm:p-6 space-y-2">
                        <div className="absolute -left-[33px] sm:-left-[45px] top-5 w-8 h-8 rounded-full bg-[#1B4332] text-[#FFF0C2] border-[3px] border-[#F3FAF5] shadow-md flex items-center justify-center">
                          <Icon className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <span className="inline-block font-mono text-sm font-extrabold px-2.5 py-0.5 rounded-lg bg-[#FFF0C2] text-[#7A4904]">
                          {item.year}
                        </span>
                        <h4 className="font-display text-lg font-bold text-[#1B4332] leading-snug">
                          {en ? item.title : (item.cebTitle || item.title)}
                        </h4>
                        <p className="text-sm sm:text-base text-[#354B40] leading-relaxed">
                          {item.description}
                        </p>
                      </article>
                    );
                  })}
                {displayAchievements.length === 0 && (
                  <div className="dim-card rounded-2xl p-6 text-sm text-[#455C50] font-semibold">
                    {t('Wala pay gipatik nga pasidungog o kalampusan ang asosasyon.', 'The association has not published any achievements yet.')}
                  </div>
                )}
              </div>
            </section>

            {/* 2026 OFFICERS & BOD — 2-COLUMN DIMENSIONAL BADGE GRID WITH MONOGRAM AVATARS */}
            <section className="dim-card-mint rounded-3xl p-5 sm:p-7 space-y-5">
              <div className="flex items-center gap-2.5 border-b border-[#1B4332]/15 pb-3">
                <Users className="w-5 h-5 text-[#1B4332] shrink-0" aria-hidden="true" />
                <h4 className="font-display text-lg sm:text-xl font-bold text-[#1B4332]">
                  {t('Mga Opisyales sa AFA (2026)', 'AFA Officers (2026)')}
                </h4>
              </div>

              {officerRoster.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {officerRoster.map((officer, index) => (
                    <div
                      key={`${officer.title}-${officer.name}-${index}`}
                      className="dim-card rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5 min-w-0"
                    >
                      <div
                        className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#245741] to-[#1B4332] text-[#FFF0C2] font-mono font-extrabold text-sm flex items-center justify-center shrink-0 shadow-sm"
                        aria-hidden="true"
                      >
                        {getInitials(officer.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="portal-meta block text-sm font-extrabold text-[#2D6A4F] leading-tight">
                          {localizeOfficerTitle(officer.title)}
                        </span>
                        <span className="block text-base font-extrabold text-[#163327] truncate">
                          {officer.name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#455C50] font-semibold">
                  {t('Nagkarga sa listahan sa mga opisyales...', 'Loading officer roster...')}
                </p>
              )}

              <div className="pt-2 space-y-3">
                <h5 className="font-display text-base sm:text-lg font-bold text-[#1B4332]">
                  {t('Lupon sa mga Direktor (BOD)', 'Board of Directors (BOD)')}
                </h5>
                {boardMemberNames.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {boardMemberNames.map((name, i) => (
                      <div key={`${name}-${i}`} className="dim-card rounded-xl px-3.5 py-2.5 flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-lg bg-[#FFF0C2] text-[#7A4904] font-mono font-extrabold text-xs flex items-center justify-center shrink-0"
                          aria-hidden="true"
                        >
                          {getInitials(name)}
                        </div>
                        <div className="min-w-0">
                          <span className="block text-sm font-extrabold text-[#163327] truncate">{name}</span>
                          <span className="portal-meta block text-xs font-semibold text-[#455C50]">
                            {t('Miyembro sa Lupon (BOD)', 'Board Member (BOD)')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-[#455C50]">
                    {t('Wala pay natudlong miyembro sa lupon.', 'No board members have been designated yet.')}
                  </p>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* PUBLIC FOOTER */}
      <footer className="bg-[#1B4332] border-t border-[#123326] py-6 sm:py-8 px-4 sm:px-6 text-sm text-[#D6EFD9] shrink-0 mt-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center md:items-start gap-4 text-center md:text-left">
          <div className="space-y-1">
            <span className="font-display font-bold block text-base text-white">
              FAMS — Alegria Farmers Association (AFA)
            </span>
            <span className="block text-sm text-[#D6EFD9]">
              {t('Farmers Association Management System • Barangay Alegria, Tuburan, Cebu', 'Farmers Association Management System • Barangay Alegria, Tuburan, Cebu')}
            </span>
          </div>
          <div className="flex flex-col items-center md:items-end gap-2 shrink-0">
            <span className="inline-flex items-center gap-2 bg-[#123326] px-3.5 py-1.5 rounded-xl border border-[#7EC79F]/30 text-sm font-bold text-[#FFF0C2]">
              <span className="w-2 h-2 rounded-full bg-[#7EC79F]" aria-hidden="true" />
              <span>DOLE Reg. No. 2315 • LGU & DA</span>
            </span>
            <a
              href="/privacy"
              onClick={handlePrivacyClick}
              className="inline-flex items-center text-sm font-bold text-[#D6EFD9] hover:text-white underline underline-offset-4"
            >
              {t('Palisiya sa Pagkapribado (Privacy Policy)', 'Privacy Policy')}
            </a>
          </div>
        </div>
      </footer>

      {/* FIXED 4-TAB MOBILE BOTTOM DOCK (<768px) */}
      <nav
        aria-label={t('Nabigasyon sa mobile', 'Mobile navigation')}
        className="mobile-bottom-dock cols-4 no-print"
      >
        {desktopTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id, true)}
              aria-current={isActive ? 'page' : undefined}
              className={`mobile-dock-btn ${isActive ? 'is-active' : ''}`}
            >
              <Icon className="w-[19px] h-[19px] shrink-0" aria-hidden="true" />
              <span className="mobile-dock-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* PORTAL TOAST FEEDBACK */}
      {portalToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 right-4 left-4 sm:left-auto z-50 flex justify-center sm:justify-end pointer-events-none"
        >
          <div className="pointer-events-auto bg-[#1B4332] text-white px-4 py-3 rounded-2xl shadow-xl border border-[#7EC79F]/40 text-sm font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-[#F4C76D] shrink-0" aria-hidden="true" />
            <span>{portalToast}</span>
          </div>
        </div>
      )}

      {/* PRODUCT DETAIL SLIDE-UP BOTTOM SHEET MODAL */}
      {selectedProductModal && (() => {
        const cleanPhone = String(selectedProductModal.farmerPhone || '').replace(/[^\d+]/g, '');
        const smsBody = encodeURIComponent(
          en
            ? `Hello AFA! I would like to inquire about "${selectedProductModal.name}" listed on the FAMS Portal.`
            : `Maayong adlaw AFA! Gusto unta ko mangutana bahin sa "${selectedProductModal.name}" nga nakalista sa FAMS Portal.`
        );
        const artwork = resolveProductArtwork(selectedProductModal);
        const qtyDisplay = formatProductQuantity(selectedProductModal, en);

        return (
          <div
            className="modal-backdrop animate-fade-in"
            onClick={() => setSelectedProductModal(null)}
          >
            <div
              ref={productDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-dialog-title"
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              className="modal-panel flex flex-col"
            >
              {/* HEADER WITH GRAB HANDLE */}
              <div className="relative bg-gradient-to-br from-[#245741] to-[#1B4332] px-5 pt-3 pb-4 sm:px-6 sm:py-5 text-white shrink-0">
                <div className="sheet-grab-handle" aria-hidden="true" />
                <button
                  ref={productDialogCloseRef}
                  type="button"
                  onClick={() => setSelectedProductModal(null)}
                  className="absolute top-3 right-3 min-w-11 min-h-11 flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
                  aria-label={t('Sirad-i ang mga detalye sa produkto', 'Close product details')}
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>

                <div className="pr-12 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="portal-badge px-2.5 py-0.5 rounded-full bg-white/15 text-[#FFF0C2] font-bold">
                      {selectedProductModal.category || t('Kinatibuk-an', 'General')}
                    </span>
                    <span className="portal-badge px-2.5 py-0.5 rounded-full bg-[#F4C76D] text-[#163327] font-extrabold">
                      {localizeStockStatus(selectedProductModal)}
                    </span>
                  </div>
                  <h3 id="product-dialog-title" className="font-display text-xl sm:text-2xl font-bold leading-tight text-white">
                    {selectedProductModal.name}
                  </h3>
                </div>
              </div>

              {/* BODY */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-left">
                <div className="product-media-frame max-h-56">
                  <img src={artwork} alt={selectedProductModal.name} />
                </div>

                {/* PRICE + AVAILABILITY TILES */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="dim-card-warm rounded-2xl px-4 py-3">
                    <span className="portal-meta block text-sm font-bold text-[#7A4904]">
                      {t('Presyo', 'Price')}
                    </span>
                    <span className="block text-xl sm:text-2xl font-extrabold font-mono text-[#C2410C] mt-0.5 leading-tight">
                      ₱{Number(selectedProductModal.price || 0).toLocaleString()}
                    </span>
                    {selectedProductModal.unit && (
                      <span className="portal-meta block text-sm font-semibold text-[#455C50] mt-0.5">
                        {selectedProductModal.unit}
                      </span>
                    )}
                  </div>

                  <div className="dim-card-mint rounded-2xl px-4 py-3">
                    <span className="portal-meta block text-sm font-bold text-[#2D6A4F]">
                      {t('Anaa', 'Availability')}
                    </span>
                    <span className="block text-base sm:text-lg font-extrabold text-[#1B4332] mt-1 leading-snug">
                      {qtyDisplay}
                    </span>
                  </div>
                </div>

                {/* DESCRIPTION */}
                {selectedProductModal.description && (
                  <div className="space-y-1">
                    <h4 className="portal-meta text-sm font-extrabold uppercase tracking-wider text-[#455C50]">
                      {t('Deskripsyon', 'Description')}
                    </h4>
                    <p className="text-sm sm:text-base text-[#18372D] leading-relaxed">
                      {selectedProductModal.description}
                    </p>
                  </div>
                )}

                {selectedProductModal.specs && (
                  <div className="space-y-1">
                    <h4 className="portal-meta text-sm font-extrabold uppercase tracking-wider text-[#455C50]">
                      {t('Detalye', 'Specifications')}
                    </h4>
                    <p className="text-sm font-semibold text-[#18372D] bg-[#FAF8F5] border border-[#E5DEC9] rounded-xl px-3.5 py-2.5">
                      {selectedProductModal.specs}
                    </p>
                  </div>
                )}

                {/* CUSTODIAN & 1-TAP CALL / SMS ACTIONS */}
                <div className="recessed-control rounded-2xl p-4 space-y-3">
                  <div className="space-y-1">
                    <h4 className="portal-meta text-sm font-extrabold uppercase tracking-wider text-[#455C50] flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-[#1B4332]" aria-hidden="true" />
                      <span>{t('Magtatag-iya / Custodian', 'Custodian / Seller')}</span>
                    </h4>
                    <p className="text-base font-extrabold text-[#1B4332]">
                      {selectedProductModal.farmerName || selectedProductModal.contactPerson || t('Komite sa AFA', 'AFA Committee')}
                    </p>
                    {selectedProductModal.farmerSitio && (
                      <p className="portal-meta text-sm font-semibold text-[#455C50] flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-[#2D6A4F] shrink-0" aria-hidden="true" />
                        <span>{selectedProductModal.farmerSitio}, Barangay Alegria</span>
                      </p>
                    )}
                  </div>

                  {cleanPhone ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <a
                        href={`tel:${cleanPhone}`}
                        className="btn-bevel-forest px-4 py-2.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 no-underline"
                      >
                        <Phone className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>{t('Tawag:', 'Call:')} {selectedProductModal.farmerPhone}</span>
                      </a>
                      <a
                        href={`sms:${cleanPhone}?body=${smsBody}`}
                        className="btn-bevel-terracotta px-4 py-2.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 no-underline"
                      >
                        <MessageSquare className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>{t('Mag-text (SMS Inquiry)', 'Send SMS Inquiry')}</span>
                      </a>
                    </div>
                  ) : (
                    <p className="text-sm text-[#455C50] font-medium">
                      {t(
                        'Kontaka ang opisina sa AFA sa Barangay Alegria aron magpa-reserba o mopalit.',
                        'Visit or contact the AFA barangay hall office in Barangay Alegria to inquire or reserve.'
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* FOOTER */}
              <div className="bg-[#FAF8F5] px-4 sm:px-6 py-3 border-t border-[#E5DEC9] shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedProductModal(null)}
                  className="btn-bevel-secondary w-full py-2.5 rounded-xl text-base font-extrabold cursor-pointer"
                >
                  {t('Sirad-i', 'Close')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

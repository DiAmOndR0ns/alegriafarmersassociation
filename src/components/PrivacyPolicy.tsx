import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface PrivacyPolicyProps {
  onBack?: () => void;
}

export default function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
  const { t } = useLanguage();

  const handleBackClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!onBack) return;
    event.preventDefault();
    onBack();
  };

  return (
    <main className="min-h-screen bg-[#F3FAF5] px-4 py-8 text-[#163327] sm:px-6">
      <article className="dim-card mx-auto max-w-3xl rounded-3xl p-6 sm:p-10">
        <a
          href="/"
          onClick={handleBackClick}
          className="mb-8 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#1B4332]/20 bg-[#F3FAF5] px-4 py-2 text-sm font-bold text-[#1B4332] hover:bg-[#D6EFD9] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t('Balik sa portal', 'Back to portal')}</span>
        </a>
        <div className="mb-8 flex items-start gap-3">
          <div className="rounded-2xl bg-[#D6EFD9] p-3 text-[#1B4332] shrink-0">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[#2D6A4F]">
              FAMS — Alegria Farmers Association
            </p>
            <h1 className="font-display text-3xl font-black text-[#1B4332]">
              {t('Palisiya sa Pagkapribado', 'Privacy Policy')}
            </h1>
            <p className="mt-1 text-sm text-[#455C50]">
              {t('Kataposang gi-update: Nobyembre 2026', 'Last updated: November 2026')}
            </p>
          </div>
        </div>

        <div className="space-y-6 leading-7 text-[#264136]">
          <section>
            <h2 className="mb-2 text-xl font-black text-[#1B4332] font-display">
              {t('Impormasyon nga among gitipigan', 'Information we store')}
            </h2>
            <p>
              {t(
                'Ang FAMS (Farmers Association Management System) nagtipig sa opisyal nga mga rekord sa asosasyon sama sa profile sa miyembro, minutos sa miting, pahibalo, resolusyon, pinansyal nga rekord, ug system activity logs nga gihatag sa mga otorisadong opisyal ug miyembro.',
                'The FAMS (Farmers Association Management System) portal stores association records such as member profiles, meeting records, announcements, resolutions, financial entries, and system activity logs. Information is provided by association users for administration and reporting.'
              )}
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-black text-[#1B4332] font-display">
              {t('Giunsa paggamit ang impormasyon', 'How information is used')}
            </h2>
            <p>
              {t(
                'Gigamit ang mga rekord aron madumala ang operasyon sa asosasyon, pagkamiyembro, kalihokan, opisyal nga mga taho, audit trail, ug luwas nga pag-sync sa database sa asosasyon.',
                'Records are used to operate the association portal, manage membership and activities, prepare official reports, maintain an audit trail, and synchronize authorized data with the configured association database.'
              )}
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-black text-[#1B4332] font-display">
              {t('Lokal ug cloud nga tipiganan', 'Local and cloud storage')}
            </h2>
            <p>
              {t(
                'Mahimong magtipig ang portal og lokal nga offline copy sa browser aron makapadayon ang mga otorisadong tiggamit bisan walay koneksyon. Kung naka-configure, i-sync kini ngadto sa hosted PostgreSQL database sa asosasyon.',
                'The portal may keep a local offline copy in the browser so authorized users can continue working without a connection. When configured by the association, records are synchronized with its hosted PostgreSQL database. Browser storage can be cleared from the browser settings.'
              )}
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-black text-[#1B4332] font-display">
              {t('Access ug seguridad', 'Access and security')}
            </h2>
            <p>
              {t(
                'Gipanalipdan ang access pinaagi sa account approval, role-based permissions, ug two-factor authentication. Ayaw ipaambit ang imong password o authenticator code.',
                "Access is restricted by the portal's account, role, and approval controls. Do not share account credentials. Administrators should remove access when a user's role ends and review exported backup files because they may contain association records."
              )}
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-black text-[#1B4332] font-display">
              {t('Mga third-party nga serbisyo', 'Third-party services')}
            </h2>
            <p>
              {t(
                'Ang portal naggamit og Vercel para sa hosting ug sa gi-configure nga database provider sa asosasyon para sa pag-sync sa rekord.',
                "The portal may use Vercel for hosting and the association's configured database provider for synchronization. Those services may process technical request data according to their own policies."
              )}
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-black text-[#1B4332] font-display">
              {t('Mga pangutana ug hangyo', 'Questions and requests')}
            </h2>
            <p>
              {t(
                'Alang sa mga pangutana, pagtul-id, o hangyo bahin sa imong rekord sa miyembro, kontaka direkta ang mga opisyal sa Alegria Farmers Association sa Barangay Alegria, Tuburan, Cebu. Kini nga portal dili magbaligya og personal nga impormasyon.',
                "For questions about a member record, correction, access, or deletion, contact the association's authorized officers directly in Barangay Alegria, Tuburan, Cebu. This portal does not sell personal information."
              )}
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}

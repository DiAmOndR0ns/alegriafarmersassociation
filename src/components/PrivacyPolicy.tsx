import {ArrowLeft, ShieldCheck} from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-[#F5F2EB] px-4 py-8 text-slate-900 sm:px-6">
      <article className="mx-auto max-w-3xl rounded-3xl border-2 border-[#D5CFC1] bg-white p-6 shadow-sm sm:p-10">
        <a href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#1B4332] hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to portal
        </a>
        <div className="mb-8 flex items-start gap-3">
          <div className="rounded-2xl bg-[#D8F3DC] p-3 text-[#1B4332]"><ShieldCheck className="h-6 w-6" /></div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[#2D6A4F]">Alegria Farmers Association</p>
            <h1 className="font-display text-3xl font-black text-[#1B4332]">Privacy Policy</h1>
            <p className="mt-1 text-sm text-slate-500">Last updated: September 5, 2026</p>
          </div>
        </div>

        <div className="space-y-7 leading-7 text-slate-700">
          <section><h2 className="mb-2 text-xl font-black text-[#1B4332]">Information we store</h2><p>The portal stores association records such as member profiles, meeting records, announcements, resolutions, financial entries, and system activity logs. Information is provided by association users for administration and reporting.</p></section>
          <section><h2 className="mb-2 text-xl font-black text-[#1B4332]">How information is used</h2><p>Records are used to operate the association portal, manage membership and activities, prepare official reports, maintain an audit trail, and synchronize authorized data with the configured association database.</p></section>
          <section><h2 className="mb-2 text-xl font-black text-[#1B4332]">Local and cloud storage</h2><p>The portal may keep a local offline copy in the browser so authorized users can continue working without a connection. When configured by the association, records are synchronized with its hosted PostgreSQL database. Browser storage can be cleared from the browser settings.</p></section>
          <section><h2 className="mb-2 text-xl font-black text-[#1B4332]">Access and security</h2><p>Access is restricted by the portal's account and approval controls. Do not share account credentials. Administrators should remove access when a user's role ends and review exported backup files because they may contain association records.</p></section>
          <section><h2 className="mb-2 text-xl font-black text-[#1B4332]">Third-party services</h2><p>The portal may use Vercel for hosting and the association's configured database provider for synchronization. Those services may process technical request data according to their own policies.</p></section>
          <section><h2 className="mb-2 text-xl font-black text-[#1B4332]">Questions and requests</h2><p>For questions about a member record, correction, access, or deletion, contact the association's authorized officers directly. This portal does not sell personal information.</p></section>
        </div>
      </article>
    </main>
  );
}

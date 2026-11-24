import React, { useState } from 'react';
import { User, OFFICIAL_ALEGRIA_SITIOS } from '../types';
import { verifyPassword } from '../utils/audit';
import {
  validatePasswordPolicy,
  generateInitialPassword,
  getLockoutStatus,
  registerFailedLogin,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS
} from '../utils/passwordPolicy';
import { getTotpUri, verifyTotpCode } from '../utils/totp';
import {
  Lock, ArrowRight, MapPin, User as UserIcon, HelpCircle,
  KeyRound, Eye, EyeOff, ShieldCheck, UserPlus, X, Sprout
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface AuthScreenProps {
  users: User[];
  hasPresident?: boolean;
  presidentName?: string;
  onLogin: (user: User, password: string, serverAuthenticated?: boolean) => void;
  serverAuthRequired?: boolean;
  onRegister?: (userData: Omit<User, 'id' | 'isApproved'>) => void;
  toast: (message: string, type: 'success' | 'warning' | 'info' | 'error') => void;
  onRequestPasswordReset?: (username: string, sitio: string) => void | Promise<void>;
  onLoginFailed?: (userId: string, state: { failedLoginAttempts: number; lockedUntil?: string }) => void;
  onBackToGuest?: () => void;
}

export default function AuthScreen({
  users,
  hasPresident,
  presidentName,
  onLogin,
  serverAuthRequired = false,
  onRegister,
  onLoginFailed,
  toast,
  onRequestPasswordReset,
  onBackToGuest
}: AuthScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [authChallenge, setAuthChallenge] = useState<{
    token: string;
    setup: boolean;
    secret?: string;
    otpauthUrl?: string;
  } | null>(null);
  const [pendingOfflineUser, setPendingOfflineUser] = useState<User | null>(null);
  const [pendingOfflinePassword, setPendingOfflinePassword] = useState('');

  // First-time Admin / President bootstrap state (only available when no President account exists)
  const hasPresidentAccount = Boolean(hasPresident || users.some(u => u.role?.toLowerCase() === 'president'));
  const [showAdminSetup, setShowAdminSetup] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');

  // Password reset request form state (unauthenticated text input + Sitio verification)
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetUsername, setResetUsername] = useState('');
  const [resetSitio, setResetSitio] = useState<string>('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  const { isEnglish: en, t } = useLanguage();

  const resolvedPresidentName =
    (presidentName && presidentName.trim() && presidentName !== 'AFA President' ? presidentName.trim() : '') ||
    users.find(u => u.role?.toLowerCase() === 'president')?.name ||
    t('Presidente sa AFA', 'the AFA President');

  const handleAdminSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverAuthRequired && !onRegister) return;
    if (!adminName.trim() || !adminUsername.trim() || !adminPassword.trim()) {
      toast(
        t('Palihug kompletoha ang Admin Name, Username, ug Password.', 'Please complete Admin Name, Username, and Password.'),
        'error'
      );
      return;
    }
    const policyErr = validatePasswordPolicy(adminPassword.trim(), adminUsername.trim(), 'President', []);
    if (policyErr) {
      toast(policyErr, 'error');
      return;
    }
    if (serverAuthRequired) {
      try {
        const response = await fetch('/api/auth/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bootstrapSecret,
            name: adminName.trim(),
            username: adminUsername.trim().toLowerCase(),
            password: adminPassword
          })
        });
        const result = await response.json();
        if (!response.ok || !result?.success || !result?.challengeToken) {
          toast(result?.message || 'Initial administrator setup was rejected.', 'error');
          return;
        }
        setAuthChallenge({
          token: result.challengeToken,
          setup: true,
          secret: result.secret,
          otpauthUrl: result.otpauthUrl
        });
        setMfaCode('');
        toast('Scan the authenticator setup details, then enter its current code to finish setup.', 'info');
      } catch {
        toast('Administrator setup could not reach the server.', 'error');
      }
      return;
    }
    onRegister?.({
      name: adminName.trim(),
      username: adminUsername.trim().toLowerCase(),
      password: adminPassword.trim(),
      role: 'President'
    });
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast(
        t('Palihug isulod ang imong username ug password.', 'Please enter your username and password.'),
        'error'
      );
      return;
    }

    if (serverAuthRequired) {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password })
        });
        const result = await response.json();
        if (!response.ok || !result?.success) {
          toast(result?.message || t('Sayop nga username o password.', 'Invalid credentials.'), 'error');
          return;
        }
        if (result.challengeToken) {
          const setup = Boolean(result.mfaSetupRequired);
          let enrollment: { secret?: string; otpauthUrl?: string } = {
            secret: result.secret,
            otpauthUrl: result.otpauthUrl
          };
          if (setup) {
            try {
              const enrollResponse = await fetch('/api/auth/mfa/enroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challengeToken: result.challengeToken })
              });
              const enrollResult = await enrollResponse.json();
              if (!enrollResponse.ok || !enrollResult?.secret) {
                toast(enrollResult?.message || 'Authenticator setup could not be started. Contact the President or Secretary.', 'error');
                return;
              }
              enrollment = { secret: enrollResult.secret, otpauthUrl: enrollResult.otpauthUrl };
            } catch {
              toast('Authenticator setup could not reach the server. Try again when the connection is restored.', 'error');
              return;
            }
          }
          setAuthChallenge({
            token: result.challengeToken,
            setup,
            secret: enrollment.secret,
            otpauthUrl: enrollment.otpauthUrl
          });
          setMfaCode('');
          return;
        }
        if (result.user) {
          onLogin(result.user as User, '', true);
          setPassword('');
          return;
        }
        toast('The server returned an incomplete sign-in response.', 'error');
      } catch {
        toast('Sign-in could not reach the server. Try again when the connection is restored.', 'error');
      }
      return;
    }

    const matchedUser = users.find(
      u => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (matchedUser) {
      const lockout = getLockoutStatus(matchedUser);
      if (lockout.locked) {
        const minutes = Math.ceil(lockout.remainingMs / 60000);
        toast(`Account temporarily locked. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, 'error');
        return;
      }
    }

    const passwordIsValid = matchedUser
      ? await verifyPassword(password, matchedUser.passwordHash, matchedUser.password)
      : false;
    if (!matchedUser || !passwordIsValid) {
      if (matchedUser && onLoginFailed) {
        const nextState = registerFailedLogin(matchedUser);
        onLoginFailed(matchedUser.id, nextState);
        if (nextState.lockedUntil) {
          toast(
            `Too many failed attempts. Account locked for ${Math.ceil(LOCKOUT_DURATION_MS / 60000)} minutes.`,
            'error'
          );
          return;
        }
        const remaining = MAX_LOGIN_ATTEMPTS - nextState.failedLoginAttempts;
        toast(
          `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`,
          'error'
        );
        return;
      }
      toast(t('Sayop nga username o password.', 'Invalid credentials.'), 'error');
      return;
    }

    if (!matchedUser.isApproved) {
      toast(
        t(
          `Ang imong account nagpaabot pa sa pag-aprobar ni ${resolvedPresidentName}.`,
          `Your account is awaiting approval from ${resolvedPresidentName}.`
        ),
        'warning'
      );
      return;
    }

    if (onLoginFailed && (matchedUser.failedLoginAttempts || matchedUser.lockedUntil)) {
      onLoginFailed(matchedUser.id, { failedLoginAttempts: 0 });
    }

    const isMfaEnforced = matchedUser.role?.toLowerCase() === 'president' || Boolean(matchedUser.mfaEnabled);
    if (isMfaEnforced) {
      const activeSecret = matchedUser.totpSecret;
      if (!activeSecret) {
        toast('Two-factor authentication is enforced for this account, but no authenticator has been enrolled yet. Connect to the internet once to complete 2FA setup.', 'error');
        return;
      }
      setAuthChallenge({
        token: `offline-${matchedUser.id}`,
        setup: false,
        secret: activeSecret,
        otpauthUrl: getTotpUri(activeSecret, matchedUser.username, 'FAMS')
      });
      setPendingOfflineUser({ ...matchedUser, totpSecret: activeSecret, mfaEnabled: true });
      setPendingOfflinePassword(password);
      setMfaCode('');
      return;
    }

    onLogin(matchedUser, password);
    toast(t(`Maayong pagbalik, ${matchedUser.name}!`, `Welcome back, ${matchedUser.name}!`), 'success');
  };

  const handleMfaSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!authChallenge || !/^\d{6}$/.test(mfaCode)) {
      toast(t('Isulod ang 6-digit nga authenticator code.', 'Enter the current 6-digit authenticator code.'), 'error');
      return;
    }
    if (authChallenge.token.startsWith('offline-') && pendingOfflineUser) {
      const secret = authChallenge.secret || pendingOfflineUser.totpSecret;
      const isValid = await verifyTotpCode(secret, mfaCode);
      if (!isValid) {
        toast('Invalid 6-digit authenticator code. Check your authenticator app and try again.', 'error');
        return;
      }
      const updatedUser: User = {
        ...pendingOfflineUser,
        totpSecret: secret,
        mfaEnabled: true
      };
      onLogin(updatedUser, pendingOfflinePassword);
      setAuthChallenge(null);
      setPendingOfflineUser(null);
      setPendingOfflinePassword('');
      setMfaCode('');
      setPassword('');
      toast(`Welcome back, ${updatedUser.name}! Two-factor authentication verified.`, 'success');
      return;
    }

    try {
      const response = await fetch('/api/auth/mfa/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: authChallenge.token, totpCode: mfaCode })
      });
      const result = await response.json();
      if (!response.ok || !result?.success || !result?.user) {
        if (response.status === 401 && (result?.message?.toLowerCase().includes('expired') || result?.message?.toLowerCase().includes('challenge'))) {
          setAuthChallenge(null);
          setMfaCode('');
          toast('Verification window expired or invalid. Please sign in again to receive a fresh verification challenge.', 'error');
          return;
        }
        toast(result?.message || 'Authenticator code was rejected.', 'error');
        return;
      }
      onLogin(result.user as User, '', true);
      setAuthChallenge(null);
      setMfaCode('');
      setPassword('');
    } catch {
      toast('MFA verification could not reach the server.', 'error');
    }
  };

  const handleResetRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUsername.trim()) {
      toast(t('Palihug isulod ang imong username.', 'Please enter your username.'), 'error');
      return;
    }
    if (!resetSitio) {
      toast(t('Palihug pilia ang imong Sitio para sa beripikasyon.', 'Please select your Sitio for verification.'), 'error');
      return;
    }

    if (onRequestPasswordReset) {
      setIsSubmittingReset(true);
      try {
        await onRequestPasswordReset(resetUsername.trim(), resetSitio);
        setShowResetForm(false);
        setResetUsername('');
        setResetSitio('');
      } finally {
        setIsSubmittingReset(false);
      }
    } else {
      toast(t('Dili pa magamit ang password reset request.', 'Password reset requests are unavailable right now.'), 'error');
    }
  };

  return (
    <div id="auth-screen-root" className="auth-shell font-sans antialiased text-[#163327]">
      <div className="auth-modal-panel modal-panel">
        {/* LEFT ASIDE (Desktop 2-col split) / COMPACT SINGLE-ROW HEADER (Mobile <768px) */}
        <aside className="login-aside">
          <div className="sheet-grab-handle" aria-hidden="true" />
          <div
            className="absolute -bottom-16 -right-16 w-48 h-48 bg-[#2D6A4F] rounded-full opacity-25 pointer-events-none"
            aria-hidden="true"
          />

          <div className="relative z-10 space-y-5">
            <div className="login-aside-header">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 md:w-16 md:h-16 bg-white p-1 rounded-full shadow-md shrink-0 overflow-hidden border-2 border-[#7EC79F]">
                  <img
                    src="/afa-logo.png"
                    alt="Alegria Farmers Association logo"
                    className="w-full h-full object-contain block rounded-full"
                  />
                </div>
                <div className="min-w-0 text-left">
                  <h1 className="font-display text-lg md:text-2xl font-bold text-white leading-tight truncate">
                    {t('Farmer Access Portal', 'Farmer Access Portal')}
                  </h1>
                </div>
              </div>

              {onBackToGuest && (
                <button
                  type="button"
                  onClick={onBackToGuest}
                  aria-label={t('Balik sa publiko nga portal', 'Back to public portal')}
                  className="md:hidden min-w-11 min-h-11 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Desktop-only FAMS description & glass feature cards */}
            <div className="login-aside-desc space-y-3 text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-[#FFF0C2]/30 text-xs font-bold text-[#FFF0C2]">
                <Sprout className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>FAMS — Farmers Association Management System</span>
              </div>
              <p className="text-sm text-[#E5F6EA] leading-relaxed">
                {t(
                  'Opisyal nga sistema sa Alegria Farmers Association para sa mga opisyales ug miyembro sa upat ka sitio.',
                  'Official management portal for Alegria Farmers Association officers and members across all four sitios.'
                )}
              </p>
            </div>

            <div className="space-y-2.5 text-left text-sm text-white">
              <div className="glass-feature">
                <span>
                  <strong className="font-extrabold text-[#FFF0C2]">{t('Dali nga pagsulod:', 'Quick sign in:')}</strong>{' '}
                  {t(
                    'Isulod ang imong username ug password aron makasulod sa imong dashboard.',
                    'Enter your username and password to open your member or officer dashboard.'
                  )}
                </span>
              </div>
              <div className="glass-feature">
                <span>
                  <strong className="font-extrabold text-[#FFF0C2]">{t('Seguridad sa account:', 'Verified access:')}</strong>{' '}
                  {t(
                    'Tanang miyembro ug opisyales gi-aprobahan sa asosasyon sa dili pa makagamit sa sistema.',
                    'All officers and members are verified and approved before accessing association records.'
                  )}
                </span>
              </div>
              <div className="glass-feature">
                <span>
                  <strong className="font-extrabold text-[#FFF0C2]">{t('Pagparehistro:', 'Member enrollment:')}</strong>{' '}
                  {t(
                    'Ang mga bag-ong mag-uuma iparehistro sa Kalihim ug hatagan og login slip.',
                    'Farmers are enrolled by the Secretary and receive their printed login slip.'
                  )}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* RIGHT FORM PANEL */}
        <div className="bg-white p-5 sm:p-7 md:p-8 flex flex-col justify-between min-w-0">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-[#E3EFE6] pb-3">
              <div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-[#1B4332]">
                  {showResetForm
                    ? t('Hangyo sa Bag-ong Password', 'Password Reset Request')
                    : authChallenge
                      ? t('Two-Factor Verification', 'Two-Factor Verification')
                      : t('Pagsulod sa Account', 'Sign In to FAMS')}
                </h2>
              </div>
            </div>

            {showResetForm ? (
              <div className="space-y-4 animate-fade-in text-left">
                <div className="dim-card-warm rounded-2xl p-4 flex gap-3 text-[#18372D]">
                  <HelpCircle className="w-5 h-5 text-[#C2410C] shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-sm space-y-1">
                    <strong className="font-extrabold block text-[#1B4332]">
                      {t('Tabang sa Nakalimtan nga Password', 'Forgot Password Assistance')}
                    </strong>
                    <p className="leading-relaxed text-[#354B40]">
                      {t(
                        `Isulat ang imong username ug pilia ang imong Sitio sa ubos. Ang imong hangyo ipahibalo ngadto kang ${resolvedPresidentName} o sa Kalihim para sa luwas nga pag-reset.`,
                        `Enter your username and select your Sitio below. Your reset request will be queued for ${resolvedPresidentName} or the Secretary to verify and issue a new login.`
                      )}
                    </p>
                  </div>
                </div>

                <form onSubmit={handleResetRequestSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="reset-username"
                      className="block text-sm font-bold text-[#1B4332]"
                    >
                      {t('Imong Username', 'Your Username')}
                    </label>
                    <div className="relative">
                      <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#455C50] pointer-events-none" aria-hidden="true" />
                      <input
                        id="reset-username"
                        name="resetUsername"
                        type="text"
                        autoComplete="username"
                        required
                        placeholder={t('Pananglitan: jdelacruz', 'e.g., jdelacruz')}
                        value={resetUsername}
                        onChange={(e) => setResetUsername(e.target.value)}
                        className="form-input pl-10 pr-4 py-3 text-base font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="reset-sitio"
                      className="block text-sm font-bold text-[#1B4332]"
                    >
                      {t('Beripikasyon sa Sitio', 'Sitio Verification')}
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#455C50] pointer-events-none" aria-hidden="true" />
                      <select
                        id="reset-sitio"
                        name="resetSitio"
                        required
                        value={resetSitio}
                        onChange={(e) => setResetSitio(e.target.value)}
                        className="form-control pl-10 pr-4 py-3 text-base font-semibold"
                      >
                        <option value="">
                          {t('-- Pilia ang imong Sitio --', '-- Select your Sitio --')}
                        </option>
                        {OFFICIAL_ALEGRIA_SITIOS.map((sitio) => (
                          <option key={sitio} value={sitio}>
                            {sitio}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowResetForm(false)}
                      className="btn-bevel-secondary py-3 px-4 rounded-xl font-extrabold text-sm cursor-pointer text-center"
                    >
                      {t('Kanselahon', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingReset}
                      className="btn-bevel-terracotta py-3 px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <KeyRound className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{isSubmittingReset ? t('Nagpadala...', 'Sending...') : t('Ipadala Hangyo', 'Send Request')}</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : authChallenge ? (
              <form onSubmit={handleMfaSubmit} className="space-y-4 animate-fade-in text-left">
                <div className="dim-card-mint rounded-2xl p-4 text-sm text-[#1B4332]">
                  <h3 className="font-extrabold text-base">
                    {authChallenge.setup
                      ? t('I-setup ang Authenticator 2FA', 'Set up authenticator MFA')
                      : t('Kumpirmaha ang Authenticator Code', 'Verify authenticator code')}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[#354B40]">
                    {authChallenge.setup
                      ? authChallenge.secret
                        ? t(
                          'Idugang kini nga account sa authenticator app ug isulod ang 6-digit code.',
                          'Add this account to an authenticator app, then enter the current 6-digit code to complete setup.'
                        )
                        : 'This account must first enroll an authenticator. Ask the President or Secretary to issue a fresh setup key from the officer console, then enter the current 6-digit code.'
                      : t('Isulod ang kasamtangang 6-digit code gikan sa imong authenticator app.', 'Enter the current 6-digit code from your authenticator app.')}
                  </p>
                  {authChallenge.secret && (
                    <div className="mt-3 space-y-2 rounded-xl border border-[#D5CFC1] bg-white p-3">
                      <p className="text-xs font-bold uppercase text-[#455C50]">
                        {authChallenge.setup ? 'Authenticator setup key' : 'Authenticator key (manual entry)'}
                      </p>
                      <p className="select-all break-all font-mono text-sm font-bold text-[#1B4332]">{authChallenge.secret}</p>
                      {authChallenge.otpauthUrl && (
                        <details className="text-xs">
                          <summary className="cursor-pointer font-bold text-[#2D6A4F]">Manual setup URI / Details</summary>
                          <p className="mt-1 select-all break-all font-mono text-[#455C50]">{authChallenge.otpauthUrl}</p>
                        </details>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="mfa-code" className="block text-sm font-bold text-[#1B4332]">
                    {t('6-digit nga code', '6-digit code')}
                  </label>
                  <input
                    id="mfa-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={mfaCode}
                    onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="form-input px-4 py-3 font-mono text-lg tracking-[0.3em]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => { setAuthChallenge(null); setMfaCode(''); }}
                    className="btn-bevel-secondary py-3 px-4 rounded-xl text-sm font-extrabold cursor-pointer"
                  >
                    {t('Kanselahon', 'Cancel')}
                  </button>
                  <button type="submit" className="btn-bevel-forest py-3 px-4 rounded-xl text-sm font-extrabold cursor-pointer">
                    {authChallenge.setup ? t('I-enable ug Sulod', 'Enable & Continue') : t('Kumpirmaha', 'Verify & Sign In')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-5 text-left">
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-username"
                      className="block text-sm font-bold text-[#1B4332]"
                    >
                      {t('Username', 'Username')}
                    </label>
                    <div className="relative">
                      <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#455C50] pointer-events-none" aria-hidden="true" />
                      <input
                        id="login-username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        required
                        placeholder={t('Isulod ang imong username', 'Enter your username')}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="form-input pl-10 pr-4 py-3 text-base font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center gap-2">
                      <label
                        htmlFor="login-password"
                        className="block text-sm font-bold text-[#1B4332]"
                      >
                        {t('Password', 'Password')}
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowResetForm(true)}
                        className="text-sm font-bold text-[#C2410C] hover:underline cursor-pointer px-1"
                      >
                        {t('Nakalimot sa password?', 'Forgot password?')}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#455C50] pointer-events-none" aria-hidden="true" />
                      <input
                        id="login-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        placeholder={t('Isulod ang imong password', 'Enter your password')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="form-input pl-10 pr-12 py-3 text-base font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => !prev)}
                        aria-label={showPassword ? t('Tagoa ang password', 'Hide password') : t('Ipakita ang password', 'Show password')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-10 min-h-10 flex items-center justify-center rounded-lg text-[#455C50] hover:text-[#1B4332] cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-bevel-forest w-full py-3.5 rounded-xl font-extrabold text-base flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    <span>{t('Pagsulod (Log In)', 'Log In')}</span>
                    <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                  </button>

                  {!hasPresidentAccount && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdminSetup(true);
                        setShowResetForm(false);
                        if (!adminPassword) {
                          setAdminPassword(generateInitialPassword(adminUsername || 'admin', 'President'));
                        }
                      }}
                      className="btn-bevel-secondary w-full py-3 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4 text-[#1B4332] shrink-0" aria-hidden="true" />
                      <span>{t('Unang Setup: Paghimo og Admin / President Account', 'First-Time Setup: Create Admin / President Account')}</span>
                    </button>
                  )}

                  {onBackToGuest && (
                    <button
                      type="button"
                      onClick={onBackToGuest}
                      className="btn-bevel-secondary w-full py-3 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>{t('Balik sa Publiko nga Portal', 'Back to Public Portal')}</span>
                    </button>
                  )}
                </form>

                {!hasPresidentAccount && showAdminSetup && (
                  <form onSubmit={handleAdminSetupSubmit} className="mt-4 p-4 dim-card-mint rounded-2xl space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="text-xs font-extrabold text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#1B4332]" aria-hidden="true" />
                        <span>Initialize Admin / President Account</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setAdminPassword(generateInitialPassword(adminUsername || 'admin', 'President'))}
                        className="text-xs font-extrabold text-[#1B4332] hover:underline cursor-pointer"
                      >
                        Generate Strong Password
                      </button>
                    </div>
                    <p className="text-xs text-[#354B40] leading-relaxed">
                      {t(
                        'Walay nakit-an nga President/Admin account sa database. Paghimo og initial Admin account aron makadugang sa mga opisyal ug makabuhat og turnover.',
                        'No President/Admin account was found in the database. Create the initial administrator account to provision officers.'
                      )}
                    </p>
                    <div className="space-y-2.5">
                      <div>
                        <label htmlFor="admin-name" className="block text-xs font-bold text-[#1B4332] mb-1">Admin / President Full Name</label>
                        <input
                          id="admin-name"
                          type="text"
                          required
                          value={adminName}
                          onChange={(e) => setAdminName(e.target.value)}
                          className="form-input px-3 py-2 text-sm font-semibold"
                        />
                      </div>
                      {serverAuthRequired && (
                        <div>
                          <label htmlFor="bootstrap-secret" className="block text-xs font-bold text-[#1B4332] mb-1">One-time deployment bootstrap code</label>
                          <input
                            id="bootstrap-secret"
                            type="password"
                            autoComplete="off"
                            required
                            value={bootstrapSecret}
                            onChange={(e) => setBootstrapSecret(e.target.value)}
                            className="form-input px-3 py-2 text-sm font-mono font-semibold"
                          />
                          <p className="mt-1 text-xs text-[#455C50]">Obtain this from the deployment administrator. It is not the account password.</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label htmlFor="admin-username" className="block text-xs font-bold text-[#1B4332] mb-1">Username</label>
                          <input
                            id="admin-username"
                            type="text"
                            required
                            value={adminUsername}
                            onChange={(e) => setAdminUsername(e.target.value)}
                            className="form-input px-3 py-2 text-sm font-mono font-semibold"
                          />
                        </div>
                        <div>
                          <label htmlFor="admin-password" className="block text-xs font-bold text-[#1B4332] mb-1">Password (12+ chars)</label>
                          <input
                            id="admin-password"
                            type="text"
                            required
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                            className="form-input px-3 py-2 text-sm font-mono font-semibold"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAdminSetup(false)}
                        className="btn-bevel-secondary px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn-bevel-forest px-4 py-2 rounded-xl text-xs font-extrabold cursor-pointer"
                      >
                        Create Admin & Sign In
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          <div className="text-center text-xs text-[#455C50] font-semibold mt-6 border-t border-[#E3EFE6] pt-3">
            {t(
              'FAMS — Farmers Association Management System • AFA v1.1',
              'FAMS — Farmers Association Management System • AFA v1.1'
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

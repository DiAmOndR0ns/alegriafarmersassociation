import React, { useState } from 'react';
import { User, OfficerRole } from '../types';
import { verifyPassword } from '../utils/audit';
import {
  hashPassword,
  validatePasswordPolicy,
  generateInitialPassword,
  getLockoutStatus,
  registerFailedLogin,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS
} from '../utils/passwordPolicy';
import { generateTotpSecret, getTotpUri, verifyTotpCode } from '../utils/totp';
import {
  Building, Lock, Shield, Sprout, Smartphone, CheckCircle,
  UserPlus, ArrowRight, UserCheck, MapPin, Layers, Tag, Landmark, RefreshCw,
  User as UserIcon, HelpCircle, AlertTriangle, KeyRound, Eye, EyeOff,
  ShieldCheck, Phone, Check, Info, FileText, Languages
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface AuthScreenProps {
  users: User[];
  onLogin: (user: User, password: string, serverAuthenticated?: boolean) => void;
  serverAuthRequired?: boolean;
  onRegister?: (userData: Omit<User, 'id' | 'isApproved'>) => void;
  toast: (message: string, type: 'success' | 'warning' | 'info' | 'error') => void;
  onRequestPasswordReset?: (username: string) => void;
  onLoginFailed?: (userId: string, state: { failedLoginAttempts: number; lockedUntil?: string }) => void;
  onBackToGuest?: () => void;
}

export default function AuthScreen({
  users,
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
  const hasPresidentAccount = users.some(u => u.role === 'President');
  const [showAdminSetup, setShowAdminSetup] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');

  // Password reset request modal/form state
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetUsername, setResetUsername] = useState('');

  // Global language: 'mixed' = English + Bisaya (default), 'en' = English only
  const { isEnglish: en, toggleLanguage, language } = useLanguage();

  const handleAdminSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverAuthRequired && !onRegister) return;
    if (!adminName.trim() || !adminUsername.trim() || !adminPassword.trim()) {
      toast('Palihug kompletoha ang Admin Name, Username, ug Password.', 'error');
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
    onRegister({
      name: adminName.trim(),
      username: adminUsername.trim().toLowerCase(),
      password: adminPassword.trim(),
      role: 'President'
    });
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast('Palihug isulod ang imong username ug password (Please enter username and password).', 'error');
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
          toast(result?.message || 'Invalid credentials.', 'error');
          return;
        }
        if (result.challengeToken) {
          setAuthChallenge({
            token: result.challengeToken,
            setup: Boolean(result.mfaSetupRequired),
            secret: result.secret,
            otpauthUrl: result.otpauthUrl
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

    // Block sign-in while an account is temporarily locked after repeated failures.
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
      toast('Invalid credentials.', 'error');
      return;
    }

    if (!matchedUser.isApproved) {
      toast('Ang imong account nagpaabot pa sa pag-aprobar ni Presidente Zenaida A. Elbiña (Awaiting President approval).', 'warning');
      return;
    }

    // Clear the failure counter on a successful sign-in.
    if (onLoginFailed && (matchedUser.failedLoginAttempts || matchedUser.lockedUntil)) {
      onLoginFailed(matchedUser.id, { failedLoginAttempts: 0 });
    }

    // If 2FA requirement is active on this account, prompt for authenticator code
    if (matchedUser.mfaEnabled && matchedUser.totpSecret) {
      setAuthChallenge({
        token: `offline-${matchedUser.id}`,
        setup: false,
        secret: matchedUser.totpSecret,
        otpauthUrl: getTotpUri(matchedUser.totpSecret, matchedUser.username, 'FAMS')
      });
      setPendingOfflineUser(matchedUser);
      setPendingOfflinePassword(password);
      setMfaCode('');
      return;
    }

    onLogin(matchedUser, password);
    toast(`Welcome back, ${matchedUser.name}!`, 'success');
  };

  const handleMfaSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!authChallenge || !/^\d{6}$/.test(mfaCode)) {
      toast('Enter the current 6-digit authenticator code.', 'error');
      return;
    }
    if (authChallenge.token.startsWith('offline-') && pendingOfflineUser) {
      const secret = authChallenge.secret || pendingOfflineUser.totpSecret;
      if (!secret) {
        toast('Authenticator configuration is missing.', 'error');
        return;
      }
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

  const handleResetRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUsername.trim()) {
      toast('Palihug pili o isulod ang imong username.', 'error');
      return;
    }

    if (onRequestPasswordReset) {
      onRequestPasswordReset(resetUsername.trim());
      setShowResetForm(false);
      setResetUsername('');
    } else {
      toast('Dili pa magamit ang password reset request.', 'error');
    }
  };

  return (
    <div id="auth-screen-root" className="min-h-screen bg-bafa-50 text-bafa-800 flex flex-col items-center justify-center p-4 sm:p-6 font-sans antialiased">
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 items-stretch my-6">
        <div className="md:col-span-5 flex flex-col justify-between bg-bafa-800 text-bafa-50 rounded-[28px] p-6 sm:p-7 shadow-[0_24px_60px_rgba(18,51,38,0.16)] border border-bafa-700 relative overflow-hidden">
          <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-bafa-600 rounded-full opacity-20 pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(126,199,159,0.18),transparent_38%)]" />

          <div className="relative space-y-6">
            <div className="flex items-center gap-3">
              <div className="bg-white p-1.5 rounded-full shadow-lg shrink-0 overflow-hidden border-2 border-bafa-500">
                <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-16 h-16 sm:w-20 sm:h-20 object-contain block rounded-full" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-[2rem] font-black font-display tracking-tight text-white uppercase leading-none">AFA</h1>
                <p className="text-[10px] text-[#D9F5E3] font-bold tracking-[0.18em] uppercase mt-1">Alegria, Tuburan, Cebu</p>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black font-display leading-tight text-white">
                Farmer Access Portal
              </h2>
              <p className="text-sm sm:text-[15px] text-[#D7F0DF] leading-relaxed font-medium">
                {en
                  ? 'This portal is designed to be simple, easy to use, and easy to understand for our fellow farmers and officers.'
                  : 'Kini nga sistema gidisenyo aron mahimong yano, sayon gamiton, ug daling masabtan sa atong mga kaubang mag-uuma ug opisyal.'}
              </p>

              <div className="space-y-3 pt-2 text-sm text-white">
                <div className="flex items-start gap-3 rounded-2xl bg-bafa-700 border border-bafa-600 p-3">
                  <div className="bg-bafa-600 p-1.5 rounded-full mt-0.5 text-white shrink-0">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </div>
                  <span>
                    <strong className="font-extrabold text-white">Quick sign in:</strong>{' '}
                    {en
                      ? 'Enter your username and password below to access your member or officer dashboard.'
                      : 'Isulod ang imong username ug password sa ubos aron makasulod sa member o opisyal nga dashboard.'}
                  </span>
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-bafa-700 border border-bafa-600 p-3">
                  <div className="bg-bafa-600 p-1.5 rounded-full mt-0.5 text-white shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <span>
                    <strong className="font-extrabold text-white">Membership verification:</strong>{' '}
                    {en
                      ? 'All officers and members must be validated and approved in the system before their access can be used.'
                      : 'Ang tanang opisyal ug miyembro kinahanglan ma-validate ug ma-approve sa sistema antes magamit ang ilang access.'}
                  </span>
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-bafa-700 border border-bafa-600 p-3">
                  <div className="bg-bafa-600 p-1.5 rounded-full mt-0.5 text-white shrink-0">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </div>
                  <span>
                    <strong className="font-extrabold text-white">Member access:</strong>{' '}
                    {en
                      ? 'Regular farmers are enrolled via the Secretary desk and receive their login slip.'
                      : 'Ang mga regular nga mag-uuma gipasakop pinaagi sa Secretary desk ug makadawat og ilang login slip.'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative mt-8 pt-4 border-t border-bafa-600 flex items-center justify-between text-[11px] text-bafa-100">
            <span className="font-medium">Tuburan, Cebu Province</span>
            <span className="font-bold flex items-center gap-1 bg-bafa-700 px-2.5 py-1.5 rounded-full border border-bafa-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Lokal / Offline-Ok
            </span>
          </div>
        </div>

        <div className="md:col-span-7 bg-white rounded-[28px] p-5 sm:p-7 shadow-[0_24px_60px_rgba(19,39,31,0.10)] border-2 border-bafa-200 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-bafa-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-extrabold font-display text-bafa-800 tracking-[0.08em]">
                  {en ? 'SYSTEM SIGN IN' : 'PAGSULOD SA SISTEMA (Log In)'}
                </span>
              </div>

              <button
                type="button"
                onClick={toggleLanguage}
                title={en ? 'Show English + Bisaya (default)' : 'Show English only'}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors cursor-pointer whitespace-nowrap bg-[#EAF6EE] hover:bg-[#D4EEDC] text-[#1B4332] border-[#B7E3C4] shadow-sm"
              >
                <Languages className="w-3.5 h-3.5 shrink-0" />
                <span>{en ? 'English + Bisaya' : 'Translate to English'}</span>
              </button>
            </div>

            {showResetForm ? (
              <div className="space-y-4 animate-fade-in text-left">
                <div className="bg-bafa-gold-200 border border-bafa-gold-400 rounded-2xl p-4 flex gap-3 text-bafa-neutral-800">
                  <HelpCircle className="w-5 h-5 text-bafa-gold-500 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <strong className="font-extrabold block">Hangyo sa Bag-ong Password (Password Reset Request)</strong>
                    <p className="leading-relaxed text-bafa-neutral-700">
                      Isulat ang imong Username sa ubos. Ang imong hangyo ipadala dayon ngadto kang Presidente Zenaida A. Elbiña.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleResetRequestSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-bafa-neutral-700 uppercase">
                      Pilia ang imong Username o Account:
                    </label>
                    <div className="relative">
                      <UserIcon className="absolute left-3.5 top-3.5 w-4 h-4 text-bafa-neutral-500" />
                      <select
                        value={resetUsername}
                        onChange={(e) => setResetUsername(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 text-sm bg-bafa-neutral-50 border border-bafa-neutral-300 rounded-xl text-bafa-neutral-800 focus:outline-none focus:border-bafa-700 font-semibold appearance-none"
                        required
                      >
                        <option value="">-- Pili og Username / Select --</option>
                        {users.map(u => (
                          <option key={u.id} value={u.username}>
                            {u.name} ({u.username})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowResetForm(false)}
                      className="flex-1 py-3 bg-bafa-neutral-50 border border-bafa-neutral-300 hover:bg-bafa-neutral-100 text-bafa-neutral-700 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer text-center"
                    >
                      I-kansela (Cancel)
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-3 bg-bafa-coral-600 hover:bg-bafa-coral-500 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer text-center"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>Ipadala Hangyo (Send)</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : authChallenge ? (
              <form onSubmit={handleMfaSubmit} className="space-y-4 animate-fade-in text-left">
                <div className="rounded-2xl border border-[#B7E3C4] bg-[#EAF6EE] p-4 text-sm text-[#1B4332]">
                  <h3 className="font-black">{authChallenge.setup ? 'Set up authenticator MFA' : 'Verify authenticator code'}</h3>
                  <p className="mt-1 text-xs leading-relaxed">
                    {authChallenge.setup
                      ? 'Add this account to an authenticator app, then enter the current 6-digit code to complete setup.'
                      : 'Enter the current 6-digit code from your authenticator app.'}
                  </p>
                  {authChallenge.setup && authChallenge.secret && (
                    <div className="mt-3 space-y-2 rounded-xl border border-[#D5CFC1] bg-white p-3">
                      <p className="text-[10px] font-bold uppercase text-[#4A5F57]">Authenticator setup key</p>
                      <p className="select-all break-all font-mono text-sm font-bold">{authChallenge.secret}</p>
                      {authChallenge.otpauthUrl && (
                        <details className="text-[10px]">
                          <summary className="cursor-pointer font-bold">Manual setup URI</summary>
                          <p className="mt-1 select-all break-all font-mono">{authChallenge.otpauthUrl}</p>
                        </details>
                      )}
                    </div>
                  )}
                </div>
                <label className="block text-xs font-black uppercase tracking-wider text-[#4A5F57]">
                  6-digit code
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={mfaCode}
                    onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="mt-1 w-full rounded-xl border border-[#D5CFC1] bg-white px-3.5 py-3 font-mono text-lg tracking-[0.3em] text-[#1B4332] focus:border-emerald-600 focus:outline-none"
                  />
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setAuthChallenge(null); setMfaCode(''); }}
                    className="flex-1 rounded-xl border border-[#D5CFC1] bg-white px-3 py-3 text-xs font-bold text-[#1B4332]"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 rounded-xl bg-[#1B4332] px-3 py-3 text-xs font-black text-white">
                    {authChallenge.setup ? 'Enable MFA & Continue' : 'Verify & Sign In'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-6 text-left">
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-black text-bafa-neutral-800 uppercase tracking-[0.12em]">
                        Username
                      </label>
                      <span className="text-[10px] text-bafa-neutral-700 italic">{en ? 'Use your username' : 'Gamita ang imong username'}</span>
                    </div>
                    <div className="relative">
                      <UserIcon className="absolute left-3.5 top-3.5 w-4 h-4 text-[#4D615A]" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. roberto"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 text-base bg-[#F8FAF8] border-2 border-[#D8E7D9] rounded-2xl text-[#1E352E] focus:outline-none focus:border-[#1B4332] focus:ring-4 focus:ring-[#D8F3DC] font-semibold transition-all font-sans"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-black text-bafa-neutral-800 uppercase tracking-[0.12em]">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowResetForm(true)}
                        className="text-xs font-extrabold text-[#D76B3F] hover:text-[#B85835] hover:underline cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-[#4D615A]" />
                      <input
                        type="password"
                        required
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 text-base bg-[#F8FAF8] border-2 border-[#D8E7D9] rounded-2xl text-[#1E352E] focus:outline-none focus:border-[#1B4332] focus:ring-4 focus:ring-[#D8F3DC] font-semibold transition-all font-sans"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 bg-[#1B4332] hover:bg-[#143326] text-white rounded-2xl font-black text-sm transition-all shadow-[0_12px_28px_rgba(27,67,50,0.25)] flex items-center justify-center gap-2 cursor-pointer mt-3"
                  >
                    <span>Log In</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {(!hasPresidentAccount || serverAuthRequired) && (onRegister || serverAuthRequired) && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdminSetup(true);
                        setShowResetForm(false);
                        if (!adminPassword) {
                          setAdminPassword(generateInitialPassword(adminUsername || 'admin', 'President'));
                        }
                      }}
                      className="w-full py-3 bg-[#EAF6EE] border-2 border-[#2D6A4F] text-[#1B4332] hover:bg-[#D8F3DC] rounded-2xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer mt-2.5"
                    >
                      <UserPlus className="w-4 h-4 text-[#1B4332]" />
                      <span>First-Time Setup: Create Admin / President Account</span>
                    </button>
                  )}

                  {onBackToGuest && (
                    <button
                      type="button"
                      onClick={onBackToGuest}
                      className="w-full py-3 bg-[#FAF8F5] border-2 border-[#9E9785] text-[#1B4332] hover:bg-[#D8F3DC] rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer mt-2.5"
                    >
                      <Sprout className="w-4.5 h-4.5 text-[#1B4332]" />
                      <span className="font-display">Back to Public Portal</span>
                    </button>
                  )}
                </form>

                {(!hasPresidentAccount || serverAuthRequired) && showAdminSetup && (
                  <form onSubmit={handleAdminSetupSubmit} className="mt-4 p-4 bg-[#EAF6EE] border-2 border-[#2D6A4F] rounded-2xl space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#1B4332]" />
                        <span>Initialize Admin / President Account</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setAdminPassword(generateInitialPassword(adminUsername || 'admin', 'President'))}
                        className="text-[11px] font-extrabold text-[#1B4332] hover:underline cursor-pointer"
                      >
                        Generate Strong Password
                      </button>
                    </div>
                    <p className="text-[11px] text-[#2D5A43] leading-relaxed">
                      Walay nakit-an nga President/Admin account sa database. Paghimo og initial Admin account aron makadugang sa mga opisyal ug makabuhat og turnover.
                    </p>
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[10px] font-black text-[#1B4332] uppercase mb-1">Admin / President Full Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. System Administrator"
                          value={adminName}
                          onChange={(e) => setAdminName(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-[#A7D7B5] rounded-xl font-bold text-[#1B4332] focus:outline-none focus:border-[#1B4332]"
                        />
                      </div>
                      {serverAuthRequired && (
                        <div>
                          <label className="block text-[10px] font-black text-[#1B4332] uppercase mb-1">One-time deployment bootstrap code</label>
                          <input
                            type="password"
                            autoComplete="off"
                            required
                            value={bootstrapSecret}
                            onChange={(e) => setBootstrapSecret(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-white border border-[#A7D7B5] rounded-xl font-mono font-bold text-[#1B4332] focus:outline-none focus:border-[#1B4332]"
                          />
                          <p className="mt-1 text-[10px] text-[#4A5F57]">Obtain this from the deployment administrator. It is not the account password.</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-black text-[#1B4332] uppercase mb-1">Username</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. admin"
                            value={adminUsername}
                            onChange={(e) => setAdminUsername(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-white border border-[#A7D7B5] rounded-xl font-mono font-bold text-[#1B4332] focus:outline-none focus:border-[#1B4332]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-[#1B4332] uppercase mb-1">Password (12+ chars)</label>
                          <input
                            type="text"
                            required
                            placeholder="12+ chars, upper/lower/num/symbol"
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-white border border-[#A7D7B5] rounded-xl font-mono font-bold text-[#1B4332] focus:outline-none focus:border-[#1B4332]"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAdminSetup(false)}
                        className="px-3.5 py-2 bg-white border border-[#A7D7B5] text-[#1B4332] rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl text-xs font-black cursor-pointer shadow-sm"
                      >
                        Create Admin & Sign In
                      </button>
                    </div>
                  </form>
                )}

                <div className="mt-4 p-3.5 bg-[#FAF8F5] rounded-2xl border border-[#E8E3D8] flex items-center gap-2.5 text-xs text-[#5D6B54]">
                  <Shield className="w-4 h-4 text-[#1B4332] shrink-0" />
                  <span>
                    {en
                      ? 'No public sign-up. All officers and members must be validated and approved in the system.'
                      : 'Walay public sign-up. Ang tanang opisyal ug miyembro kinahanglan ma-validate ug ma-approve sa sistema.'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="text-center text-[10px] text-[#85947E] mt-6 border-t border-[#F0EBE1] pt-3">
            {en
              ? 'AFA System v1.1 • Designed for ease of use by every farmer and officer.'
              : 'Sistemang AFA v1.1 • Gidisenyo alang sa kasayon sa matag mag-uuma ug opisyal.'}
          </div>
        </div>
      </div>
    </div>
  );
}

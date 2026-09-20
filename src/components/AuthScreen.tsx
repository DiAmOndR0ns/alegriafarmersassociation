import React, { useState } from 'react';
import { User, OfficerRole } from '../types';
import { verifyPassword, hashPassword } from '../utils/audit';
import { 
  Building, Lock, Shield, Sprout, Smartphone, CheckCircle, 
  UserPlus, ArrowRight, UserCheck, MapPin, Layers, Tag, Landmark, RefreshCw,
  User as UserIcon, HelpCircle, AlertTriangle, KeyRound, Eye, EyeOff,
  ShieldCheck, Phone, Check, Info, FileText
} from 'lucide-react';

interface AuthScreenProps {
  users: User[];
  onLogin: (user: User) => void;
  onRegister?: (userData: Omit<User, 'id' | 'isApproved'>) => void;
  toast: (message: string, type: 'success' | 'warning' | 'info' | 'error') => void;
  onRequestPasswordReset?: (username: string) => void;
  onBackToGuest?: () => void;
}

export default function AuthScreen({ 
  users, 
  onLogin, 
  toast,
  onRequestPasswordReset,
  onBackToGuest
}: AuthScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Password reset request modal/form state
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetUsername, setResetUsername] = useState('');
  const [showMemberGuide, setShowMemberGuide] = useState(false);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast('Palihug isulod ang imong username ug password (Please enter username and password).', 'error');
      return;
    }

    const matchedUser = users.find(
      u => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!matchedUser) {
      toast('Wala makit-i ang account. Palihug isusi ang imong username o pakigkita sa Kalihim (Account not found).', 'error');
      return;
    }

    if (!verifyPassword(password, matchedUser.passwordHash, matchedUser.password)) {
      toast('Sayo ang password. Sulayi ang "password123" o ipangutana sa Presidente (Incorrect password).', 'error');
      return;
    }

    if (!matchedUser.isApproved) {
      toast('Ang imong account nagpaabot pa sa pag-aprobar ni Presidente Zenaida A. Elbiña (Awaiting President approval).', 'warning');
      return;
    }

    onLogin(matchedUser);
    toast(`Welcome back, ${matchedUser.name}!`, 'success');
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

  // Demo users for quick-login grid (makes testing very easy for non-tech users)
  const approvedUsers = users.filter(u => u.isApproved);

  return (
    <div id="auth-screen-root" className="min-h-screen bg-bafa-50 text-bafa-800 flex flex-col items-center justify-center p-4 sm:p-6 font-sans antialiased">
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 items-stretch my-6">
        <div className="md:col-span-5 flex flex-col justify-between bg-bafa-800 text-bafa-50 rounded-[28px] p-6 sm:p-7 shadow-[0_24px_60px_rgba(18,51,38,0.16)] border border-bafa-700 relative overflow-hidden">
          <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-bafa-600 rounded-full opacity-20 pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(126,199,159,0.18),transparent_38%)]" />

          <div className="relative space-y-6">
            <div className="flex items-center gap-3">
              <div className="bg-bafa-100 p-2 rounded-2xl text-bafa-700 shadow-inner overflow-hidden border border-bafa-300">
                <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-11 h-11 sm:w-12 sm:h-12 object-cover block rounded-xl" />
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
                Kini nga sistema gidisenyo aron mahimong yano, sayon gamiton, ug daling masabtan sa atong mga kaubang mag-uuma ug opisyal.
              </p>

              <div className="space-y-3 pt-2 text-sm text-white">
                <div className="flex items-start gap-3 rounded-2xl bg-bafa-700 border border-bafa-600 p-3">
                  <div className="bg-bafa-600 p-1.5 rounded-full mt-0.5 text-white shrink-0">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </div>
                  <span><strong className="font-extrabold text-white">Quick sign in:</strong> Enter your username and password below to access your member or officer dashboard.</span>
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-bafa-700 border border-bafa-600 p-3">
                  <div className="bg-bafa-600 p-1.5 rounded-full mt-0.5 text-white shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <span><strong className="font-extrabold text-white">Bona fide Membership:</strong> Ang tanang opisyal kinahanglan miyembro una sa dili pa mamahimong kwalipikado sa eleksyon.</span>
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-bafa-700 border border-bafa-600 p-3">
                  <div className="bg-bafa-600 p-1.5 rounded-full mt-0.5 text-white shrink-0">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </div>
                  <span><strong className="font-extrabold text-white">Member access:</strong> Regular farmers are enrolled via the Secretary desk and receive their login slip.</span>
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
                <span className="text-sm font-extrabold font-display text-bafa-800 tracking-[0.08em] border-b-2 border-bafa-800 pb-3">
                  PAGSULOD SA SISTEMA (Log In)
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowMemberGuide(!showMemberGuide);
                  setShowResetForm(false);
                }}
                className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider border transition-colors cursor-pointer ${
                  showMemberGuide
                    ? 'bg-[#1B4332] text-white border-[#1B4332]'
                    : 'bg-[#EAF6EE] hover:bg-[#D4EEDC] text-[#1B4332] border-[#B7E3C4]'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
                <span>{showMemberGuide ? 'Balik sa Log In' : 'Polisa sa Pagpasakop & Eleksyon'}</span>
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
            ) : !showMemberGuide ? (
              <div className="space-y-6 text-left">
                <div className="space-y-2">
                  <span className="flex items-center gap-1 text-xs font-extrabold text-bafa-neutral-800 uppercase tracking-wider">
                    <UserCheck className="w-4 h-4 text-bafa-700" />
                    <span>Quick Login</span>
                  </span>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {approvedUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          setUsername(user.username);
                          setPassword('password123');
                          toast(`Nahi-select si ${user.name}! Pindota ang "Mosulod sa Portal" sa ubos aron makasulod.`, 'info');
                        }}
                        className={`p-2.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between min-h-[76px] h-20 relative group overflow-hidden ${
                          username.toLowerCase() === user.username.toLowerCase()
                            ? 'bg-[#EAF5EE] border-[#2D6A4F] shadow-sm'
                            : 'bg-[#F9FBF9] border-[#D8E7D9] hover:border-[#8EBDA2] hover:bg-white'
                        }`}
                      >
                        <span className="block font-black text-[#18372d] text-sm leading-tight truncate group-hover:text-[#123326]">
                          {user.name.split(' ')[0]}
                        </span>
                        <span className="block text-[9px] font-bold text-[#536A5D] uppercase tracking-[0.12em] truncate">
                          {user.role.replace('_', ' ')}
                        </span>
                        {user.resetRequested && (
                          <span className="absolute top-2 right-2 bg-amber-500 w-2 h-2 rounded-full" title="Forgot Password Request Pending" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-black text-bafa-neutral-800 uppercase tracking-[0.12em]">
                        Username
                      </label>
                      <span className="text-[10px] text-bafa-neutral-700 italic">Use your username</span>
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
                        placeholder="Ipapilit ang imong koda (e.g. password123)"
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

                <div className="mt-4 p-3.5 bg-[#FAF8F5] rounded-2xl border border-[#E8E3D8] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-[#5D6B54]">
                  <div className="flex items-center gap-2.5">
                    <Shield className="w-4 h-4 text-[#1B4332] shrink-0" />
                    <span>Walay public sign-up. Ang tanang opisyal kinahanglan miyembro una ug pilion pinaagi sa eleksyon.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMemberGuide(true);
                      setShowResetForm(false);
                    }}
                    className="text-[11px] font-extrabold text-[#1B4332] hover:underline cursor-pointer shrink-0 ml-auto sm:ml-0"
                  >
                    Polisa sa Eleksyon →
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-left animate-fade-in max-h-[64vh] overflow-y-auto pr-1">
                <div className="bg-[#EAF6EE] border-2 border-[#52B788]/40 rounded-2xl p-4.5 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1B4332] text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Shield className="w-5 h-5 text-[#52B788]" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#1B4332] bg-white px-2 py-0.5 rounded-md border border-[#A7D7B5]">
                        Opisyal nga Polisa sa Asosasyon
                      </span>
                      <h4 className="text-base font-extrabold text-[#123326] mt-1 font-display">
                        Pagpasakop sa Miyembro: Pinaagi sa Kalihim Lamang
                      </h4>
                      <p className="text-xs text-[#2D5A43] leading-relaxed mt-1">
                        Aron masiguro ang husto nga RSBSA verification ug audit trails, ang mga regular nga mag-uuma <strong>dili kinahanglan mag-sign up sa online form</strong>. Ang <strong>Kalihim (Jennylyn S. Lumactao)</strong> lamang ang awtorisado nga mopasakop ug mohatag og Login Slip credentials.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#FAF8F5] border border-[#E2DDD3] rounded-2xl p-4 space-y-3">
                  <h5 className="text-xs font-black text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-[#1B4332]" />
                    <span>Sayon nga mga Lakang sa Pagpasakop:</span>
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[#3E4C3A]">
                    <div className="bg-white p-3 rounded-xl border border-[#E8E3D8] space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#1B4332] text-white text-[10px] font-black flex items-center justify-center">1</span>
                        <strong className="text-[#123326] font-bold">Bisitaha ang Kalihim</strong>
                      </div>
                      <p className="text-[11px] text-[#556551] pl-7">
                        Adto sa Alegria Farmers Center o pakigkita kang Kalihim Jennylyn S. Lumactao.
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-[#E8E3D8] space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#1B4332] text-white text-[10px] font-black flex items-center justify-center">2</span>
                        <strong className="text-[#123326] font-bold">RSBSA & Farm Record</strong>
                      </div>
                      <p className="text-[11px] text-[#556551] pl-7">
                        Ihatag ang imong RSBSA Control Number, gidak-on sa uma, sitio, ug produkto.
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-[#E8E3D8] space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#1B4332] text-white text-[10px] font-black flex items-center justify-center">3</span>
                        <strong className="text-[#123326] font-bold">Dawat og Login Slip</strong>
                      </div>
                      <p className="text-[11px] text-[#556551] pl-7">
                        Direkta nga i-isyu sa Kalihim ang imong opisyal nga Username ug Koda (Password).
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-[#E8E3D8] space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#1B4332] text-white text-[10px] font-black flex items-center justify-center">4</span>
                        <strong className="text-[#123326] font-bold">Diretsong Pagsulod</strong>
                      </div>
                      <p className="text-[11px] text-[#556551] pl-7">
                        Gamita ang imong koda aron makasulod sa Member Portal ug makita ang imong tinigom.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-[#D5CFC1] rounded-2xl p-3.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <Building className="w-5 h-5 text-[#1B4332] shrink-0" />
                    <div>
                      <p className="font-extrabold text-[#123326]">Opisina sa Kalihim (Secretary Desk)</p>
                      <p className="text-[#556551] text-[11px]">Jennylyn S. Lumactao • Alegria Farmers Center, Tuburan, Cebu</p>
                    </div>
                  </div>
                  <span className="bg-[#FAF8F5] text-[#1B4332] text-[10px] font-bold px-2 py-1 rounded-lg border border-[#D5CFC1] shrink-0">
                    Lunes - Biyernes
                  </span>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowMemberGuide(false)}
                    className="w-full py-3 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Balik sa Pagsulod (Back to Log In)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="text-center text-[10px] text-[#85947E] mt-6 border-t border-[#F0EBE1] pt-3">
            Sistemang AFA v1.1 • Gidisenyo alang sa kasayon sa matag mag-uuma ug opisyal.
          </div>
        </div>
      </div>
    </div>
  );
}

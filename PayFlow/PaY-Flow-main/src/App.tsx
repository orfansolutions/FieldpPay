import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  useNavigate,
  useLocation,
  useSearchParams
} from 'react-router-dom';
import { 
  onAuthStateChanged, 
  User, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, getDocFromServer, collection, query, where, getDocs, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { AnimatePresence, motion } from 'motion/react';
import { UserProfile, Organisation, UserRole } from './types';
// import AIAssistant from './components/AIAssistant'; // Removed
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Briefcase, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Plus,
  Download,
  Building2,
  ChevronRight,
  Loader2,
  Repeat,
  Calendar,
  Clock,
  Play,
  Banknote,
  TrendingDown,
  Eye,
  EyeOff,
  CheckCircle2,
  BarChart3,
  ChevronDown
} from 'lucide-react';
import { cn } from './lib/utils';

// Lazy Components
const Dashboard = lazy(() => import('./components/Dashboard'));
const Contacts = lazy(() => import('./components/Contacts'));
const Requisitions = lazy(() => import('./components/Requisitions'));
const Projects = lazy(() => import('./components/Projects'));
const OrganisationSetup = lazy(() => import('./components/OrganisationSetup'));
const SettingsPage = lazy(() => import('./components/Settings'));
const RecurringCosts = lazy(() => import('./components/RecurringCosts'));
const ProjectExpenseReport = lazy(() => import('./components/ProjectExpenseReport'));
const VatReport = lazy(() => import('./components/VatReport'));
const PaymentSchedule = lazy(() => import('./components/PaymentSchedule'));
const Payroll = lazy(() => import('./components/Payroll'));
const Deductions = lazy(() => import('./components/Deductions'));
const PFAI = lazy(() => import('./components/PFAI'));
const Billing = lazy(() => import('./components/Billing'));

import { Toast, ToastType } from './components/Toast';

const AuthContext = React.createContext<{
  user: User | null;
  profile: UserProfile | null;
  organisation: Organisation | null;
  allOrganisations: Organisation[];
  loading: boolean;
  switching: boolean;
  isDemo: boolean;
  showInstallBtn: boolean;
  handleInstallClick: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchOrganisation: (orgId: string) => Promise<void>;
  resetAppState: () => void;
  setDemoMode: (active: boolean) => void;
  showToast: (message: string, type?: ToastType) => void;
} | null>(null);

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [allOrganisations, setAllOrganisations] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const orgsListenerRef = React.useRef<(() => void) | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null);

  // Pre-fetch logic: Attempt to warm up organisation data if cached
  useEffect(() => {
    const cachedOrgId = localStorage.getItem('activeOrganisationId');
    if (cachedOrgId && !organisation) {
      getDocFromServer(doc(db, 'organisations', cachedOrgId)).then(orgDoc => {
        if (orgDoc.exists() && !organisation) {
          setOrganisation({ id: orgDoc.id, ...orgDoc.data() } as Organisation);
        }
      }).catch(() => {/* Ignore pre-fetch errors */});
    }
  }, []);

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const setDemoMode = (active: boolean) => {
    if (active) {
      import('./lib/demoData').then(demo => {
        setProfile(demo.DEMO_PROFILE);
        setOrganisation(demo.DEMO_ORG);
        setIsDemo(true);
        setLoading(false);
      });
    } else {
      setIsDemo(false);
      setProfile(null);
      setOrganisation(null);
      if (user) fetchProfile(user.uid);
    }
  };

  const checkInvites = async (email: string, uid: string) => {
    const emailLower = email.toLowerCase().trim();
    console.log(`Checking invites for email: ${emailLower}`);
    try {
      const q = query(collection(db, 'invites'), where('email', '==', emailLower), where('status', '==', 'Pending'));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const invite = snapshot.docs[0].data();
        const inviteId = snapshot.docs[0].id;
        
        console.log('Found pending invite:', invite);
        
        // Automatically link user to organisation
        await setDoc(doc(db, 'users', uid), {
          uid,
          email: emailLower,
          role: invite.role,
          organisationId: invite.organisationId,
          displayName: auth.currentUser?.displayName || emailLower.split('@')[0],
          updatedAt: new Date().toISOString()
        }, { merge: true });
        
        // Mark invite as accepted
        await updateDoc(doc(db, 'invites', inviteId), {
          status: 'Accepted',
          acceptedAt: new Date().toISOString()
        });
        
        console.log('Invite accepted and user linked.');
        return true;
      }
    } catch (error) {
      console.error('Error checking invites:', error);
    }
    return false;
  };

  const resetAppState = () => {
    // Clear all organization-specific data from state
    // Note: Since we use window.location.href for switching, 
    // this is mostly for mid-transition UI cleanup
    setOrganisation(null);
    setProfile(null);
    localStorage.removeItem('activeOrganisationId');
  };

  const fetchProfile = async (uid: string) => {
    console.log(`Fetching profile for UID: ${uid}`);
    try {
      // Use getDocFromServer to bypass cache and ensure we have the latest data
      const userDoc = await getDocFromServer(doc(db, 'users', uid));
      
      let userData: UserProfile | null = null;
      
      if (userDoc.exists()) {
        userData = userDoc.data() as UserProfile;
        console.log('User profile found:', userData);
        
        // If profile exists but no organisation, check for pending invites
        if (!userData.organisationId && auth.currentUser?.email) {
          console.log('Profile exists but no organisationId. Checking for invites...');
          const accepted = await checkInvites(auth.currentUser.email, uid);
          if (accepted) {
            const updatedDoc = await getDocFromServer(doc(db, 'users', uid));
            if (updatedDoc.exists()) {
              userData = updatedDoc.data() as UserProfile;
            }
          }
        }
      } else if (auth.currentUser?.email) {
        // If profile doesn't exist, check for invites
        const accepted = await checkInvites(auth.currentUser.email, uid);
        if (accepted) {
          const newUserDoc = await getDocFromServer(doc(db, 'users', uid));
          if (newUserDoc.exists()) {
            userData = newUserDoc.data() as UserProfile;
          }
        }
      }

      if (userData) {
        let orgData: Organisation | null = null;
        const targetOrgId = userData.currentOrg || userData.organisationId;
        
        if (targetOrgId) {
          console.log(`Fetching organisation: ${targetOrgId}`);
          try {
            const orgDoc = await getDocFromServer(doc(db, 'organisations', targetOrgId));
            if (orgDoc.exists()) {
              orgData = { id: orgDoc.id, ...orgDoc.data() } as Organisation;
              console.log('Organisation found:', orgData);
            } else {
              console.warn('Organisation document does not exist in Firestore');
            }
          } catch (err) {
            console.error('Error fetching organisation:', err);
          }
        } else {
          console.warn('No organisationId found in user profile');
        }
        
        // Update both at once to minimize re-renders and potential redirect loops
        setProfile(userData);
        setOrganisation(orgData);
      } else {
        console.warn('User profile document does not exist in Firestore');
        setProfile(null);
        setOrganisation(null);
      }
    } catch (error) {
      console.error('Error in fetchProfile:', error);
      // If it's a permission error, it might be because the profile doesn't exist yet
      setProfile(null);
      setOrganisation(null);
    }
  };

  useEffect(() => {
    let unsubscribeOrgs = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // Clean up any existing organisations listener first
      if (orgsListenerRef.current) {
        orgsListenerRef.current();
        orgsListenerRef.current = null;
      }

      setUser(user);
      if (user) {
        // Real-time organizations list with cleanup to avoid duplicates/leaks
        orgsListenerRef.current = onSnapshot(
          query(collection(db, 'organisations'), where('ownerUid', '==', user.uid)),
          (snapshot) => {
            const orgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organisation));
            // De-duplicate in-memory as a safety measure against rapid Firestore triggers
            const uniqueOrgs = orgs.filter((org, index, self) => 
              index === self.findIndex((o) => o.id === org.id)
            );
            setAllOrganisations(uniqueOrgs);
          },
          (error) => console.error("Error syncing organisations:", error)
        );

        await fetchProfile(user.uid);
        
        // Force Redirect Logic: If on login/signup page, move to dashboard immediately
        if (location.pathname === '/signup' || location.pathname === '/login' || (location.pathname === '/' && !profile)) {
          navigate('/', { replace: true });
        }
      } else {
        setProfile(null);
        setOrganisation(null);
        setAllOrganisations([]);
      }
      setLoading(false);
    });
    
    return () => {
      unsubscribeAuth();
      if (orgsListenerRef.current) {
        orgsListenerRef.current();
      }
    };
  }, []);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (!isStandalone) {
      setShowInstallBtn(true);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      if (isIOS) {
        showToast("To install: Tap the share button and select 'Add to Home Screen'.", "info");
      } else {
        showToast("To install: Look for 'Install' in your browser menu.", "info");
      }
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBtn(false);
    }
    setDeferredPrompt(null);
  };

  const switchOrganisation = async (orgId: string) => {
    if (!user) return;
    setSwitching(true);
    try {
      // Step 1: Clear local state immediately to avoid ghost data
      resetAppState();
      
      // Step 2: Update Firestore
      await updateDoc(doc(db, 'users', user.uid), {
        currentOrg: orgId,
        updatedAt: new Date().toISOString()
      });
      localStorage.setItem('activeOrganisationId', orgId);
      
      // Step 3: Fetch new data manually without reloading the page
      await fetchProfile(user.uid);
      
      showToast('Organisation switched successfully.', 'success');
    } catch (error) {
      console.error('Error switching organisation:', error);
      showToast('Failed to switch organisation', 'error');
    } finally {
      // Small delay to ensure all listeners have settled
      setTimeout(() => setSwitching(false), 500);
    }
  };

  const authValue = useMemo(() => ({ 
    user, 
    profile, 
    organisation, 
    allOrganisations,
    loading, 
    switching,
    isDemo,
    showInstallBtn,
    handleInstallClick,
    refreshProfile: () => user ? fetchProfile(user.uid) : Promise.resolve(),
    switchOrganisation,
    resetAppState,
    setDemoMode,
    showToast
  }), [user, profile, organisation, allOrganisations, loading, switching, isDemo, showInstallBtn, deferredPrompt]);

  return (
    <AuthContext.Provider value={authValue}>
      {children}
      <AnimatePresence>
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
      </AnimatePresence>
    </AuthContext.Provider>
  );
};

const SwitchingOverlay = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-md flex flex-col items-center justify-center"
    >
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-ping" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-xl font-bold text-slate-900">Switching Organisation</h2>
          <p className="text-slate-500 font-medium">Preparing your data workspace...</p>
        </div>
      </div>
    </motion.div>
  );
};

const Sidebar = () => {
  const { profile, organisation, showInstallBtn, handleInstallClick } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Requisitions', path: '/requisitions', icon: FileText },
    { name: 'Contacts', path: '/contacts', icon: Users },
    { name: 'Projects', path: '/projects', icon: Briefcase },
    { name: 'Payroll', path: '/payroll', icon: Banknote, roles: ['Super User', 'Financial Manager', 'CEO/CFO'] },
    { name: 'Deductions', path: '/deductions', icon: TrendingDown, roles: ['Super User', 'Financial Manager', 'CEO/CFO'] },
    { name: 'VAT Report', path: '/vat-report', icon: FileText, roles: ['Super User', 'Financial Manager', 'CEO/CFO'] },
    { name: 'Payment Schedule', path: '/payment-schedule', icon: Calendar },
    { name: 'Project Reports', path: '/reports/project-expenditure', icon: BarChart3, roles: ['Super User', 'Financial Manager', 'CEO/CFO'] },
    { name: 'Recurring Costs', path: '/recurring-costs', icon: Repeat, roles: ['Super User', 'Financial Manager', 'CEO/CFO'] },
    { name: 'Settings', path: '/settings', icon: Settings, roles: ['Super User', 'Financial Manager', 'CEO/CFO', 'Manager'] },
  ].filter(item => !item.roles || item.roles.includes(profile?.role || ''));

  return (
    <div className="hidden md:flex flex-col w-64 bg-slate-900 text-white h-screen fixed left-0 top-0">
      <div className="p-6 flex items-center gap-3 border-b border-slate-800">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-xl">
          P
        </div>
        <div>
          <h1 className="font-bold text-lg leading-none">PaY Flow</h1>
          <p className="text-xs text-slate-400 mt-1 truncate w-32">
            {organisation?.name || 'No Organisation'}
          </p>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-2 mt-4">
        {navItems.map((item) => (
          <button
            key={item.name}
            onClick={() => navigate(item.path)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium",
              location.pathname === item.path 
                ? "bg-blue-600 text-white" 
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            )}
          >
            <item.icon size={20} />
            {item.name}
          </button>
        ))}

        {showInstallBtn && (
          <button
            onClick={handleInstallClick}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm font-bold text-emerald-400 hover:bg-emerald-400/10"
          >
            <Download size={20} />
            Download App
          </button>
        )}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden">
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              profile?.displayName?.charAt(0) || 'U'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile?.displayName} {profile?.surname}</p>
            <p className="text-xs text-slate-500 truncate">{profile?.position || profile?.role}</p>
          </div>
          <button 
            onClick={() => signOut(auth)}
            className="text-slate-500 hover:text-white transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

const MobileNav = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { profile, organisation, showInstallBtn, handleInstallClick } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Requisitions', path: '/requisitions', icon: FileText },
    { name: 'Contacts', path: '/contacts', icon: Users },
    { name: 'Projects', path: '/projects', icon: Briefcase },
    { name: 'Payroll', path: '/payroll', icon: Banknote, roles: ['Super User', 'Financial Manager', 'CEO/CFO'] },
    { name: 'Deductions', path: '/deductions', icon: TrendingDown, roles: ['Super User', 'Financial Manager', 'CEO/CFO'] },
    { name: 'VAT Report', path: '/vat-report', icon: FileText, roles: ['Super User', 'Financial Manager', 'CEO/CFO'] },
    { name: 'Payment Schedule', path: '/payment-schedule', icon: Calendar },
    { name: 'Project Reports', path: '/reports/project-expenditure', icon: BarChart3, roles: ['Super User', 'Financial Manager', 'CEO/CFO'] },
    { name: 'Recurring Costs', path: '/recurring-costs', icon: Repeat, roles: ['Super User', 'Financial Manager', 'CEO/CFO'] },
    { name: 'Settings', path: '/settings', icon: Settings, roles: ['Super User', 'Financial Manager', 'CEO/CFO', 'Manager'] },
  ].filter(item => !item.roles || item.roles.includes(profile?.role || ''));

  return (
    <div className="md:hidden">
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold flex-shrink-0">P</div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold leading-none">PaY Flow</span>
            <span className="text-[10px] text-slate-400 truncate max-w-[150px]">{organisation?.name}</span>
          </div>
        </div>
        <button onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X /> : <Menu />}
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900 z-40 pt-20 p-6 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-4 p-4 border-b border-slate-800 mb-4">
            <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center text-lg font-bold overflow-hidden">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                profile?.displayName?.charAt(0) || 'U'
              )}
            </div>
            <div>
              <p className="text-white font-bold">{profile?.displayName} {profile?.surname}</p>
              <p className="text-slate-400 text-sm">{profile?.position || profile?.role}</p>
            </div>
          </div>
          {navItems.map((item) => (
            <button
              key={item.name}
              onClick={() => {
                navigate(item.path);
                setIsOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl text-lg font-medium",
                location.pathname === item.path 
                  ? "bg-blue-600 text-white" 
                  : "text-slate-400"
              )}
            >
              <item.icon size={24} />
              {item.name}
            </button>
          ))}
          <button 
            onClick={() => signOut(auth)}
            className="w-full flex items-center gap-4 p-4 rounded-xl text-red-400 font-medium"
          >
            <LogOut size={24} />
            Sign Out
          </button>
          
          {showInstallBtn && (
            <button 
              onClick={() => {
                handleInstallClick();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-4 p-4 rounded-xl text-emerald-400 font-bold"
            >
              <Download size={24} />
              Download App
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const Login = () => {
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>(location.pathname === '/signup' ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [inviteData, setInviteData] = useState<any>(null);
  const { user, loading: authLoading, refreshProfile, setDemoMode } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteId = searchParams.get('invite');

  useEffect(() => {
    if (user && !authLoading) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (inviteId) {
      const fetchInvite = async () => {
        try {
          const inviteDoc = await getDoc(doc(db, 'invites', inviteId));
          if (inviteDoc.exists()) {
            const data = inviteDoc.data();
            setInviteData(data);
            setEmail(data.email);
            setMode('signup');
          }
        } catch (err) {
          console.error('Error fetching invite:', err);
        }
      };
      fetchInvite();
    }
  }, [inviteId]);

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address first");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (mode === 'signup' && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (mode === 'login') {
        console.log('Attempting login for:', cleanEmail);
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        console.log('Login successful');
      } else {
        console.log('Attempting signup for:', cleanEmail);
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        console.log('Signup successful');
        // Update profile with display name
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: cleanEmail.toLowerCase(),
          displayName: displayName || cleanEmail.split('@')[0],
          role: 'Requester', // Default role
          createdAt: new Date().toISOString(),
        }, { merge: true });
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError("This email is already registered. Please sign in instead.");
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        if (mode === 'login') {
          setError("Invalid email or password. If you don't have an account yet, please use the 'Create Account' tab.");
        } else {
          setError("There was an issue creating your account. Please check your details and try again.");
        }
      } else if (err.code === 'auth/invalid-email') {
        setError("Please enter a valid email address.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password should be at least 6 characters.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 md:p-12">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center font-bold text-3xl text-white mx-auto mb-6 shadow-lg shadow-blue-200">
            PF
          </div>
          <h1 className="text-3xl font-bold text-slate-900">PaY Flow</h1>
          <p className="text-slate-500 mt-2">Organisation Expense Management</p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
          <button 
            onClick={() => setMode('login')}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
              mode === 'login' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Login
          </button>
          <button 
            onClick={() => setMode('signup')}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
              mode === 'signup' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Create Account
          </button>
        </div>

        {inviteData && (
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-sm mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
            <p className="text-blue-900 font-bold flex items-center gap-2">
              <Plus size={16} /> Invitation Detected
            </p>
            <p className="text-blue-700 mt-1">
              You've been invited to join <strong>{inviteData.organisationName}</strong> as a <strong>{inviteData.role}</strong>. 
              Create your account below to accept.
            </p>
          </div>
        )}

        {resetSent && (
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-sm mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
            <p className="text-emerald-900 font-bold flex items-center gap-2">
              <CheckCircle2 size={16} /> Reset Link Sent
            </p>
            <p className="text-emerald-700 mt-1">
              Please check your inbox (and spam folder) for instructions to reset your password.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-6 border border-red-100 flex flex-col gap-2">
            <p>{error}</p>
            {error.includes("already registered") && (
              <button 
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="text-xs font-bold underline text-red-700 hover:text-red-800 text-left"
              >
                Switch to Login Tab
              </button>
            )}
            {mode === 'login' && error.includes("Create Account") && (
              <button 
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className="text-xs font-bold underline text-red-700 hover:text-red-800 text-left"
              >
                Switch to Create Account Tab
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4 mb-8">
          {mode === 'signup' && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="text-sm font-medium text-slate-700">Full Name</label>
              <input
                required
                type="text"
                placeholder="John Doe"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Email Address</label>
            <input
              required
              type="email"
              placeholder="name@company.com"
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50 disabled:bg-slate-100"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={!!inviteData}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <div className="relative">
              <input
                required
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all pr-12"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          {mode === 'login' && (
            <div className="flex justify-end">
              <button 
                type="button"
                onClick={handleForgotPassword}
                className="text-xs font-bold text-blue-600 hover:text-blue-700"
              >
                Forgot Password?
              </button>
            </div>
          )}
          {mode === 'signup' && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="text-sm font-medium text-slate-700">Confirm Password</label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all pr-12"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-blue-200"
          >
            {loading ? <Loader2 className="animate-spin mx-auto" /> : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-100"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-4 text-slate-400 font-medium">Or continue with</span>
          </div>
        </div>

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 p-4 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                {mode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}
              </>
            )}
          </button>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => setDemoMode(true)}
            className="w-full flex items-center justify-center gap-3 bg-emerald-50 border border-emerald-100 p-4 rounded-xl font-bold text-emerald-700 hover:bg-emerald-100 transition-all active:scale-[0.98]"
          >
            <Play size={20} fill="currentColor" />
            Sign in to Demo
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 mt-8 leading-relaxed">
          {mode === 'login' 
            ? "Welcome back! Please sign in to access your dashboard." 
            : "Join PaY Flow today and start managing your organisation's expenses with ease."}
        </p>
      </div>
    </div>
  );
};

const TopBar = () => {
  const [time, setTime] = useState(new Date());
  const { isDemo, setDemoMode, organisation, allOrganisations, switchOrganisation } = useAuth();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-white border-b border-slate-100 px-8 py-3 flex justify-between items-center gap-4 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        {organisation && (
          <div className="relative">
            <button 
              onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
              className="flex items-center gap-2 px-4 py-1.5 bg-slate-50 border border-slate-100 rounded-full hover:bg-slate-100 transition-colors"
            >
              <Building2 size={16} className="text-blue-600" />
              <span className="text-xs font-bold text-slate-700">{organisation.name}</span>
              <ChevronDown size={14} className={cn("text-slate-400 transition-transform", isSwitcherOpen && "rotate-180")} />
            </button>

            {isSwitcherOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsSwitcherOpen(false)}
                />
                <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-200/50 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    My Organisations
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {allOrganisations.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => {
                          switchOrganisation(org.id);
                          setIsSwitcherOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                          organisation.id === org.id 
                            ? "bg-blue-50 text-blue-700 pointer-events-none" 
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center font-bold flex-shrink-0",
                          organisation.id === org.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
                        )}>
                          {org.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate">{org.name}</p>
                          {organisation.id === org.id && (
                            <p className="text-[10px] text-blue-500 font-medium italic">Active now</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-slate-50 mt-2 pt-2">
                    <button
                      onClick={() => window.location.href = '/setup?new=true'}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-blue-600 hover:bg-blue-50 transition-all font-bold text-sm"
                    >
                      <Plus size={16} />
                      Add New Organisation
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        {isDemo && (
          <div className="flex items-center gap-3 bg-emerald-50 text-emerald-700 px-4 py-1.5 rounded-full border border-emerald-100 animate-pulse">
            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
            <span className="text-xs font-bold uppercase tracking-wider">Demo Mode Active</span>
            <button 
              onClick={() => setDemoMode(false)}
              className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-md hover:bg-emerald-700 transition-colors ml-2"
            >
              Exit Demo
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-slate-500 font-medium bg-slate-50 px-4 py-1.5 rounded-full border border-slate-100">
        <Calendar size={14} className="text-blue-600" />
        <span className="text-xs">
          {time.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <div className="w-px h-3 bg-slate-200 mx-1" />
        <Clock size={14} className="text-blue-600" />
        <span className="text-xs tabular-nums">
          {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode, roles?: UserRole[] }> = ({ children, roles }) => {
  const { user, profile, organisation, loading, isDemo, switching } = useAuth();
  const location = useLocation();

  if (loading && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-6">
          <div className="w-20 h-20 bg-blue-600 rounded-[32px] flex items-center justify-center text-white shadow-2xl shadow-blue-200 animate-bounce">
            <Building2 size={40} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-slate-500 font-bold text-sm">Syncing your organization data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user && !isDemo) {
    return <Login />;
  }

  if (!profile || !organisation) {
    // If user is logged in but has no profile/org, redirect to setup
    if (location.pathname !== '/setup') {
      return <Navigate to="/setup" replace />;
    }
  }

  // Subscription check
  if (organisation && !isDemo) {
    const trialEnd = organisation.subscription?.trialEndDate;
    const isTrialExpired = trialEnd ? new Date(trialEnd) < new Date() : false;
    const isSubActive = organisation.subscription?.status === 'active';
    
    if (isTrialExpired && !isSubActive && location.pathname !== '/billing') {
      return <Navigate to="/billing" replace />;
    }
  }

  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <MobileNav />
      <div className="md:ml-64 flex flex-col min-h-screen relative">
        <TopBar />
        <main className="p-4 md:p-8 flex-1 overflow-x-hidden relative">
          <AnimatePresence>
            {switching && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-white/40 backdrop-blur-[2px] flex flex-col items-center justify-center"
              >
                <div className="bg-white p-10 rounded-[40px] shadow-2xl shadow-slate-200/50 flex flex-col items-center gap-6 border border-slate-100 animate-in zoom-in-95 duration-300">
                  <div className="relative">
                    <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-ping" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900 text-center leading-tight">Syncing your organization data...</h2>
                    <p className="text-slate-500 font-medium">Preparing your workspace</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Suspense fallback={null}>
          <PFAI />
        </Suspense>
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-200 animate-bounce">
                <Building2 size={32} />
              </div>
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          </div>
        }>
          <Routes>
            <Route path="/signup" element={<Login />} />
            <Route path="/setup" element={
              <div className="min-h-screen bg-slate-50 p-6">
                <OrganisationSetup />
              </div>
            } />
            <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/requisitions/*" element={<ProtectedRoute><Requisitions /></ProtectedRoute>} />
            <Route path="/contacts" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
            <Route path="/payroll" element={<ProtectedRoute roles={['Super User', 'Financial Manager', 'CEO/CFO']}><Payroll /></ProtectedRoute>} />
            <Route path="/deductions" element={<ProtectedRoute roles={['Super User', 'Financial Manager', 'CEO/CFO']}><Deductions /></ProtectedRoute>} />
            <Route path="/payment-schedule" element={<ProtectedRoute><PaymentSchedule /></ProtectedRoute>} />
            <Route path="/vat-report" element={<ProtectedRoute roles={['Super User', 'Financial Manager', 'CEO/CFO']}><VatReport /></ProtectedRoute>} />
            <Route path="/recurring-costs" element={<ProtectedRoute roles={['Super User', 'Financial Manager', 'CEO/CFO']}><RecurringCosts /></ProtectedRoute>} />
            <Route path="/reports/project-expenditure" element={<ProtectedRoute roles={['Super User', 'Financial Manager', 'CEO/CFO']}><ProjectExpenseReport /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute roles={['Super User', 'Financial Manager', 'CEO/CFO', 'Manager']}><SettingsPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </Router>
  );
}

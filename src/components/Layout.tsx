import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Receipt, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  HelpCircle,
  MessageSquare,
  Calculator,
  Bot,
  Truck,
  Bell,
  Building2,
  Map,
  ClipboardList,
  UserCircle,
  ShieldCheck,
  Briefcase,
  CreditCard,
  Download,
  Zap
} from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { cn } from '../lib/utils';
import { ROLE_LABELS, Permission } from '../lib/rolePermissions';
import { UserProfile, Organisation } from '../types';

import { toast } from 'sonner';
import { differenceInDays } from 'date-fns';

import { OrgSwitcher } from './OrgSwitcher';

interface NavItem {
  name: string;
  href: string;
  icon: any;
  permission?: Permission;
  proOnly?: boolean;
}

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Main',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Employees', href: '/employees', icon: Users, permission: 'canCreateEmployees' },
      { name: 'Job Cards', href: '/job-cards', icon: FileText, permission: 'canCreateJobCards' },
    ]
  },
  {
    title: 'Finance',
    items: [
      { name: 'Payroll', href: '/payroll', icon: Calculator, permission: 'canProcessPayroll' },
      { name: 'Invoicing', href: '/invoicing', icon: Receipt, permission: 'canManageInvoicing' },
      { name: 'Deductions', href: '/deductions', icon: ClipboardList, permission: 'canManageDeductions' },
    ]
  },
  {
    title: 'Management',
    items: [
      { name: 'Clients', href: '/clients', icon: Briefcase, permission: 'canManageClients' },
      { name: 'Leave', href: '/leave', icon: Map, permission: 'canViewReports', proOnly: true }, // Using Map for Leave as per spec navigation
      { name: 'Reports', href: '/reports', icon: ShieldCheck, permission: 'canViewReports' },
      { name: 'Active Users', href: '/active-users', icon: Map, permission: 'canViewReports' },
    ]
  },
  {
    title: 'System',
    items: [
      { name: 'AI Assistant', href: '/ai-assistant', icon: Bot },
      { name: 'Subscription', href: '/subscription', icon: CreditCard, permission: 'canManageOrg' },
      { name: 'Settings', href: '/settings', icon: Settings, permission: 'canManageSettings' },
      { name: 'User Management', href: '/users', icon: UserCircle, permission: 'canManageUsers' },
      { name: 'Organisation', href: '/organisation', icon: Building2, permission: 'canManageOrg' },
    ]
  }
];

const NavContent = ({ 
  user,
  profile, 
  organisation, 
  can, 
  isPro, 
  setIsMobileMenuOpen, 
  handleLogout 
}: { 
  user: any;
  profile: UserProfile | null, 
  organisation: Organisation | null, 
  can: (p: Permission) => boolean, 
  isPro: boolean, 
  setIsMobileMenuOpen: (o: boolean) => void,
  handleLogout: () => void
}) => {
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const location = useLocation();

  React.useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      toast.info('To install on mobile, use "Add to Home Screen" in your browser menu.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--sidebar-bg)] text-[var(--sidebar-text)]">
      <div className="p-4 pb-0">
        <OrgSwitcher />
      </div>
      
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-8">
          {navSections.map((section) => {
            const visibleItems = section.items.filter(item => {
              const checkPermission = !item.permission || can(item.permission);
              const meetsPlanRequirement = !item.proOnly || isPro;
              return checkPermission && meetsPlanRequirement;
            });
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title} className="space-y-2">
                <h2 className="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                  {section.title}
                </h2>
                <nav className="space-y-1">
                  {visibleItems.map((item) => {
                      const targetHref = organisation ? `${item.href}/${organisation.id}` : item.href;
                      const isActive = location.pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.name}
                          to={targetHref}
                          onClick={() => setIsMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 group",
                          isActive 
                            ? "bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20" 
                            : "text-white/60 hover:text-white hover:bg-white/5"
                        )}
                      >
                        <item.icon className={cn(
                          "w-5 h-5 transition-transform duration-200 group-hover:scale-110",
                          isActive ? "text-white" : "text-white/40 group-hover:text-white/70"
                        )} />
                        {item.name}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-white/5 space-y-2">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 text-white/60 hover:text-white hover:bg-white/5 rounded-xl font-bold py-6"
          onClick={handleInstall}
        >
          <Download className="w-5 h-5" />
          Download App
        </Button>
        <div className="flex items-center gap-3 p-2">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-black border border-white/10 shrink-0">
            {profile?.displayName?.[0] || profile?.email?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">{profile?.displayName || user?.displayName || 'User'}</p>
            <p className="text-[10px] font-bold text-white/40 truncate">{profile?.email || user?.email || 'Loading...'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, organisation, can, isPro } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('activeOrgId');
    await signOut(auth);
    navigate('/login');
  };

  const getPageTitle = () => {
    const currentPath = location.pathname;
    for (const section of navSections) {
      const item = section.items.find(i => currentPath.startsWith(i.href));
      if (item) return item.name;
    }
    return 'FieldPay';
  };

  return (
    <div className="flex h-screen bg-[var(--color-background)] text-[var(--color-foreground)] overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-72 md:flex-col shrink-0">
        <NavContent 
          user={user}
          profile={profile} 
          organisation={organisation} 
          can={can} 
          isPro={isPro} 
          setIsMobileMenuOpen={setIsMobileMenuOpen}
          handleLogout={handleLogout}
        />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-72 border-none">
          <NavContent 
            user={user}
            profile={profile} 
            organisation={organisation} 
            can={can} 
            isPro={isPro} 
            setIsMobileMenuOpen={setIsMobileMenuOpen}
            handleLogout={handleLogout}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Trial Warning Banner */}
        {organisation?.subscriptionStatus === 'trialing' && organisation.trialEndDate && (
          <div className={cn(
            "px-6 py-2 flex items-center justify-between gap-4",
            differenceInDays(new Date(organisation.trialEndDate), new Date()) <= 7 
              ? "bg-red-500 text-white" 
              : "bg-amber-100 text-amber-800"
          )}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              <Zap className="w-4 h-4" />
              {differenceInDays(new Date(organisation.trialEndDate), new Date()) <= 0 
                ? "Your trial has expired. Please upgrade to continue using FieldPay."
                : `Trial ends in ${differenceInDays(new Date(organisation.trialEndDate), new Date())} days. Upgrade now to avoid interruption.`}
            </div>
            <Link to="/subscription" className="text-[10px] font-black uppercase tracking-widest underline decoration-2 underline-offset-4">
              Upgrade Now
            </Link>
          </div>
        )}

        <header className="flex items-center justify-between p-4 md:p-8 bg-white/50 backdrop-blur-md border-b">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="w-6 h-6" />
            </Button>
            <h1 className="text-2xl font-black tracking-tight text-[var(--color-secondary)] uppercase">
              {getPageTitle()}
            </h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="icon" className="relative rounded-xl hover:bg-gray-100">
              <Bell className="w-5 h-5 text-gray-500" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              className="rounded-xl text-red-500 hover:text-red-600 hover:bg-red-50/50"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
          {children}
        </div>
      </main>

      {/* Floating AI Assistant Button */}
      <Button 
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full shadow-2xl bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white p-0 group"
        onClick={() => navigate(organisation ? `/ai-assistant/${organisation.id}` : '/ai-assistant')}
      >
        <div className="absolute inset-0 rounded-full border-2 border-[var(--color-primary)] animate-ping opacity-20 group-hover:opacity-40" />
        <MessageSquare className="w-6 h-6 relative z-10" />
      </Button>
    </div>
  );
};

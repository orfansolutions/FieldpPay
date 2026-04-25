import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { JobCardsPage } from './pages/JobCardsPage';
import { InvoicingPage } from './pages/InvoicingPage';
import { SettingsPage } from './pages/SettingsPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { PayrollPage } from './pages/PayrollPage';
import { DeductionsPage } from './pages/DeductionsPage';
import { ClientsPage } from './pages/ClientsPage';
import { LeavePage } from './pages/LeavePage';
import { ReportsPage } from './pages/ReportsPage';
import { ActiveUsersPage } from './pages/ActiveUsersPage';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { OrganisationPage } from './pages/OrganisationPage';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Toaster } from './components/ui/sonner';
import { ConsentDialog } from './components/layout/ConsentDialog';
import { GlobalLoader } from './components/GlobalLoader';
import { GlobalTransitionLoader } from './components/GlobalTransitionLoader';
import { db } from './lib/firebase';
import { doc, getDocFromServer, collection, query, where, onSnapshot, getDocs, limit } from 'firebase/firestore';
import { Users, FileCheck, CreditCard, TrendingUp, AlertCircle, Wallet, BarChart3, PieChart as PieChartIcon, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Button } from './components/ui/button';

// Validate Connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

import { useDemoData } from './hooks/useDemoData';

// Redirect to active org ID if available
const RootRedirect = () => {
  const { user, organisation, loading } = useAuth();
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';

  if (loading) return <GlobalLoader />;
  
  // Force sending back to login if no user and no cached auth intent
  if (!user && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If user is logged in but has no organisation, they need to create one
  if (user && !organisation) {
    return <Navigate to="/organisation" replace />;
  }
  
  // If we have an organisation, go to dashboard
  if (organisation) {
    return <Navigate to={`/dashboard/${organisation.id}`} replace />;
  }

  // Fallback to login
  return <Navigate to="/login" replace />;
};

// Real Dashboard
const Dashboard = () => {
  const { organisation, profile, can, setIsSwitching } = useAuth();
  const navigate = useNavigate();
  const { demoEmployees, demoJobCards, IS_DEMO_MODE } = useDemoData(organisation?.id);
  const [isDataLoading, setIsDataLoading] = React.useState(true);
  const [stats, setStats] = React.useState({
    employees: 0,
    jobCardsThisMonth: 0,
    pendingApprovals: 0,
    pendingInvoicing: 0,
    totalRevenue: 0,
    totalWageCost: 0,
    activeEmployees: 0
  });

  const [viewType, setViewType] = React.useState<'fy' | 'all'>('fy');

  React.useEffect(() => {
    if (!organisation) return;

    // Reset stats immediately when organisation changes to prevent data leak
    setStats({
      employees: 0,
      jobCardsThisMonth: 0,
      pendingApprovals: 0,
      pendingInvoicing: 0,
      totalRevenue: 0,
      totalWageCost: 0,
      activeEmployees: 0
    });
    setIsDataLoading(true);

    if (organisation.isDemo || organisation.id.startsWith('demo_')) {
      const demoPending = demoJobCards.filter(jc => jc.status === 'Submitted').length;
      setStats({
        employees: demoEmployees.length,
        activeEmployees: demoEmployees.length,
        jobCardsThisMonth: demoJobCards.length,
        pendingApprovals: demoPending,
        pendingInvoicing: 3,
        totalRevenue: 15000,
        totalWageCost: 8000
      });
      setIsDataLoading(false);
      setIsSwitching(false);
      return;
    }

    const unsubs: (() => void)[] = [];
    let loadCount = 0;
    const totalToLoad = 6;
    let isMounted = true;

    const checkReady = () => {
      if (!isMounted) return;
      loadCount++;
      if (loadCount >= totalToLoad) {
        setIsDataLoading(false);
        // Delay slightly for perceived smoothness
        setTimeout(() => {
          if (isMounted) setIsSwitching(false);
        }, 800);
      }
    };

    // Safety fallback: If sync takes more than 5s, force unlock UI
    const syncFallback = setTimeout(() => {
      if (isDataLoading && isMounted) {
        console.warn("Dashboard sync timed out, forcing UI unlock.");
        setIsDataLoading(false);
        setIsSwitching(false);
      }
    }, 5000);

    // Active Employees
    const qEmp = query(collection(db, `organisations/${organisation.id}/employees`), where('status', '==', 'active'));
    unsubs.push(onSnapshot(qEmp, (snap) => {
      const realSize = snap.size;
      const totalSize = IS_DEMO_MODE ? realSize + demoEmployees.length : realSize;
      setStats(prev => ({ ...prev, activeEmployees: totalSize, employees: totalSize }));
      if (isDataLoading) checkReady();
    }, () => checkReady()));

    // Job Cards This Month
    const startOfMonthDate = new Date();
    startOfMonthDate.setDate(1);
    startOfMonthDate.setHours(0,0,0,0);
    const qJC = query(
      collection(db, `organisations/${organisation.id}/jobcards`), 
      where('date', '>=', startOfMonthDate.toISOString())
    );
    unsubs.push(onSnapshot(qJC, (snap) => {
      const realSize = snap.size;
      const totalSize = IS_DEMO_MODE ? realSize + demoJobCards.length : realSize;
      setStats(prev => ({ ...prev, jobCardsThisMonth: totalSize }));
      if (isDataLoading) checkReady();
    }, () => checkReady()));

    // Pending Approvals (Status = submitted or open)
    const qPendingApp = query(
      collection(db, `organisations/${organisation.id}/jobcards`), 
      where('status', 'in', ['submitted', 'Pending Approval', 'Submitted'])
    );
    unsubs.push(onSnapshot(qPendingApp, (snap) => {
      const realSize = snap.size;
      const demoPending = demoJobCards.filter(jc => jc.status === 'Submitted').length;
      const totalSize = IS_DEMO_MODE ? realSize + demoPending : realSize;
      setStats(prev => ({ ...prev, pendingApprovals: totalSize }));
      if (isDataLoading) checkReady();
    }, () => checkReady()));

    // Pending Invoicing (Approved but not invoiced)
    const qPendingInv = query(
      collection(db, `organisations/${organisation.id}/jobcards`), 
      where('status', '==', 'Approved')
    );
    unsubs.push(onSnapshot(qPendingInv, (snap) => {
      const realSize = snap.size;
      const totalSize = IS_DEMO_MODE ? realSize + 3 : realSize;
      setStats(prev => ({ ...prev, pendingInvoicing: totalSize }));
      if (isDataLoading) checkReady();
    }, () => checkReady()));

    // Revenue (Invoiced)
    const qRevenue = query(
      collection(db, `organisations/${organisation.id}/jobcards`), 
      where('status', '==', 'Invoiced')
    );
    unsubs.push(onSnapshot(qRevenue, (snap) => {
      const rev = snap.docs.reduce((acc, doc) => acc + (doc.data().total_invoice_amount || 0), 0);
      setStats(prev => ({ ...prev, totalRevenue: IS_DEMO_MODE ? rev + 15000 : rev }));
      if (isDataLoading) checkReady();
    }, () => checkReady()));

    // Wage Cost (Paid)
    const qWages = query(
      collection(db, `organisations/${organisation.id}/jobcards`), 
      where('status', '==', 'Paid')
    );
    unsubs.push(onSnapshot(qWages, (snap) => {
      const wage = snap.docs.reduce((acc, doc) => acc + (doc.data().total_wage_amount || 0), 0);
      setStats(prev => ({ ...prev, totalWageCost: IS_DEMO_MODE ? wage + 8000 : wage }));
      if (isDataLoading) checkReady();
    }, () => checkReady()));

    // Initial check if collections are empty
    const checkEmpty = async () => {
        const docSnaps = await Promise.all([
            getDocs(query(collection(db, `organisations/${organisation.id}/employees`), limit(1))),
            getDocs(query(collection(db, `organisations/${organisation.id}/jobcards`), limit(1))),
        ]);
        if (docSnaps.every(s => s.empty)) {
            // If completely empty, we might not trigger snapshots if they have no initial data
            // But snapshots usually trigger once immediately with empty state.
        }
    }
    checkEmpty();

    return () => {
      isMounted = false;
      clearTimeout(syncFallback);
      unsubs.forEach(unsub => unsub());
    };
  }, [organisation?.id]); // mandatory dependency activeOrgId

  const chartData = [
    { name: 'Jan', revenue: 4000, wages: 2400 },
    { name: 'Feb', revenue: 3000, wages: 1398 },
    { name: 'Mar', revenue: 2000, wages: 9800 },
    { name: 'Apr', revenue: 2780, wages: 3908 },
    { name: 'May', revenue: 1890, wages: 4800 },
    { name: 'Jun', revenue: 2390, wages: 3800 },
  ];

  const pieData = [
    { name: 'Draft', value: 400 },
    { name: 'Pending', value: 300 },
    { name: 'Approved', value: 300 },
    { name: 'Invoiced', value: 200 },
  ];

  const COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#6366F1'];

  const grossProfit = stats.totalRevenue - stats.totalWageCost;
  const profitMargin = stats.totalRevenue > 0 ? (grossProfit / stats.totalRevenue) * 100 : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-[var(--color-secondary)]">DASHBOARD</h1>
          <p className="text-[var(--color-muted-foreground)] font-medium">Performance metrics for {organisation?.registered_name || organisation?.name}</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border-2 shadow-sm">
          <Button 
            variant={viewType === 'fy' ? 'default' : 'ghost'} 
            size="sm" 
            className="rounded-xl font-bold"
            onClick={() => setViewType('fy')}
          >
            Financial Year
          </Button>
          <Button 
            variant={viewType === 'all' ? 'default' : 'ghost'} 
            size="sm" 
            className="rounded-xl font-bold"
            onClick={() => setViewType('all')}
          >
            All Time
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Row 1: Financials */}
        <Card 
          className="border-none shadow-xl shadow-gray-200/50 rounded-[2rem] overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer"
          onClick={() => navigate(`/job-cards/${organisation.id}?status=Invoiced`)}
        >
          <CardHeader className="pb-2 bg-gradient-to-br from-amber-50 to-transparent">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 flex items-center gap-2">
              <TrendingUp className="w-3 h-3" /> Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-[var(--color-secondary)]">R {stats.totalRevenue.toLocaleString()}</div>
            <p className="text-[10px] text-gray-400 mt-1 font-bold">Invoiced job cards this FY</p>
          </CardContent>
        </Card>

        <Card 
          className="border-none shadow-xl shadow-gray-200/50 rounded-[2rem] overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer"
          onClick={() => navigate(`/payroll/${organisation.id}`)}
        >
          <CardHeader className="pb-2 bg-gradient-to-br from-blue-50 to-transparent">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 flex items-center gap-2">
              <Wallet className="w-3 h-3" /> Total Wage Cost
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-[var(--color-secondary)]">R {stats.totalWageCost.toLocaleString()}</div>
            <p className="text-[10px] text-gray-400 mt-1 font-bold">Paid job cards this FY</p>
          </CardContent>
        </Card>

        <Card 
          className="border-none shadow-xl shadow-gray-200/50 rounded-[2rem] overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer"
          onClick={() => navigate(`/reports/${organisation.id}`)}
        >
          <CardHeader className="pb-2 bg-gradient-to-br from-emerald-50 to-transparent">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-2">
              <CreditCard className="w-3 h-3" /> Gross Profit
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-[var(--color-secondary)]">R {grossProfit.toLocaleString()}</div>
            <p className="text-[10px] text-gray-400 mt-1 font-bold">Revenue - Wage Cost</p>
          </CardContent>
        </Card>

        <Card 
          className="border-none shadow-xl shadow-gray-200/50 rounded-[2rem] overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer"
          onClick={() => navigate(`/reports/${organisation.id}`)}
        >
          <CardHeader className="pb-2 bg-gradient-to-br from-purple-50 to-transparent">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-600 flex items-center gap-2">
              <BarChart3 className="w-3 h-3" /> Profit Margin
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-[var(--color-secondary)]">{profitMargin.toFixed(1)}%</div>
            <p className="text-[10px] text-gray-400 mt-1 font-bold">Efficiency ratio</p>
          </CardContent>
        </Card>

        {/* Row 2: Operations */}
        <Card 
          className="border-none shadow-xl shadow-gray-200/50 rounded-[2rem] overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer"
          onClick={() => navigate(`/employees/${organisation.id}`)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
              <Users className="w-3 h-3" /> Active Employees
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-[var(--color-primary)]">{stats.activeEmployees}</div>
            <p className="text-[10px] text-gray-400 mt-1 font-bold">Currently deployed</p>
          </CardContent>
        </Card>

        <Card 
          className="border-none shadow-xl shadow-gray-200/50 rounded-[2rem] overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer"
          onClick={() => navigate(`/job-cards/${organisation.id}`)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
              <Clock className="w-3 h-3" /> Cards This Month
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-[var(--color-primary)]">{stats.jobCardsThisMonth}</div>
            <p className="text-[10px] text-gray-400 mt-1 font-bold">Total volume</p>
          </CardContent>
        </Card>

        <Card 
          className="border-none shadow-xl shadow-gray-200/50 rounded-[2rem] overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer"
          onClick={() => navigate(`/job-cards/${organisation.id}?status=Pending`)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500 flex items-center gap-2">
              <AlertCircle className="w-3 h-3" /> Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-orange-600">{stats.pendingApprovals}</div>
            <p className="text-[10px] text-gray-400 mt-1 font-bold">Requires attention</p>
          </CardContent>
        </Card>

        <Card 
          className="border-none shadow-xl shadow-gray-200/50 rounded-[2rem] overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer"
          onClick={() => navigate(`/job-cards/${organisation.id}?status=Approved`)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 flex items-center gap-2">
              <FileCheck className="w-3 h-3" /> Pending Invoicing
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-indigo-600">{stats.pendingInvoicing}</div>
            <p className="text-[10px] text-gray-400 mt-1 font-bold">Ready to bill</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-xl shadow-gray-200/50 rounded-[2rem] p-8">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-xl font-black tracking-tight text-[var(--color-secondary)]">Monthly Performance</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="h-[350px] w-full min-h-[350px]">
              <ResponsiveContainer width="99%" aspect={2.5}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar dataKey="revenue" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="wages" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl shadow-gray-200/50 rounded-[2rem] p-8">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-xl font-black tracking-tight text-[var(--color-secondary)]">Job Cards by Status</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0 flex flex-col items-center">
            <div className="h-[250px] w-full min-h-[250px]">
              <ResponsiveContainer width="99%" aspect={1.5}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4 w-full">
              {pieData.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-xs font-bold text-gray-500">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isSwitching } = useAuth();
  
  if (loading) return <GlobalLoader />;
  if (isSwitching) return <GlobalTransitionLoader show={true} />;
  if (!user) return <Navigate to="/login" />;
  
  return <Layout>{children}</Layout>;
};

import { PaystackProvider } from './components/PaystackProvider';

export default function App() {
  return (
    <AuthProvider>
      <PaystackProvider>
        <Router>
          <ConsentDialog />
          <Routes>
            <Route path="/login" element={<LandingPage />} />
            
            <Route path="/dashboard/:orgId" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/employees/:orgId" element={<ProtectedRoute><EmployeesPage /></ProtectedRoute>} />
            <Route path="/job-cards/:orgId" element={<ProtectedRoute><JobCardsPage /></ProtectedRoute>} />
            <Route path="/payroll/:orgId" element={<ProtectedRoute><PayrollPage /></ProtectedRoute>} />
            <Route path="/deductions/:orgId" element={<ProtectedRoute><DeductionsPage /></ProtectedRoute>} />
            <Route path="/clients/:orgId" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
            <Route path="/leave/:orgId" element={<ProtectedRoute><LeavePage /></ProtectedRoute>} />
            <Route path="/reports/:orgId" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
            <Route path="/active-users/:orgId" element={<ProtectedRoute><ActiveUsersPage /></ProtectedRoute>} />
            <Route path="/users/:orgId" element={<ProtectedRoute><ActiveUsersPage /></ProtectedRoute>} />
            <Route path="/invoicing/:orgId" element={<ProtectedRoute><InvoicingPage /></ProtectedRoute>} />
            <Route path="/subscription/:orgId" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
            <Route path="/organisation" element={<ProtectedRoute><OrganisationPage /></ProtectedRoute>} />
            <Route path="/organisation/:orgId" element={<ProtectedRoute><OrganisationPage /></ProtectedRoute>} />
            <Route path="/settings/:orgId" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/ai-assistant/:orgId" element={<ProtectedRoute><AIAssistantPage /></ProtectedRoute>} />

            {/* Catch-all to handle malformed URLs */}
            <Route path="*" element={<RootRedirect />} />

            {/* Redirection for naked paths */}
            <Route path="/dashboard" element={<RootRedirect />} />
            <Route path="/employees" element={<RootRedirect />} />
            <Route path="/job-cards" element={<RootRedirect />} />
            <Route path="/payroll" element={<RootRedirect />} />
            <Route path="/deductions" element={<RootRedirect />} />
            <Route path="/clients" element={<RootRedirect />} />
            <Route path="/leave" element={<RootRedirect />} />
            <Route path="/reports" element={<RootRedirect />} />
            <Route path="/active-users" element={<RootRedirect />} />
            <Route path="/users" element={<RootRedirect />} />
            <Route path="/invoicing" element={<RootRedirect />} />
            <Route path="/subscription" element={<RootRedirect />} />
            <Route path="/organisation" element={<ProtectedRoute><OrganisationPage /></ProtectedRoute>} />
            <Route path="/settings" element={<RootRedirect />} />
            <Route path="/ai-assistant" element={<RootRedirect />} />
            
            <Route path="/" element={<RootRedirect />} />
          </Routes>
        </Router>
        <Toaster position="top-right" />
      </PaystackProvider>
    </AuthProvider>
  );
}

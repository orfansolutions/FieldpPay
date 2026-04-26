import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { Requisition, Project, Department, PaymentCycle, Contact, PayrollRun } from '../types';
import { 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Briefcase,
  Users,
  Plus,
  Download,
  FileText,
  ChevronRight,
  Building2,
  ArrowLeft,
  Calendar,
  Zap,
  X,
  Loader2,
  Eye,
  Banknote,
  Brain,
  Sparkles
} from 'lucide-react';
import { cn, formatCurrency, formatDate, handleFirestoreError, OperationType } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { analyseProjectExpenditure } from '../services/geminiService';
import Markdown from 'react-markdown';
import { motion } from 'motion/react';

import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { organisation, profile, isDemo, showInstallBtn, handleInstallClick, showToast } = useAuth();
  const navigate = useNavigate();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [paymentCycles, setPaymentCycles] = useState<PaymentCycle[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState<{ type: string, departmentId?: string } | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>('All');
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);

  useEffect(() => {
    if (isDemo) {
      import('../lib/demoData').then(demo => {
        setRequisitions(demo.DEMO_REQUISITIONS);
        setProjects(demo.DEMO_PROJECTS);
        setDepartments(demo.DEMO_DEPARTMENTS);
        setPaymentCycles(demo.DEMO_PAYMENT_CYCLES);
        setContacts(demo.DEMO_CONTACTS);
        setLoading(false);
      });
      return;
    }

    if (!organisation?.id || !auth.currentUser) return;

    // Step 1: Clear previous data and set loading immediately to prevent ghost data
    setLoading(true);
    setRequisitions([]);
    setProjects([]);
    setDepartments([]);
    setPaymentCycles([]);
    setContacts([]);
    setPayrollRuns([]);

    const fetchData = async () => {
      try {
        // Step 2: Parallel Fetch for initial data (First Meaningful Paint)
        const [reqSnap, projSnap, deptSnap, cycleSnap, contactSnap] = await Promise.all([
          getDocs(query(collection(db, 'requisitions'), where('organisationId', '==', organisation.id))),
          getDocs(query(collection(db, 'projects'), where('organisationId', '==', organisation.id))),
          getDocs(query(collection(db, 'departments'), where('organisationId', '==', organisation.id))),
          getDocs(query(collection(db, 'paymentCycles'), where('organisationId', '==', organisation.id))),
          getDocs(query(collection(db, 'contacts'), where('organisationId', '==', organisation.id)))
        ]);

        setRequisitions(reqSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Requisition)));
        setProjects(projSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
        setDepartments(deptSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)));
        setPaymentCycles(cycleSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentCycle)));
        setContacts(contactSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact)));
        
        const isFinanceOrAbove = ['Super User', 'CEO/CFO', 'Financial Manager', 'Manager'].includes(profile?.role || '');
        if (isFinanceOrAbove) {
          const runSnap = await getDocs(query(collection(db, 'payrollRuns'), where('organisationId', '==', organisation.id)));
          setPayrollRuns(runSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PayrollRun)));
        }

        setLoading(false);
      } catch (err) {
        console.error('Initial fetch error:', err);
        setLoading(false);
      }
    };

    fetchData();

    // Step 3: Attach long-lived listeners for real-time updates
    const unsubReq = onSnapshot(query(collection(db, 'requisitions'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setRequisitions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Requisition)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'requisitions'));

    const unsubProj = onSnapshot(query(collection(db, 'projects'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'projects'));

    const unsubDept = onSnapshot(query(collection(db, 'departments'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setDepartments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'departments'));

    const unsubCycles = onSnapshot(query(collection(db, 'paymentCycles'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setPaymentCycles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentCycle)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'paymentCycles'));

    const unsubContacts = onSnapshot(query(collection(db, 'contacts'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'contacts'));

    const isFinanceOrAbove = ['Super User', 'CEO/CFO', 'Financial Manager', 'Manager'].includes(profile?.role || '');
    let unsubPayroll = () => {};

    if (isFinanceOrAbove) {
      unsubPayroll = onSnapshot(query(collection(db, 'payrollRuns'), where('organisationId', '==', organisation.id)), (snapshot) => {
        setPayrollRuns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PayrollRun)));
      }, (error) => handleFirestoreError(error, OperationType.GET, 'payrollRuns'));
    }

    return () => {
      unsubReq();
      unsubProj();
      unsubDept();
      unsubCycles();
      unsubContacts();
      unsubPayroll();
    };
  }, [organisation?.id, isDemo, profile?.role]);

  const stats = useMemo(() => ({
    submitted: {
      amount: requisitions.filter(r => r.status !== 'Draft').reduce((acc, r) => acc + (r.totalAmount || r.amount || 0), 0),
      count: requisitions.filter(r => r.status !== 'Draft').length
    },
    pending: {
      amount: requisitions.filter(r => ['Submitted', 'Awaiting Departmental Approval', 'Awaiting CEO/CFO Approval', 'Awaiting Finance Approval'].includes(r.status)).reduce((acc, r) => acc + (r.totalAmount || r.amount || 0), 0),
      count: requisitions.filter(r => ['Submitted', 'Awaiting Departmental Approval', 'Awaiting CEO/CFO Approval', 'Awaiting Finance Approval'].includes(r.status)).length
    },
    approved: {
      amount: requisitions.filter(r => ['Approved', 'Paid'].includes(r.status)).reduce((acc, r) => acc + (r.totalAmount || r.amount || 0), 0),
      count: requisitions.filter(r => ['Approved', 'Paid'].includes(r.status)).length
    },
    paid: {
      amount: requisitions.filter(r => r.status === 'Paid').reduce((acc, r) => acc + (r.totalAmount || r.amount || 0), 0),
      count: requisitions.filter(r => r.status === 'Paid').length
    },
    rejected: {
      amount: requisitions.filter(r => r.status === 'Rejected').reduce((acc, r) => acc + (r.totalAmount || r.amount || 0), 0),
      count: requisitions.filter(r => r.status === 'Rejected').length
    },
    vat: {
      amount: requisitions
        .filter(r => !['Draft', 'Rejected'].includes(r.status))
        .reduce((acc, r) => acc + (r.totalVatAmount || 0), 0),
      count: requisitions.filter(r => !['Draft', 'Rejected'].includes(r.status) && (r.totalVatAmount || 0) > 0).length
    },
    payrollDue: {
      amount: payrollRuns.filter(r => r.status === 'Approved').reduce((acc, r) => acc + r.totalNet, 0),
      count: payrollRuns.filter(r => r.status === 'Approved').length
    }
  }), [requisitions, payrollRuns]);

  const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);
  const [clearDataConfirmText, setClearDataConfirmText] = useState('');

  const handleClearTestData = async () => {
    if (!organisation || profile?.role !== 'Super User') return;
    if (clearDataConfirmText !== 'DELETE') {
      showToast('Please type DELETE to confirm.', 'warning');
      return;
    }
    
    setLoading(true);
    try {
      const collections = ['requisitions', 'projects', 'contacts', 'departments', 'chartOfAccounts', 'paymentCycles', 'publicHolidays', 'recurringCosts'];
      for (const coll of collections) {
        const q = query(collection(db, coll), where('organisationId', '==', organisation.id));
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, coll, d.id)));
        await Promise.all(deletePromises);
      }
      setIsClearDataModalOpen(false);
      setClearDataConfirmText('');
      showToast('Organisation data cleared successfully.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'organisations');
    } finally {
      setLoading(false);
    }
  };

  const upcomingReqs = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const allDates = paymentCycles.flatMap(c => c.paymentDates).sort();
    const nextDate = allDates.find(d => d >= today);
    if (!nextDate) return [];
    const reqs = requisitions.filter(r => r.paymentDate === nextDate && r.status === 'Approved');
    
    // Consolidate by client name
    const consolidated = reqs.reduce((acc, req) => {
      const contact = contacts.find(c => c.id === req.contactId);
      const contactName = contact?.name || 'Unknown Client';
      if (!acc[contactName]) {
        acc[contactName] = {
          id: contactName,
          name: contactName,
          amount: 0,
          paymentDate: nextDate,
          count: 0
        };
      }
      acc[contactName].amount += (req.totalAmount || req.amount || 0);
      acc[contactName].count += 1;
      return acc;
    }, {} as Record<string, any>);
    
    return Object.values(consolidated);
  }, [requisitions, paymentCycles, contacts]);

  const exceptionReqs = useMemo(() => 
    requisitions.filter(r => r.isException && !['Approved', 'Rejected', 'Paid'].includes(r.status)),
    [requisitions]
  );

  const handleAnalyse = async () => {
    setAnalysing(true);
    try {
      const insights = await analyseProjectExpenditure(projectData);
      setAiInsights(insights);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalysing(false);
    }
  };

  if (drillDown) {
    const filteredByStatus = requisitions.filter(r => {
      if (drillDown.type === 'Submitted') return r.status !== 'Draft';
      if (drillDown.type === 'Pending') return ['Submitted', 'Awaiting Departmental Approval', 'Awaiting CEO/CFO Approval', 'Awaiting Finance Approval'].includes(r.status);
      if (drillDown.type === 'Approved') return r.status === 'Approved';
      if (drillDown.type === 'Paid') return r.status === 'Paid';
      if (drillDown.type === 'Rejected') return r.status === 'Rejected';
      return false;
    });

    const filteredByProject = projectFilter === 'All' ? filteredByStatus : filteredByStatus.filter(r => r.projectId === projectFilter);

    if (!drillDown.departmentId) {
      // Show breakdown by department
      const deptBreakdown = departments.map(dept => {
        const reqs = filteredByProject.filter(r => r.departmentId === dept.id || r.lineItems?.some(li => li.departmentId === dept.id));
        return {
          ...dept,
          amount: reqs.reduce((acc, r) => {
            if (r.lineItems?.length > 0) {
              return acc + r.lineItems.filter(li => li.departmentId === dept.id).reduce((sum, li) => sum + li.amount, 0);
            }
            return acc + (r.amount || 0);
          }, 0),
          count: reqs.length
        };
      }).filter(d => d.count > 0);

      return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button onClick={() => setDrillDown(null)} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft size={20} /> Back to Dashboard
          </button>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-slate-900">{drillDown.type} Requisitions - Department Breakdown</h2>
            <select 
              className="p-2 bg-white border border-slate-200 rounded-xl outline-none text-sm"
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
            >
              <option value="All">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {deptBreakdown.map(dept => (
              <button 
                key={dept.id}
                onClick={() => setDrillDown({ ...drillDown, departmentId: dept.id })}
                className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all text-center group relative overflow-hidden"
              >
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-600 rounded-full opacity-5 group-hover:scale-110 transition-transform" />
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-lg shadow-blue-100">
                    <Building2 size={32} />
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg mb-2">{dept.name}</h3>
                  <div className="space-y-1">
                    <p className="text-3xl font-black text-blue-600">{formatCurrency(dept.amount)}</p>
                    <p className="text-sm font-medium text-slate-400">{dept.count} Requisitions</p>
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-blue-600 font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    View Details <ChevronRight size={16} />
                  </div>
                </div>
              </button>
            ))}
            {deptBreakdown.length === 0 && (
              <div className="col-span-full py-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
                <p>No data found for this selection</p>
              </div>
            )}
          </div>
        </div>
      );
    } else {
      // Show full list for specific department
      const deptName = departments.find(d => d.id === drillDown.departmentId)?.name;
      const finalReqs = filteredByProject.filter(r => 
        r.departmentId === drillDown.departmentId || 
        r.lineItems?.some(li => li.departmentId === drillDown.departmentId)
      );

      return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button onClick={() => setDrillDown({ type: drillDown.type })} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft size={20} /> Back to Breakdown
          </button>
          
          <h2 className="text-2xl font-bold text-slate-900">{drillDown.type} Requisitions - {deptName}</h2>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 text-slate-400 text-xs uppercase tracking-widest font-bold">
                <tr>
                  <th className="px-6 py-4">Invoice / Date</th>
                  <th className="px-6 py-4">Project</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {finalReqs.map(req => {
                  const deptAmount = req.lineItems?.length > 0
                    ? req.lineItems.filter(li => li.departmentId === drillDown.departmentId).reduce((sum, li) => sum + li.amount, 0)
                    : (req.totalAmount || req.amount || 0);

                  return (
                    <tr key={req.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{req.invoiceNumber || 'N/A'}</p>
                        <p className="text-xs text-slate-400">{formatDate(req.date)}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {projects.find(p => p.id === req.projectId)?.name || 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{formatCurrency(deptAmount)}</p>
                        {req.lineItems?.length > 0 && (
                          <p className="text-[10px] text-slate-400 italic">Total: {formatCurrency(req.totalAmount || req.amount || 0)}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          req.status === 'Approved' ? "bg-emerald-50 text-emerald-600" :
                          req.status === 'Paid' ? "bg-slate-100 text-slate-600" :
                          req.status === 'Rejected' ? "bg-rose-50 text-rose-600" :
                          "bg-blue-50 text-blue-600"
                        )}>
                          {req.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => navigate(`/requisitions?view=${req.id}`)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
  }

  const projectData = projects.map(p => {
    const cost = requisitions
      .filter(r => (r.projectId === p.id || r.lineItems?.some(li => li.projectId === p.id)) && r.status === 'Approved')
      .reduce((acc, r) => {
        if (r.lineItems?.length > 0) {
          return acc + r.lineItems.filter(li => li.projectId === p.id).reduce((sum, li) => sum + li.amount, 0);
        }
        return acc + (r.amount || 0);
      }, 0);
    return { name: p.name, cost };
  }).filter(p => p.cost > 0);

  const departmentData = departments.map(dept => {
    const deptProjects = projects.filter(p => p.departmentIds.includes(dept.id));
    const budget = deptProjects.reduce((sum, p) => sum + (p.totalBudget || 0), 0);
    const cost = requisitions
      .filter(r => (r.departmentId === dept.id || r.lineItems?.some(li => li.departmentId === dept.id)) && r.status === 'Approved')
      .reduce((acc, r) => {
        if (r.lineItems?.length > 0) {
          return acc + r.lineItems.filter(li => li.departmentId === dept.id).reduce((sum, li) => sum + li.amount, 0);
        }
        return acc + (r.amount || 0);
      }, 0);
    return { name: dept.name, budget, cost, percentage: budget > 0 ? (cost / budget) * 100 : 0 };
  }).filter(d => d.budget > 0 || d.cost > 0);

  if (loading) return <div className="animate-pulse space-y-8">
    <div className="h-32 bg-slate-200 rounded-3xl w-full" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="h-40 bg-slate-200 rounded-3xl" />
      <div className="h-40 bg-slate-200 rounded-3xl" />
      <div className="h-40 bg-slate-200 rounded-3xl" />
    </div>
  </div>;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Welcome back, {profile?.displayName}</h1>
          <p className="text-slate-500">Here's what's happening with {organisation?.name} today.</p>
        </div>
        <div className="flex items-center gap-3">
          {showInstallBtn && (
            <button 
              onClick={handleInstallClick}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-200"
            >
              <Download size={16} />
              Download App
            </button>
          )}
          <button 
            onClick={handleAnalyse}
            disabled={analysing}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-blue-200"
          >
            {analysing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {analysing ? 'Analysing...' : 'Analyse with AI'}
          </button>
          {profile?.role === 'Super User' && (
            <button 
              onClick={() => setIsClearDataModalOpen(true)}
              className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold hover:bg-rose-100 transition-colors border border-rose-100"
            >
              Clear All Data
            </button>
          )}
          <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
            <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold">
              FY {organisation?.financialYear.startDate.split('-')[0]} - {organisation?.financialYear.endDate.split('-')[0]}
            </div>
          </div>
        </div>
      </header>

      {aiInsights && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl"
        >
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
            <Sparkles size={160} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Brain size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Financial Intelligence Report</h2>
                  <p className="text-slate-400 text-xs uppercase tracking-widest font-bold">Powered by Gemini 3.1 Pro</p>
                </div>
              </div>
              <button 
                onClick={() => setAiInsights(null)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="prose prose-invert prose-blue max-w-none">
              <Markdown>{aiInsights}</Markdown>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard 
          title="Submitted (YTD)" 
          amount={stats.submitted.amount} 
          icon={FileText} 
          color="indigo" 
          description={`${stats.submitted.count} total requisitions`}
          onClick={() => setDrillDown({ type: 'Submitted' })}
        />
        <StatCard 
          title="Pending Approval" 
          amount={stats.pending.amount} 
          icon={Clock} 
          color="blue" 
          description={`${stats.pending.count} awaiting approval`}
          onClick={() => setDrillDown({ type: 'Pending' })}
        />
        <StatCard 
          title="Total Approved" 
          amount={stats.approved.amount} 
          icon={CheckCircle2} 
          color="emerald" 
          description={`${stats.approved.count} fully approved`}
          onClick={() => setDrillDown({ type: 'Approved' })}
        />
        <StatCard 
          title="Total Paid" 
          amount={stats.paid.amount} 
          icon={CheckCircle2} 
          color="slate" 
          description={`${stats.paid.count} marked as paid`}
          onClick={() => setDrillDown({ type: 'Paid' })}
        />
        <StatCard 
          title="Total Rejected" 
          amount={stats.rejected.amount} 
          icon={AlertCircle} 
          color="rose" 
          description={`${stats.rejected.count} rejected`}
          onClick={() => setDrillDown({ type: 'Rejected' })}
        />
        <StatCard 
          title="VAT Report" 
          amount={stats.vat.amount} 
          icon={TrendingUp} 
          color="indigo" 
          description="View detailed VAT report"
          onClick={() => navigate('/vat-report')}
        />
        <StatCard 
          title="Payroll Due" 
          amount={stats.payrollDue.amount} 
          icon={Banknote} 
          color="amber" 
          description={`${stats.payrollDue.count} approved payroll runs`}
          onClick={() => navigate('/payroll')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {exceptionReqs.length > 0 && (
            <div className="bg-rose-50 border border-rose-100 rounded-3xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-white text-rose-600 rounded-xl flex items-center justify-center shadow-sm">
                  <Zap size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Exception Payments</h2>
                  <p className="text-xs text-slate-500">Urgent payments outside normal cycles</p>
                </div>
              </div>
              <div className="space-y-3">
                {exceptionReqs.map(req => (
                  <div key={req.id} className="bg-white p-4 rounded-2xl flex items-center justify-between shadow-sm border border-rose-100/50">
                    <div>
                      <p className="font-bold text-slate-900">{req.invoiceNumber}</p>
                      <p className="text-xs text-slate-500">Due: {formatDate(req.paymentDate)}</p>
                    </div>
                    <p className="font-bold text-rose-600">{formatCurrency(req.totalAmount || req.amount || 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-slate-900">Upcoming Payments (Next Cycle)</h2>
              <Calendar className="text-slate-400" size={20} />
            </div>
            <div className="space-y-4">
              {upcomingReqs.map(item => (
                <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                      <Users size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.count} requisition{item.count !== 1 ? 's' : ''} • Due: {formatDate(item.paymentDate)}</p>
                    </div>
                  </div>
                  <p className="font-bold text-slate-900">{formatCurrency(item.amount)}</p>
                </div>
              ))}
              {upcomingReqs.length === 0 && (
                <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl">
                  <p>No payments scheduled for the next cycle</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div 
            onClick={() => navigate('/reports/project-expenditure')}
            className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">Department Budget Usage</h2>
              <Building2 className="text-slate-400 group-hover:text-blue-600 transition-colors" size={20} />
            </div>
            <div className="h-[300px] w-full relative">
              {departmentData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={departmentData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => `R${v/1000}k`} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} width={80} />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(v: number, name: string) => [formatCurrency(v), name === 'cost' ? 'Spent' : 'Budget']}
                    />
                    <Bar dataKey="budget" fill="#e2e8f0" radius={[0, 4, 4, 0]} barSize={20} />
                    <Bar dataKey="cost" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <TrendingUp size={48} className="mb-4 opacity-20" />
                  <p>No budget data available yet</p>
                </div>
              )}
            </div>
          </div>

          <div 
            onClick={() => navigate('/reports/project-expenditure')}
            className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-slate-900 group-hover:text-amber-600 transition-colors">Project Expenditure</h2>
              <Briefcase className="text-slate-400 group-hover:text-amber-600 transition-colors" size={20} />
            </div>
            <div className="h-[300px] w-full relative">
              {projectData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => `R${v/1000}k`} />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(v: number) => [formatCurrency(v), 'Expenditure']}
                    />
                    <Bar dataKey="cost" radius={[6, 6, 0, 0]}>
                      {projectData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6'][index % 5]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <TrendingUp size={48} className="mb-4 opacity-20" />
                  <p>No project data available yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isClearDataModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 text-rose-600">Destructive Action</h2>
              <button onClick={() => setIsClearDataModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <p className="text-slate-600">
                This will permanently delete ALL data for your organisation (requisitions, projects, contacts, etc.). 
                This action cannot be undone.
              </p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Type DELETE to confirm</label>
                <input 
                  type="text" 
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500"
                  value={clearDataConfirmText}
                  onChange={e => setClearDataConfirmText(e.target.value)}
                  placeholder="DELETE"
                />
              </div>
              <button
                onClick={handleClearTestData}
                disabled={clearDataConfirmText !== 'DELETE'}
                className="w-full bg-rose-600 text-white p-4 rounded-2xl font-bold hover:bg-rose-700 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Clear All Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, amount, icon: Icon, color, description, onClick }: any) {
  const colors: any = {
    blue: "bg-blue-600 shadow-blue-200",
    emerald: "bg-emerald-600 shadow-emerald-200",
    rose: "bg-rose-600 shadow-rose-200",
    indigo: "bg-indigo-600 shadow-indigo-200",
    slate: "bg-slate-600 shadow-slate-200",
    amber: "bg-amber-600 shadow-amber-200",
  };

  return (
    <button 
      onClick={onClick}
      className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group text-left w-full transition-all hover:shadow-md active:scale-[0.98]"
    >
      <div className={cn("absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-5 transition-transform group-hover:scale-110", colors[color])} />
      <div className="flex items-center gap-4 mb-6">
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg", colors[color])}>
          <Icon size={24} />
        </div>
        <h3 className="font-semibold text-slate-500">{title}</h3>
      </div>
      <div className="space-y-1">
        <p className="text-3xl font-bold text-slate-900">{formatCurrency(amount)}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
    </button>
  );
}

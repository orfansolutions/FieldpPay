import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { Project, Requisition, Department, ChartOfAccount } from '../types';
import { 
  Briefcase, 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Target,
  ChevronRight,
  ChevronDown,
  Building2,
  FileText,
  Calendar,
  Sparkles,
  Brain,
  Download,
  FileSpreadsheet,
  FileDown
} from 'lucide-react';
import { cn, formatCurrency, formatDate, handleFirestoreError, OperationType } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { analyseProjectExpenditure } from '../services/geminiService';
import Markdown from 'react-markdown';
import { motion } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PDFPreview from './PDFPreview';

export default function ProjectExpenseReport() {
  const { organisation, isDemo } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<string[]>([]);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ isOpen: boolean, title: string, blobUrl: string | null, filename: string }>({
    isOpen: false,
    title: '',
    blobUrl: null,
    filename: ''
  });

  useEffect(() => {
    // Safety timeout to prevent infinite loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 5000);

    if (isDemo) {
      import('../lib/demoData').then(demo => {
        setProjects(demo.DEMO_PROJECTS);
        setRequisitions(demo.DEMO_REQUISITIONS.filter(r => r.status === 'Approved'));
        setDepartments(demo.DEMO_DEPARTMENTS);
        setChartOfAccounts(demo.DEMO_CHART_OF_ACCOUNTS);
        setLoading(false);
      });
      return;
    }

    if (!organisation || !auth.currentUser) return;

    const unsubProj = onSnapshot(query(collection(db, 'projects'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.GET, 'projects');
    });

    const unsubReq = onSnapshot(query(collection(db, 'requisitions'), where('organisationId', '==', organisation.id), where('status', '==', 'Approved')), (snapshot) => {
      setRequisitions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Requisition)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'requisitions');
    });

    const unsubDept = onSnapshot(query(collection(db, 'departments'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setDepartments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'departments');
    });

    const unsubCC = onSnapshot(query(collection(db, 'chartOfAccounts'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setChartOfAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChartOfAccount)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'chartOfAccounts');
    });

    return () => {
      unsubProj();
      unsubReq();
      unsubDept();
      unsubCC();
      clearTimeout(timer);
    };
  }, [organisation, isDemo]);

  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => 
      prev.includes(phaseId) ? prev.filter(id => id !== phaseId) : [...prev, phaseId]
    );
  };

  const getProjectActual = (projectId: string) => {
    return requisitions.reduce((acc, r) => {
      const projectAmount = r.lineItems?.filter(li => li.projectId === projectId).reduce((sum, li) => sum + li.amount, 0) || 0;
      const legacyAmount = r.projectId === projectId ? (r.amount || 0) : 0;
      return acc + (projectAmount || legacyAmount);
    }, 0);
  };

  const getPhaseActual = (projectId: string, phaseName: string) => {
    return requisitions.reduce((acc, r) => {
      const phaseAmount = r.lineItems?.filter(li => li.projectId === projectId && li.phase === phaseName).reduce((sum, li) => sum + li.amount, 0) || 0;
      const legacyAmount = (r.projectId === projectId && r.phase === phaseName) ? (r.amount || 0) : 0;
      return acc + (phaseAmount || legacyAmount);
    }, 0);
  };

  const getSubPhaseActual = (projectId: string, phaseName: string, subPhaseName: string) => {
    return requisitions.reduce((acc, r) => {
      const subPhaseAmount = r.lineItems?.filter(li => li.projectId === projectId && li.phase === phaseName && li.subPhase === subPhaseName).reduce((sum, li) => sum + li.amount, 0) || 0;
      const legacyAmount = (r.projectId === projectId && r.phase === phaseName && r.subPhase === subPhaseName) ? (r.amount || 0) : 0;
      return acc + (subPhaseAmount || legacyAmount);
    }, 0);
  };

  const getSubPhaseCCActual = (projectId: string, phaseName: string, subPhaseName: string, ccId: string) => {
    return requisitions.reduce((acc, r) => {
      const ccAmount = r.lineItems?.filter(li => 
        li.projectId === projectId && 
        li.phase === phaseName && 
        li.subPhase === subPhaseName && 
        li.chartOfAccountId === ccId
      ).reduce((sum, li) => sum + li.amount, 0) || 0;
      const legacyAmount = (r.projectId === projectId && r.phase === phaseName && r.subPhase === subPhaseName && r.chartOfAccountId === ccId) ? (r.amount || 0) : 0;
      return acc + (ccAmount || legacyAmount);
    }, 0);
  };

  const chartData = projects.map(p => ({
    name: p.name,
    Budget: p.totalBudget || 0,
    Actual: getProjectActual(p.id)
  }));

  const handleAnalyse = async () => {
    setAnalysing(true);
    try {
      const insights = await analyseProjectExpenditure(chartData);
      setAiInsights(insights);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalysing(false);
    }
  };

  const handleExportCSV = () => {
    if (!selectedProject) return;
    
    let csv = "Phase,Sub-Phase,Chart of Account,Budget,Actual,Variance,Utilization %\n";
    
    selectedProject.phases?.forEach(phase => {
      const phaseActual = getPhaseActual(selectedProject.id, phase.name);
      csv += `"${phase.name}",,"",${phase.budget},${phaseActual},${phase.budget - phaseActual},${((phaseActual / (phase.budget || 1)) * 100).toFixed(2)}%\n`;
      
      phase.subPhases?.forEach(sub => {
        const subActual = getSubPhaseActual(selectedProject.id, phase.name, sub.name);
        csv += `,"${sub.name}","",${sub.budget},${subActual},${sub.budget - subActual},${((subActual / (sub.budget || 1)) * 100).toFixed(2)}%\n`;
        
        sub.chartOfAccountBudgets?.forEach(ccBudget => {
          const cc = chartOfAccounts.find(c => c.id === ccBudget.chartOfAccountId);
          const ccActual = getSubPhaseCCActual(selectedProject.id, phase.name, sub.name, ccBudget.chartOfAccountId);
          csv += `,,${cc?.name || 'Unknown'},${ccBudget.amount},${ccActual},${ccBudget.amount - ccActual},${((ccActual / (ccBudget.amount || 1)) * 100).toFixed(2)}%\n`;
        });
      });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedProject.name}_Expense_Report.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (!selectedProject) return;

    const doc = new jsPDF();
    const margin = 20;
    let y = margin;

    // Title
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('Project Expense Report', margin, y);
    y += 10;

    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Project: ${selectedProject.name}`, margin, y);
    y += 7;
    doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, y);
    y += 15;

    // Summary Table
    const totalActual = getProjectActual(selectedProject.id);
    const totalBudget = selectedProject.totalBudget || 0;
    
    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Amount']],
      body: [
        ['Total Budget', formatCurrency(totalBudget)],
        ['Total Actual', formatCurrency(totalActual)],
        ['Variance', formatCurrency(totalBudget - totalActual)],
        ['Utilization', `${((totalActual / (totalBudget || 1)) * 100).toFixed(1)}%`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });

    y = (doc as any).lastAutoTable.finalY + 20;

    // Detailed Breakdown
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('Detailed Breakdown', margin, y);
    y += 10;

    const tableData: any[] = [];
    selectedProject.phases?.forEach(phase => {
      const phaseActual = getPhaseActual(selectedProject.id, phase.name);
      tableData.push([
        { content: phase.name, styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: '', styles: { fillColor: [248, 250, 252] } },
        { content: formatCurrency(phase.budget), styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: formatCurrency(phaseActual), styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: `${((phaseActual / (phase.budget || 1)) * 100).toFixed(1)}%`, styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } }
      ]);

      phase.subPhases?.forEach(sub => {
        const subActual = getSubPhaseActual(selectedProject.id, phase.name, sub.name);
        tableData.push([
          `  ${sub.name}`,
          '',
          formatCurrency(sub.budget),
          formatCurrency(subActual),
          `${((subActual / (sub.budget || 1)) * 100).toFixed(1)}%`
        ]);

        sub.chartOfAccountBudgets?.forEach(ccBudget => {
          const cc = chartOfAccounts.find(c => c.id === ccBudget.chartOfAccountId);
          const ccActual = getSubPhaseCCActual(selectedProject.id, phase.name, sub.name, ccBudget.chartOfAccountId);
          tableData.push([
            '',
            `    ${cc?.name || 'Unknown'}`,
            formatCurrency(ccBudget.amount),
            formatCurrency(ccActual),
            `${((ccActual / (ccBudget.amount || 1)) * 100).toFixed(1)}%`
          ]);
        });
      });
    });

    autoTable(doc, {
      startY: y,
      head: [['Phase / Sub-Phase', 'Chart of Account', 'Budget', 'Actual', 'Util %']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [71, 85, 105] },
      styles: { fontSize: 9 }
    });

    const blobUrl = doc.output('bloburl') as unknown as string;
    setPdfPreview({
      isOpen: true,
      title: 'Project Expense Report',
      blobUrl,
      filename: `${selectedProject.name}_Expense_Report.pdf`
    });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {selectedProject && (
            <button 
              onClick={() => setSelectedProject(null)}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
          )}
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Project Expense Report</h1>
            <p className="text-slate-500">Live Actual vs Budget comparison across all projects.</p>
          </div>
        </div>
      </header>

      {!selectedProject ? (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">Budget vs Actual Overview</h3>
              <button 
                onClick={handleAnalyse}
                disabled={analysing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all disabled:opacity-50"
              >
                {analysing ? <Loader2 className="animate-spin" /> : <Sparkles size={16} />}
                {analysing ? 'Analysing...' : 'Analyse with AI'}
              </button>
            </div>

            {aiInsights && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 p-6 bg-slate-900 text-white rounded-3xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Sparkles size={80} />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4 text-blue-400 font-bold text-sm uppercase tracking-widest">
                    <Brain size={16} /> AI Analysis
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <Markdown>{aiInsights}</Markdown>
                  </div>
                  <button 
                    onClick={() => setAiInsights(null)}
                    className="mt-4 text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            )}

            <div className="h-[320px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => `R${value/1000}k`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" />
                  <Bar dataKey="Budget" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} />
                  <Bar dataKey="Actual" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map(project => {
              const actual = getProjectActual(project.id);
              const budget = project.totalBudget || 0;
              const variance = budget - actual;
              const percentUsed = budget > 0 ? (actual / budget) * 100 : 0;

              return (
                <div 
                  key={project.id}
                  onClick={() => setSelectedProject(project)}
                  className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                        <Briefcase size={24} />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{project.name}</h3>
                        <p className="text-xs text-slate-500">{project.status}</p>
                      </div>
                    </div>
                    <ChevronRight className="text-slate-300 group-hover:text-blue-600 transition-all group-hover:translate-x-1" />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Budget Utilization</span>
                      <span className={cn(
                        "font-bold",
                        percentUsed > 100 ? "text-rose-600" : percentUsed > 90 ? "text-amber-600" : "text-emerald-600"
                      )}>
                        {percentUsed.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full transition-all duration-500",
                          percentUsed > 100 ? "bg-rose-500" : percentUsed > 90 ? "bg-amber-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${Math.min(percentUsed, 100)}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400">Budget</p>
                        <p className="text-sm font-bold text-slate-900">{formatCurrency(budget)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400">Actual</p>
                        <p className="text-sm font-bold text-slate-900">{formatCurrency(actual)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white">
                  <Briefcase size={32} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedProject.name}</h2>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-sm text-slate-500 flex items-center gap-1">
                      <Calendar size={14} /> {formatDate(selectedProject.startDate)} - {selectedProject.endDate ? formatDate(selectedProject.endDate) : 'Ongoing'}
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      selectedProject.status === 'Open' ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                    )}>
                      {selectedProject.status}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all shadow-sm"
                >
                  <FileDown size={16} className="text-rose-600" />
                  PDF
                </button>
                <button 
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all shadow-sm"
                >
                  <FileSpreadsheet size={16} className="text-emerald-600" />
                  Excel (CSV)
                </button>
                <div className="px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Total Budget</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(selectedProject.totalBudget || 0)}</p>
                </div>
                <div className="px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Total Actual</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(getProjectActual(selectedProject.id))}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Target size={20} className="text-blue-600" />
                Phase Breakdown (Chart of Accounts)
              </h3>
              
              <div className="space-y-3">
                {selectedProject.phases?.map(phase => {
                  const phaseActual = getPhaseActual(selectedProject.id, phase.name);
                  const isExpanded = expandedPhases.includes(phase.id);
                  const percentUsed = phase.budget > 0 ? (phaseActual / phase.budget) * 100 : 0;

                  return (
                    <div key={phase.id} className="border border-slate-100 rounded-2xl overflow-hidden">
                      <div 
                        onClick={() => togglePhase(phase.id)}
                        className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-slate-900">{phase.name}</span>
                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <p className="text-[10px] uppercase font-bold text-slate-400">Budget</p>
                                  <p className="text-sm font-bold text-slate-700">{formatCurrency(phase.budget)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] uppercase font-bold text-slate-400">Actual</p>
                                  <p className="text-sm font-bold text-slate-700">{formatCurrency(phaseActual)}</p>
                                </div>
                              </div>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full transition-all duration-500",
                                  percentUsed > 100 ? "bg-rose-500" : percentUsed > 90 ? "bg-amber-500" : "bg-blue-500"
                                )}
                                style={{ width: `${Math.min(percentUsed, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {isExpanded && phase.subPhases && phase.subPhases.length > 0 && (
                        <div className="bg-slate-50/50 p-4 pl-14 space-y-4 border-t border-slate-100">
                          {phase.subPhases.map((sub, idx) => {
                            const subActual = getSubPhaseActual(selectedProject.id, phase.name, sub.name);
                            const subPercent = sub.budget > 0 ? (subActual / sub.budget) * 100 : 0;

                            return (
                              <div key={idx} className="space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-bold text-slate-700">{sub.name}</span>
                                      <span className="text-slate-500 font-medium">
                                        {formatCurrency(subActual)} / {formatCurrency(sub.budget)}
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                      <div 
                                        className={cn(
                                          "h-full transition-all duration-500",
                                          subPercent > 100 ? "bg-rose-400" : "bg-slate-400"
                                        )}
                                        style={{ width: `${Math.min(subPercent, 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {sub.chartOfAccountBudgets && sub.chartOfAccountBudgets.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-4">
                                    {sub.chartOfAccountBudgets.map((ccBudget, ccIdx) => {
                                      const cc = chartOfAccounts.find(c => c.id === ccBudget.chartOfAccountId);
                                      const ccActual = getSubPhaseCCActual(selectedProject.id, phase.name, sub.name, ccBudget.chartOfAccountId);
                                      const ccPercent = ccBudget.amount > 0 ? (ccActual / ccBudget.amount) * 100 : 0;

                                      return (
                                        <div key={ccIdx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase truncate max-w-[120px]">
                                              {cc?.name || 'Unknown Account'}
                                            </span>
                                            <span className={cn(
                                              "text-[10px] font-bold",
                                              ccPercent > 100 ? "text-rose-600" : "text-slate-600"
                                            )}>
                                              {ccPercent.toFixed(0)}%
                                            </span>
                                          </div>
                                          <div className="flex items-center justify-between text-[11px] mb-1.5">
                                            <span className="text-slate-400">Act: {formatCurrency(ccActual)}</span>
                                            <span className="text-slate-400">Bud: {formatCurrency(ccBudget.amount)}</span>
                                          </div>
                                          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div 
                                              className={cn(
                                                "h-full",
                                                ccPercent > 100 ? "bg-rose-400" : "bg-blue-400"
                                              )}
                                              style={{ width: `${Math.min(ccPercent, 100)}%` }}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      <PDFPreview 
        isOpen={pdfPreview.isOpen}
        onClose={() => setPdfPreview(prev => ({ ...prev, isOpen: false }))}
        title={pdfPreview.title}
        blobUrl={pdfPreview.blobUrl}
        filename={pdfPreview.filename}
      />
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return <div className={cn("w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin", className)} />;
}

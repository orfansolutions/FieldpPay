import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { RecurringCost, Department, ChartOfAccount, Project } from '../types';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  X, 
  Loader2, 
  Repeat, 
  Building2, 
  Target,
  Calendar,
  Banknote,
  Briefcase,
  Sparkles
} from 'lucide-react';
import { cn, formatCurrency, formatDate, handleFirestoreError, OperationType } from '../lib/utils';
import { GoogleGenAI } from "@google/genai";
import ConfirmationModal from './ConfirmationModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PDFPreview from './PDFPreview';
import { Download, FileText, Printer } from 'lucide-react';

export default function RecurringCosts() {
  const { organisation, profile, isDemo } = useAuth();
  const [costs, setCosts] = useState<RecurringCost[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<RecurringCost | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ isOpen: boolean, title: string, blobUrl: string | null, filename: string }>({
    isOpen: false,
    title: '',
    blobUrl: null,
    filename: ''
  });

  // Confirmation modal states
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'danger'
  });

  const handleGenerateDescription = async () => {
    if (!formData.name) return;
    setIsGenerating(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.APP_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key is missing.');
      }
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3-flash-preview";
      const prompt = `Generate a professional business description for a recurring cost named "${formData.name}". Keep it concise (max 2 sentences).`;
      
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
      });
      
      if (response.text) {
        setFormData(prev => ({ ...prev, description: response.text.trim() }));
      }
    } catch (err) {
      console.error("Gemini Error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    amount: 0,
    frequency: 'Monthly' as RecurringCost['frequency'],
    departmentIds: [] as string[],
    chartOfAccountIds: [] as string[],
    projectIds: [] as string[],
    startDate: new Date().toISOString().split('T')[0],
    status: 'Active' as RecurringCost['status'],
    vatType: 'No VAT' as 'Inclusive' | 'Exclusive' | 'No VAT',
  });

  useEffect(() => {
    if (isDemo) {
      import('../lib/demoData').then(demo => {
        setCosts(demo.DEMO_RECURRING_COSTS);
        setDepartments(demo.DEMO_DEPARTMENTS);
        setChartOfAccounts(demo.DEMO_CHART_OF_ACCOUNTS);
        setProjects(demo.DEMO_PROJECTS);
        setLoading(false);
      });
      return;
    }

    if (!organisation || !auth.currentUser) return;

    const unsubCosts = onSnapshot(query(collection(db, 'recurringCosts'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setCosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecurringCost)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'recurringCosts'));

    const unsubDept = onSnapshot(query(collection(db, 'departments'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setDepartments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'departments'));

    const unsubCC = onSnapshot(query(collection(db, 'chartOfAccounts'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setChartOfAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChartOfAccount)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'chartOfAccounts'));

    const unsubProj = onSnapshot(query(collection(db, 'projects'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'projects'));

    return () => {
      unsubCosts();
      unsubDept();
      unsubCC();
      unsubProj();
    };
  }, [organisation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      const newCost = {
        ...formData,
        id: editingCost?.id || Math.random().toString(36).substr(2, 9),
        organisationId: 'demo-org'
      } as RecurringCost;
      
      if (editingCost) {
        setCosts(prev => prev.map(c => c.id === editingCost.id ? newCost : c));
      } else {
        setCosts(prev => [...prev, newCost]);
      }
      
      setIsModalOpen(false);
      setEditingCost(null);
      resetForm();
      return;
    }
    if (!organisation) return;
    setSubmitting(true);

    try {
      const costData = {
        ...formData,
        organisationId: organisation.id,
      };

      if (editingCost) {
        await updateDoc(doc(db, 'recurringCosts', editingCost.id), costData);
      } else {
        await addDoc(collection(db, 'recurringCosts'), costData);
      }
      
      setIsModalOpen(false);
      setEditingCost(null);
      resetForm();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`${organisation?.name || 'Organisation'} - Recurring Costs Report`, 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    const tableData = costs.map(c => [
      c.name,
      c.description,
      formatCurrency(c.amount),
      c.frequency,
      c.status,
      formatDate(c.startDate)
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Name', 'Description', 'Amount', 'Frequency', 'Status', 'Start Date']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] },
    });

    const blobUrl = doc.output('bloburl') as unknown as string;
    setPdfPreview({
      isOpen: true,
      title: 'Recurring Costs Report',
      blobUrl,
      filename: `recurring_costs_${new Date().toISOString().split('T')[0]}.pdf`
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      amount: 0,
      frequency: 'Monthly',
      departmentIds: [],
      chartOfAccountIds: [],
      projectIds: [],
      startDate: new Date().toISOString().split('T')[0],
      status: 'Active',
      vatType: 'No VAT',
    });
  };

  const handleAddNew = async (type: 'department' | 'chartOfAccount' | 'project') => {
    if (!organisation) return;
    const name = prompt(`Enter new ${type === 'chartOfAccount' ? 'account' : type} name:`);
    if (!name) return;

    try {
      const coll = type === 'department' ? 'departments' : type === 'chartOfAccount' ? 'chartOfAccounts' : 'projects';
      const data: any = { name, organisationId: organisation.id };
      if (type === 'chartOfAccount') {
        data.status = 'Active';
      }
      if (type === 'project') {
        data.startDate = new Date().toISOString().split('T')[0];
        data.endDate = new Date().toISOString().split('T')[0];
        data.status = 'Open';
        data.totalBudget = 0;
        data.departmentIds = [];
      }
      const docRef = await addDoc(collection(db, coll), data);
      
      if (type === 'department') setFormData({ ...formData, departmentIds: [...formData.departmentIds, docRef.id] });
      else if (type === 'chartOfAccount') setFormData({ ...formData, chartOfAccountIds: [...formData.chartOfAccountIds, docRef.id] });
      else if (type === 'project') setFormData({ ...formData, projectIds: [...formData.projectIds, docRef.id] });
    } catch (err) {
      console.error(`Error adding ${type}:`, err);
    }
  };

  const isFinanceOrAbove = profile?.role === 'Super User' || profile?.role === 'CEO/CFO' || profile?.role === 'Financial Manager';

  if (!isFinanceOrAbove) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <Repeat size={48} className="mx-auto text-slate-300 mb-4" />
          <h2 className="text-xl font-bold text-slate-900">Access Denied</h2>
          <p className="text-slate-500">Only Financial Managers and Super Users can manage recurring costs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Recurring Costs</h1>
          <p className="text-slate-500">Manage fixed overheads and recurring expenses.</p>
        </div>
        <div className="flex items-center gap-3 no-print">
          <div className="flex bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
            <button 
              onClick={handlePrint}
              className="p-2.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
              title="Print View"
            >
              <Printer size={20} />
            </button>
            <button 
              onClick={handleExportPDF}
              className="p-2.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
              title="Export PDF"
            >
              <FileText size={20} />
            </button>
          </div>
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            <Plus size={20} />
            Add Recurring Cost
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {costs.map((cost) => (
          <div key={cost.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <Repeat size={24} />
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => {
                    setEditingCost(cost);
                    setFormData({
                      name: cost.name,
                      description: cost.description,
                      amount: cost.amount,
                      frequency: cost.frequency,
                      departmentIds: cost.departmentIds,
                      chartOfAccountIds: cost.chartOfAccountIds,
                      projectIds: cost.projectIds || [],
                      startDate: cost.startDate,
                      status: cost.status,
                      vatType: cost.vatType || 'No VAT',
                    });
                    setIsModalOpen(true);
                  }}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: 'Delete Recurring Cost',
                      message: `Are you sure you want to delete "${cost.name}"?`,
                      variant: 'danger',
                      onConfirm: async () => {
                        if (isDemo) {
                          setCosts(prev => prev.filter(c => c.id !== cost.id));
                        } else {
                          await deleteDoc(doc(db, 'recurringCosts', cost.id));
                        }
                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                      }
                    });
                  }}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{cost.name}</h3>
                <p className="text-sm text-slate-500 line-clamp-1">{cost.description}</p>
              </div>

              <div className="flex items-center justify-between py-3 border-y border-slate-50">
                <div className="flex flex-col">
                  <div className="text-sm font-bold text-blue-600">{formatCurrency(cost.amount)}</div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    {cost.vatType === 'Inclusive' ? 'Incl. VAT' : cost.vatType === 'Exclusive' ? 'Excl. VAT' : 'No VAT'}
                  </div>
                </div>
                <div className="px-2 py-1 bg-slate-100 rounded text-[10px] font-bold uppercase text-slate-500">{cost.frequency}</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Building2 size={14} />
                  <span>{cost.departmentIds.length} Departments</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Target size={14} />
                  <span>{cost.chartOfAccountIds.length} Chart of Accounts</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Briefcase size={14} />
                  <span>{(cost.projectIds || []).length} Projects</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className={cn(
                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  cost.status === 'Active' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-500"
                )}>
                  {cost.status}
                </span>
                <span className="text-[10px] text-slate-400">Starts: {formatDate(cost.startDate)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">{editingCost ? 'Edit' : 'Add'} Recurring Cost</h2>
              <button onClick={() => { setIsModalOpen(false); setEditingCost(null); }} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Cost Name</label>
                  <input
                    required
                    type="text"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="e.g. Office Rent"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Amount</label>
                  <div className="relative">
                    <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      required
                      type="number"
                      className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.amount}
                      onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">Description</label>
                  <button
                    type="button"
                    onClick={handleGenerateDescription}
                    disabled={isGenerating || !formData.name}
                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                  >
                    {isGenerating ? <Loader2 className="animate-spin" size={10} /> : <Sparkles size={10} />}
                    {isGenerating ? 'Generating...' : 'AI Generate'}
                  </button>
                </div>
                <textarea
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-20"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Frequency</label>
                  <select
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.frequency}
                    onChange={e => setFormData({ ...formData, frequency: e.target.value as any })}
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Yearly">Yearly</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">VAT Type</label>
                  <select
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.vatType}
                    onChange={e => setFormData({ ...formData, vatType: e.target.value as any })}
                  >
                    <option value="Inclusive">Inclusive</option>
                    <option value="Exclusive">Exclusive</option>
                    <option value="No VAT">No VAT</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Start Date</label>
                  <input
                    required
                    type="date"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.startDate}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Status</label>
                  <select
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">Assign to Departments</label>
                  <button type="button" onClick={() => handleAddNew('department')} className="text-blue-600 hover:text-blue-700 text-xs font-bold flex items-center gap-1">
                    <Plus size={12} /> New
                  </button>
                </div>
                <div className="relative group">
                  <button 
                    type="button"
                    className="w-full min-h-[44px] p-2 bg-white border border-slate-200 rounded-xl flex flex-wrap gap-2 text-left outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {formData.departmentIds.length === 0 && <span className="text-slate-400 text-sm p-1">Select Departments...</span>}
                    {formData.departmentIds.map(id => (
                      <span key={id} className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                        {departments.find(d => d.id === id)?.name}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setFormData({ ...formData, departmentIds: formData.departmentIds.filter(dId => dId !== id) }); }}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </button>
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 hidden group-focus-within:block max-h-48 overflow-y-auto">
                    {departments.filter(d => d.name !== 'General').map(dept => (
                      <button
                        key={dept.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (!formData.departmentIds.includes(dept.id)) {
                            setFormData({ ...formData, departmentIds: [...formData.departmentIds, dept.id] });
                          }
                        }}
                        className="w-full text-left p-3 hover:bg-slate-50 text-sm font-medium text-slate-700 border-b border-slate-50 last:border-0"
                      >
                        {dept.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">Assign to Chart of Accounts</label>
                  <button type="button" onClick={() => handleAddNew('chartOfAccount')} className="text-blue-600 hover:text-blue-700 text-xs font-bold flex items-center gap-1">
                    <Plus size={12} /> New
                  </button>
                </div>
                <div className="relative group">
                  <button 
                    type="button"
                    className="w-full min-h-[44px] p-2 bg-white border border-slate-200 rounded-xl flex flex-wrap gap-2 text-left outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {formData.chartOfAccountIds.length === 0 && <span className="text-slate-400 text-sm p-1">Select Accounts...</span>}
                    {formData.chartOfAccountIds.map(id => (
                      <span key={id} className="bg-amber-100 text-amber-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                        {chartOfAccounts.find(cc => cc.id === id)?.name}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setFormData({ ...formData, chartOfAccountIds: formData.chartOfAccountIds.filter(ccId => ccId !== id) }); }}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </button>
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 hidden group-focus-within:block max-h-48 overflow-y-auto">
                    {chartOfAccounts.filter(cc => cc.status !== 'Archived').map(cc => (
                      <button
                        key={cc.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (!formData.chartOfAccountIds.includes(cc.id)) {
                            setFormData({ ...formData, chartOfAccountIds: [...formData.chartOfAccountIds, cc.id] });
                          }
                        }}
                        className="w-full text-left p-3 hover:bg-slate-50 text-sm font-medium text-slate-700 border-b border-slate-50 last:border-0"
                      >
                        {cc.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">Assign to Projects</label>
                  <button type="button" onClick={() => handleAddNew('project')} className="text-blue-600 hover:text-blue-700 text-xs font-bold flex items-center gap-1">
                    <Plus size={12} /> New
                  </button>
                </div>
                <div className="relative group">
                  <button 
                    type="button"
                    className="w-full min-h-[44px] p-2 bg-white border border-slate-200 rounded-xl flex flex-wrap gap-2 text-left outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {formData.projectIds.length === 0 && <span className="text-slate-400 text-sm p-1">Select Projects...</span>}
                    {formData.projectIds.map(id => (
                      <span key={id} className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                        {projects.find(p => p.id === id)?.name}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setFormData({ ...formData, projectIds: formData.projectIds.filter(pId => pId !== id) }); }}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </button>
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 hidden group-focus-within:block max-h-48 overflow-y-auto">
                    {projects.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (!formData.projectIds.includes(p.id)) {
                            setFormData({ ...formData, projectIds: [...formData.projectIds, p.id] });
                          }
                        }}
                        className="w-full text-left p-3 hover:bg-slate-50 text-sm font-medium text-slate-700 border-b border-slate-50 last:border-0"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="animate-spin" /> : editingCost ? 'Update Recurring Cost' : 'Save Recurring Cost'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        loading={submitting}
      />

      <PDFPreview 
        isOpen={pdfPreview.isOpen}
        onClose={() => setPdfPreview({ ...pdfPreview, isOpen: false })}
        title={pdfPreview.title}
        blobUrl={pdfPreview.blobUrl}
        filename={pdfPreview.filename}
      />
    </div>
  );
}

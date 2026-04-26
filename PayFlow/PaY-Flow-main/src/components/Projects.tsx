import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { Project, Department, Contact, ProjectPhase, ChartOfAccount } from '../types';
import { 
  Briefcase, 
  Plus, 
  Calendar, 
  Users, 
  Download,
  CheckCircle2, 
  Clock, 
  MoreVertical,
  X,
  Loader2,
  TrendingUp,
  ArrowRight,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Search,
  Printer,
  FileDown,
  FileSpreadsheet
} from 'lucide-react';
import { cn, formatDate, handleFirestoreError, OperationType, exportToCSV, formatCurrency } from '../lib/utils';
import Fuse from 'fuse.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { analyseProjectBudget } from '../services/geminiService';
import { SearchableSelect } from './SearchableSelect';
import Markdown from 'react-markdown';
import { motion } from 'motion/react';
import { Brain, Sparkles, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PDFPreview from './PDFPreview';

export default function Projects() {
  const { organisation, profile, isDemo, showToast } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [search, setSearch] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<{ projectId: string, content: string } | null>(null);
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const [analysingId, setAnalysingId] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ isOpen: boolean, title: string, blobUrl: string | null, filename: string }>({
    isOpen: false,
    title: '',
    blobUrl: null,
    filename: ''
  });

  const [formData, setFormData] = useState({
    name: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    departmentIds: [] as string[],
    clientId: '',
    status: 'Open' as 'Open' | 'Completed',
    phases: [] as ProjectPhase[],
    totalBudget: 0,
  });

  const [contactFormData, setContactFormData] = useState({
    name: '',
    email: '',
    phone: '',
    category: 'Supplier' as 'Supplier' | 'Employee' | 'Contractor' | 'Other',
  });

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organisation) return;
    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, 'contacts'), {
        name: contactFormData.name,
        email: contactFormData.email,
        contactNumber: contactFormData.phone,
        category: contactFormData.category,
        organisationId: organisation.id,
        attachments: []
      });
      setFormData(prev => ({ ...prev, clientId: docRef.id }));
      setIsContactModalOpen(false);
      setContactFormData({ name: '', email: '', phone: '', category: 'Supplier' });
      showToast('Client added successfully.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'contacts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 5000);

    if (isDemo) {
      import('../lib/demoData').then(demo => {
        setProjects(demo.DEMO_PROJECTS);
        setDepartments(demo.DEMO_DEPARTMENTS);
        setContacts(demo.DEMO_CONTACTS);
        setChartOfAccounts(demo.DEMO_CHART_OF_ACCOUNTS);
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

    const unsubDept = onSnapshot(query(collection(db, 'departments'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setDepartments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'departments'));

    const unsubContacts = onSnapshot(query(collection(db, 'contacts'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'contacts'));

    const unsubCC = onSnapshot(query(collection(db, 'chartOfAccounts'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setChartOfAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChartOfAccount)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'chartOfAccounts'));

    return () => {
      unsubProj();
      unsubDept();
      unsubContacts();
      unsubCC();
      clearTimeout(timer);
    };
  }, [organisation, isDemo]);

  const handleAddChartOfAccount = async (name: string) => {
    if (!organisation) return;
    try {
      const docRef = await addDoc(collection(db, 'chartOfAccounts'), {
        name,
        organisationId: organisation.id,
        status: 'Active'
      });
      showToast(`Account "${name}" added to Chart of Accounts.`, 'success');
      return docRef.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'chartOfAccounts');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast('Actions are disabled in Demo Mode.', 'warning');
      return;
    }
    if (!organisation) return;
    setLoading(true);

    try {
      const totalBudget = formData.phases.reduce((acc, p) => acc + p.budget, 0);
      const projectData = {
        ...formData,
        totalBudget,
        organisationId: organisation.id,
        createdBy: editingProject ? editingProject.createdBy : profile?.uid || '',
      };

      if (editingProject) {
        await updateDoc(doc(db, 'projects', editingProject.id), projectData);
      } else {
        await addDoc(collection(db, 'projects'), projectData);
      }
      
      setIsModalOpen(false);
      setEditingProject(null);
      resetForm();
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, editingProject ? OperationType.UPDATE : OperationType.CREATE, 'projects');
      showToast('Failed to save project. Please check your permissions.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`${organisation?.name || 'Organisation'} - Projects Report`, 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    const tableData = filteredProjects.map(p => [
      p.name,
      contacts.find(c => c.id === p.clientId)?.name || 'N/A',
      formatDate(p.startDate),
      p.endDate ? formatDate(p.endDate) : 'Ongoing',
      p.status,
      formatCurrency(p.totalBudget || 0)
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Project Name', 'Client', 'Start Date', 'End Date', 'Status', 'Budget']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [223, 223, 223], textColor: 20 },
    });

    const blobUrl = doc.output('bloburl') as unknown as string;
    setPdfPreview({
      isOpen: true,
      title: 'Projects Report',
      blobUrl,
      filename: `${organisation?.name || 'Organisation'}_Projects_${new Date().toISOString().split('T')[0]}.pdf`
    });
  };

  const handleExportCSV = () => {
    const data = filteredProjects.map(p => ({
      'Project Name': p.name,
      'Client': contacts.find(c => c.id === p.clientId)?.name || 'N/A',
      'Start Date': p.startDate,
      'End Date': p.endDate || 'Ongoing',
      'Status': p.status,
      'Budget': p.totalBudget || 0,
      'Departments': p.departmentIds.map(id => departments.find(d => d.id === id)?.name).join('; ')
    }));
    exportToCSV(data, `${organisation?.name || 'Organisation'}_Projects.csv`);
  };

  const handleDownloadProjectTemplate = () => {
    const headers = [
      'Project Name',
      'Client Email',
      'Start Date (YYYY-MM-DD)',
      'End Date (YYYY-MM-DD)',
      'Departments (Semicolon separated)',
      'Status (Open/Completed)',
      'Budget'
    ];
    const example = [
      'Infrastructure Upgrade',
      'client@example.com',
      '2024-05-01',
      '2024-12-31',
      'Operations; Finance',
      'Open',
      '500000'
    ];
    const csvContent = [headers.join(','), example.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'projects_template.csv');
    link.click();
  };

  const handleImportProjectsCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (isDemo) {
      showToast("Import is disabled in demo mode.", "warning");
      return;
    }
    if (!file || !organisation) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      const projectsToImport: any[] = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].split(',').map(c => c.trim());
        
        const getVal = (key: string) => {
          const idx = headers.findIndex(h => h.includes(key.toLowerCase()));
          return idx !== -1 ? cols[idx] : '';
        };

        const clientEmail = getVal('client email');
        const clientId = contacts.find(c => c.email?.toLowerCase() === clientEmail.toLowerCase())?.id || '';
        
        const deptNames = getVal('departments').split(';').map(d => d.trim().toLowerCase());
        const deptIds = departments
          .filter(d => deptNames.includes(d.name.toLowerCase()))
          .map(d => d.id);
        
        if (deptIds.length === 0 && departments.length > 0) {
          deptIds.push(departments[0].id);
        }

        projectsToImport.push({
          name: getVal('project name'),
          clientId,
          startDate: getVal('start date') || new Date().toISOString().split('T')[0],
          endDate: getVal('end date'),
          departmentIds: deptIds,
          status: (getVal('status') || 'Open') as 'Open' | 'Completed',
          totalBudget: Number(getVal('budget')) || 0,
          phases: [],
          organisationId: organisation.id,
          createdBy: profile?.uid || '',
          createdAt: new Date().toISOString()
        });
      }

      if (projectsToImport.length === 0) {
        showToast('No valid projects found in CSV', 'error');
        return;
      }

      setLoading(true);
      try {
        const promises = projectsToImport.map(proj => addDoc(collection(db, 'projects'), proj));
        await Promise.all(promises);
        showToast(`Successfully imported ${projectsToImport.length} projects`, 'success');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'projects');
      } finally {
        setLoading(false);
        if (importInputRef.current) importInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAnalyseBudget = async (project: Project) => {
    setAnalysingId(project.id);
    try {
      const analysis = await analyseProjectBudget(project);
      setAiAnalysis({ projectId: project.id, content: analysis });
    } catch (err) {
      console.error(err);
    } finally {
      setAnalysingId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      departmentIds: [],
      clientId: '',
      status: 'Open',
      phases: [],
      totalBudget: 0,
    });
  };

  const addPhase = () => {
    const newPhase: ProjectPhase = {
      id: Math.random().toString(36).substr(2, 9),
      name: '',
      budget: 0,
      subPhases: [],
    };
    const newPhases = [...formData.phases, newPhase];
    setFormData({ 
      ...formData, 
      phases: newPhases,
      totalBudget: newPhases.reduce((acc, p) => acc + p.budget, 0)
    });
  };

  const removePhase = (phaseId: string) => {
    const newPhases = formData.phases.filter(p => p.id !== phaseId);
    setFormData({ 
      ...formData, 
      phases: newPhases,
      totalBudget: newPhases.reduce((acc, p) => acc + p.budget, 0)
    });
  };

  const updatePhase = (phaseId: string, updates: Partial<ProjectPhase>) => {
    const newPhases = formData.phases.map(p => p.id === phaseId ? { ...p, ...updates } : p);
    setFormData({
      ...formData,
      phases: newPhases,
      totalBudget: newPhases.reduce((acc, p) => acc + p.budget, 0)
    });
  };

  const addSubPhase = (phaseId: string) => {
    const newPhases = formData.phases.map(p => {
      if (p.id === phaseId) {
        const newSubPhases = [...p.subPhases, { name: '', budget: 0 }];
        const newBudget = newSubPhases.reduce((acc, sp) => acc + sp.budget, 0);
        return { ...p, subPhases: newSubPhases, budget: newBudget };
      }
      return p;
    });
    setFormData({
      ...formData,
      phases: newPhases,
      totalBudget: newPhases.reduce((acc, p) => acc + p.budget, 0)
    });
  };

  const removeSubPhase = (phaseId: string, index: number) => {
    const newPhases = formData.phases.map(p => {
      if (p.id === phaseId) {
        const newSubPhases = p.subPhases.filter((_, i) => i !== index);
        const newBudget = newSubPhases.reduce((acc, sp) => acc + sp.budget, 0);
        return { ...p, subPhases: newSubPhases, budget: newBudget };
      }
      return p;
    });
    setFormData({
      ...formData,
      phases: newPhases,
      totalBudget: newPhases.reduce((acc, p) => acc + p.budget, 0)
    });
  };

  const updateSubPhase = (phaseId: string, index: number, updates: Partial<{ name: string, budget: number }>) => {
    const newPhases = formData.phases.map(p => {
      if (p.id === phaseId) {
        const newSubPhases = p.subPhases.map((s, i) => {
          if (i === index) {
            const updated = { ...s, ...updates };
            // If budget changed, re-apportion cost centres if they exist
            if (updates.budget !== undefined && updated.chartOfAccountBudgets && updated.chartOfAccountBudgets.length > 0) {
              const amountPerCC = Math.floor((updates.budget / updated.chartOfAccountBudgets.length) * 100) / 100;
              updated.chartOfAccountBudgets = updated.chartOfAccountBudgets.map(ccb => ({ ...ccb, amount: amountPerCC }));
            }
            return updated;
          }
          return s;
        });
        const newBudget = newSubPhases.reduce((acc, sp) => acc + sp.budget, 0);
        return { ...p, subPhases: newSubPhases, budget: newBudget };
      }
      return p;
    });
    setFormData({
      ...formData,
      phases: newPhases,
      totalBudget: newPhases.reduce((acc, p) => acc + p.budget, 0)
    });
  };

  const updateSubPhaseChartOfAccounts = (phaseId: string, subIndex: number, chartOfAccountIds: string[]) => {
    const newPhases = formData.phases.map(p => {
      if (p.id === phaseId) {
        const newSubPhases = p.subPhases.map((s, i) => {
          if (i === subIndex) {
            const budget = s.budget || 0;
            const amountPerCC = chartOfAccountIds.length > 0 ? Math.floor((budget / chartOfAccountIds.length) * 100) / 100 : 0;
            const chartOfAccountBudgets = chartOfAccountIds.map(id => ({
              chartOfAccountId: id,
              amount: amountPerCC
            }));
            return { ...s, chartOfAccountBudgets };
          }
          return s;
        });
        return { ...p, subPhases: newSubPhases };
      }
      return p;
    });
    setFormData({ ...formData, phases: newPhases });
  };

  const updateSubPhaseChartOfAccountAmount = (phaseId: string, subIndex: number, ccId: string, amount: number) => {
    const newPhases = formData.phases.map(p => {
      if (p.id === phaseId) {
        const newSubPhases = p.subPhases.map((s, i) => {
          if (i === subIndex) {
            const newCCBudgets = s.chartOfAccountBudgets?.map(ccb => 
              ccb.chartOfAccountId === ccId ? { ...ccb, amount } : ccb
            );
            return { ...s, chartOfAccountBudgets: newCCBudgets };
          }
          return s;
        });
        return { ...p, subPhases: newSubPhases };
      }
      return p;
    });
    setFormData({ ...formData, phases: newPhases });
  };

  const handleDelete = async () => {
    if (!projectToDelete) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'projects', projectToDelete.id));
      setIsDeleteConfirmOpen(false);
      setProjectToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'projects');
    } finally {
      setLoading(false);
    }
  };
  const openProjects = projects.filter(p => p.status === 'Open');
  const completedProjects = projects.filter(p => p.status === 'Completed');

  const fuse = new Fuse(projects, {
    keys: ['name', 'status', 'phases.name', 'phases.subPhases.name'],
    threshold: 0.3,
  });

  const filteredProjects = search 
    ? fuse.search(search).map(r => r.item)
    : projects;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Projects</h1>
          <p className="text-slate-500">Manage organisational projects and timelines.</p>
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
              onClick={handleExportCSV}
              className="p-2.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
              title="Export CSV"
            >
              <FileSpreadsheet size={20} />
            </button>
            <button 
              onClick={handleExportPDF}
              className="p-2.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
              title="Export PDF"
            >
              <FileDown size={20} />
            </button>
            <button 
              onClick={handleDownloadProjectTemplate}
              className="p-2.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
              title="Download Template"
            >
              <Download size={20} />
            </button>
            <button 
              onClick={() => importInputRef.current?.click()}
              className="p-2.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
              title="Import From CSV"
            >
              <Users size={20} />
            </button>
            <input 
              type="file"
              ref={importInputRef}
              onChange={handleImportProjectsCSV}
              className="hidden"
              accept=".csv"
            />
          </div>
          {['Super User', 'Financial Manager', 'CEO/CFO', 'Manager'].includes(profile?.role || '') && (
            <button 
              onClick={() => { resetForm(); setIsModalOpen(true); }}
              className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <Plus size={20} />
              New Project
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 no-print">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Open Projects</p>
              <p className="text-2xl font-bold text-slate-900">{openProjects.length}</p>
            </div>
          </div>
          <TrendingUp className="text-blue-200" size={32} />
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Completed</p>
              <p className="text-2xl font-bold text-slate-900">{completedProjects.length}</p>
            </div>
          </div>
          <CheckCircle2 className="text-emerald-200" size={32} />
        </div>
      </div>

      <div className="relative no-print">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Fuzzy search projects, phases, or status..."
          className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">
        {filteredProjects.map((project) => (
          <div key={project.id} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-blue-600">
                  <Briefcase size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{project.name}</h3>
                  <p className="text-sm text-slate-500">Client: {contacts.find(c => c.id === project.clientId)?.name || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(profile?.uid === project.createdBy || ['Super User', 'Financial Manager', 'CEO/CFO', 'Manager'].includes(profile?.role || '')) && (
                  <>
                    <button 
                      onClick={() => {
                        setEditingProject(project);
                        setFormData({
                          name: project.name,
                          startDate: project.startDate,
                          endDate: project.endDate || '',
                          departmentIds: project.departmentIds,
                          clientId: project.clientId,
                          status: project.status,
                          phases: project.phases || [],
                          totalBudget: project.totalBudget || 0,
                        });
                        setIsModalOpen(true);
                      }}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => {
                        setProjectToDelete(project);
                        setIsDeleteConfirmOpen(true);
                      }}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  project.status === 'Open' ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                )}>
                  {project.status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Start Date</p>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Calendar size={14} className="text-slate-400" />
                  {formatDate(project.startDate)}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">End Date</p>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Calendar size={14} className="text-slate-400" />
                  {project.endDate ? formatDate(project.endDate) : 'Ongoing'}
                </div>
              </div>
            </div>

            {aiAnalysis?.projectId === project.id && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-8 p-6 bg-blue-50 rounded-2xl border border-blue-100 relative overflow-hidden"
              >
                <div className="flex items-center gap-2 mb-4 text-blue-600 font-bold text-sm uppercase tracking-widest">
                  <Brain size={16} /> Budget Advisor Insights
                </div>
                <div className="prose prose-sm prose-blue max-w-none text-slate-700">
                  <Markdown>{aiAnalysis.content}</Markdown>
                </div>
                <button 
                  onClick={() => setAiAnalysis(null)}
                  className="mt-4 text-xs text-blue-400 hover:text-blue-600 font-bold transition-colors"
                >
                  Dismiss Analysis
                </button>
              </motion.div>
            )}

            {project.phases && project.phases.length > 0 && (
              <div className="mb-8 space-y-2">
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Phases</p>
                <div className="flex flex-wrap gap-2">
                  {project.phases.map(p => (
                    <span key={p.id} className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg text-xs font-medium text-slate-600">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-6 border-t border-slate-50">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/reports/project-expenditure')}
                  className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-2 rounded-xl transition-all"
                >
                  <BarChart3 size={14} />
                  View Expenditure Report
                </button>
              </div>
              <div className="flex -space-x-2">
                {project.departmentIds.map((id, i) => (
                  <div key={id} className={cn(
                    "w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white",
                    ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'][i % 4]
                  )}>
                    {departments.find(d => d.id === id)?.name.charAt(0)}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleAnalyseBudget(project)}
                  disabled={analysingId === project.id}
                  className="text-blue-600 hover:text-blue-700 font-bold text-sm flex items-center gap-1 group/ai disabled:opacity-50"
                >
                  {analysingId === project.id ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-blue-400 group-hover/ai:text-blue-600" />}
                  {analysingId === project.id ? 'Analysing...' : 'Analyse with AI'}
                </button>
                <button className="text-slate-600 hover:text-slate-900 font-bold text-sm flex items-center gap-1 group/btn">
                  View Details
                  <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredProjects.length === 0 && (
          <div className="col-span-full py-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
            <Briefcase size={48} className="mx-auto mb-4 opacity-20" />
            <p>No projects found matching your search</p>
          </div>
        )}
      </div>

      {/* Print Only View */}
      <div className="hidden print:block space-y-8">
        <div className="border-b-2 border-slate-900 pb-4">
          <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight">{organisation?.name}</h1>
          <p className="text-slate-500 font-bold">PROJECTS REPORT - {new Date().toLocaleDateString()}</p>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200 text-left">
              <th className="py-4 font-black text-xs uppercase tracking-widest text-slate-400">Project Name</th>
              <th className="py-4 font-black text-xs uppercase tracking-widest text-slate-400">Client</th>
              <th className="py-4 font-black text-xs uppercase tracking-widest text-slate-400">Timeline</th>
              <th className="py-4 font-black text-xs uppercase tracking-widest text-slate-400">Status</th>
              <th className="py-4 font-black text-xs uppercase tracking-widest text-slate-400 text-right">Budget</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredProjects.map(p => (
              <tr key={p.id}>
                <td className="py-4">
                  <p className="font-bold text-slate-900">{p.name}</p>
                  <p className="text-[10px] text-slate-400">{p.departmentIds.map(id => departments.find(d => d.id === id)?.name).join(', ')}</p>
                </td>
                <td className="py-4 text-sm text-slate-600">
                  {contacts.find(c => c.id === p.clientId)?.name || 'N/A'}
                </td>
                <td className="py-4 text-sm text-slate-600">
                  {formatDate(p.startDate)} - {p.endDate ? formatDate(p.endDate) : 'Ongoing'}
                </td>
                <td className="py-4">
                  <span className="text-[10px] font-black uppercase tracking-widest">{p.status}</span>
                </td>
                <td className="py-4 text-right font-bold text-slate-900">
                  {formatCurrency(p.totalBudget || 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">{editingProject ? 'Edit' : 'Create New'} Project</h2>
              <button onClick={() => { setIsModalOpen(false); setEditingProject(null); }} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-8 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Project Name</label>
                  <input
                    required
                    type="text"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="e.g. Q2 Infrastructure Upgrade"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Status</label>
                  <select
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                  >
                    <option value="Open">Open</option>
                    <option value="Completed">Completed</option>
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
                  <label className="text-sm font-medium text-slate-700">End Date (Optional)</label>
                  <input
                    type="date"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.endDate}
                    onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">Client / Contact</label>
                  <button 
                    type="button"
                    onClick={() => setIsContactModalOpen(true)}
                    className="text-blue-600 hover:text-blue-700 text-xs font-bold"
                  >
                    + Add New Client
                  </button>
                </div>
                <select
                  required
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.clientId}
                  onChange={e => setFormData({ ...formData, clientId: e.target.value })}
                >
                  <option value="">Select Client</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Departments Involved</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {departments.filter(d => d.name !== 'General').map(dept => (
                    <label key={dept.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        className="rounded text-blue-600"
                        checked={formData.departmentIds.includes(dept.id)}
                        onChange={(e) => {
                          if (e.target.checked) setFormData({ ...formData, departmentIds: [...formData.departmentIds, dept.id] });
                          else setFormData({ ...formData, departmentIds: formData.departmentIds.filter(id => id !== dept.id) });
                        }}
                      />
                      <span className="text-sm font-medium text-slate-700">{dept.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">Project Phases & Sub-phases</h3>
                  <button 
                    type="button"
                    onClick={addPhase}
                    className="text-blue-600 hover:text-blue-700 font-bold text-sm flex items-center gap-1"
                  >
                    <Plus size={16} /> Add Phase
                  </button>
                </div>
                
                <div className="space-y-6">
                  {formData.phases.map((phase, pIndex) => (
                    <div key={phase.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 space-y-2">
                          <label className="text-[10px] uppercase font-bold text-slate-400">Phase Name</label>
                          <input
                            required
                            type="text"
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder={`Phase ${pIndex + 1} Name`}
                            value={phase.name}
                            onChange={e => updatePhase(phase.id, { name: e.target.value })}
                          />
                        </div>
                        <div className="w-40 space-y-2">
                          <label className="text-[10px] uppercase font-bold text-slate-400">Budget (ZAR)</label>
                          <input
                            required
                            type="number"
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                            value={phase.budget}
                            onChange={e => updatePhase(phase.id, { budget: parseFloat(e.target.value) })}
                            disabled={phase.subPhases.length > 0}
                          />
                          {phase.subPhases.length > 0 && (
                            <p className="text-[10px] text-blue-600 font-bold">Calculated from sub-phases</p>
                          )}
                        </div>
                        <button 
                          type="button"
                          onClick={() => removePhase(phase.id)}
                          className="mt-6 p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>

                      <div className="pl-6 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sub-phases</p>
                          <button 
                            type="button"
                            onClick={() => addSubPhase(phase.id)}
                            className="text-blue-600 hover:text-blue-700 font-bold text-[10px] uppercase flex items-center gap-1"
                          >
                            <Plus size={12} /> Add Sub-phase
                          </button>
                        </div>
                        {phase.subPhases.map((sub, sIndex) => (
                          <div key={sIndex} className="space-y-3 p-4 bg-white border border-slate-100 rounded-xl">
                            <div className="flex items-center gap-3">
                              <input
                                required
                                type="text"
                                className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder={`Sub-phase ${sIndex + 1}`}
                                value={sub.name}
                                onChange={e => updateSubPhase(phase.id, sIndex, { name: e.target.value })}
                              />
                              <div className="relative w-32">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">R</span>
                                <input
                                  required
                                  type="number"
                                  className="w-full pl-5 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                  placeholder="Budget"
                                  value={sub.budget}
                                  onChange={e => updateSubPhase(phase.id, sIndex, { budget: parseFloat(e.target.value) })}
                                />
                              </div>
                              <button 
                                type="button"
                                onClick={() => removeSubPhase(phase.id, sIndex)}
                                className="text-slate-400 hover:text-rose-600"
                              >
                                <X size={16} />
                              </button>
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">Chart of Accounts for this Sub-phase</label>
                              <SearchableSelect 
                                options={chartOfAccounts.filter(cc => cc.status !== 'Archived' && !sub.chartOfAccountBudgets?.some(ccb => ccb.chartOfAccountId === cc.id))}
                                value=""
                                onChange={(val) => {
                                  const currentIds = sub.chartOfAccountBudgets?.map(ccb => ccb.chartOfAccountId) || [];
                                  updateSubPhaseChartOfAccounts(phase.id, sIndex, [...currentIds, val]);
                                }}
                                onAdd={handleAddChartOfAccount}
                                placeholder="Search or add account..."
                              />
                              <div className="flex flex-wrap gap-2 mt-2">
                                {sub.chartOfAccountBudgets?.map(ccb => {
                                  const cc = chartOfAccounts.find(c => c.id === ccb.chartOfAccountId);
                                  if (!cc) return null;
                                  return (
                                    <div
                                      key={cc.id}
                                      className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-bold"
                                    >
                                      <span>{cc.name}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const currentIds = sub.chartOfAccountBudgets?.map(c => c.chartOfAccountId) || [];
                                          updateSubPhaseChartOfAccounts(phase.id, sIndex, currentIds.filter(id => id !== cc.id));
                                        }}
                                        className="hover:text-blue-200"
                                      >
                                        <X size={10} />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {sub.chartOfAccountBudgets && sub.chartOfAccountBudgets.length > 0 && (
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                                {sub.chartOfAccountBudgets.map(ccb => (
                                  <div key={ccb.chartOfAccountId} className="space-y-1">
                                    <label className="text-[9px] font-bold text-slate-500 truncate block">
                                      {chartOfAccounts.find(cc => cc.id === ccb.chartOfAccountId)?.name}
                                    </label>
                                    <div className="relative">
                                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">R</span>
                                      <input 
                                        type="number"
                                        className="w-full pl-5 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                        value={ccb.amount}
                                        onChange={e => updateSubPhaseChartOfAccountAmount(phase.id, sIndex, ccb.chartOfAccountId, parseFloat(e.target.value))}
                                      />
                                    </div>
                                  </div>
                                ))}
                                <div className="col-span-full flex items-center justify-between text-[10px] font-bold">
                                  <span className={cn(
                                    sub.chartOfAccountBudgets.reduce((acc, ccb) => acc + ccb.amount, 0) > sub.budget 
                                      ? "text-rose-600" 
                                      : "text-slate-400"
                                  )}>
                                    Allocated: R{sub.chartOfAccountBudgets.reduce((acc, ccb) => acc + ccb.amount, 0).toLocaleString()}
                                  </span>
                                  <span className="text-slate-400">
                                    Target: R{sub.budget.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {formData.phases.length === 0 && (
                    <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-sm">No phases defined yet</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" /> : editingProject ? 'Update Project' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Confirm Delete</h2>
              <button onClick={() => setIsDeleteConfirmOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 space-y-6 text-center">
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={32} />
              </div>
              <p className="text-slate-600">
                Are you sure you want to delete <strong>{projectToDelete?.name}</strong>? This will not delete requisitions associated with it.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isContactModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Add New Client</h2>
              <button onClick={() => setIsContactModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddContact} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Client Name</label>
                <input
                  required
                  type="text"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  value={contactFormData.name}
                  onChange={e => setContactFormData({ ...contactFormData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Email (Optional)</label>
                <input
                  type="email"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  value={contactFormData.email}
                  onChange={e => setContactFormData({ ...contactFormData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Phone (Optional)</label>
                <input
                  type="tel"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  value={contactFormData.phone}
                  onChange={e => setContactFormData({ ...contactFormData, phone: e.target.value })}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Add Client'}
              </button>
            </form>
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


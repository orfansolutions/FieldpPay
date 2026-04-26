import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { Requisition, Contact, Project, ChartOfAccount, RequisitionStatus, PaymentCycle, Department, ApprovalHistory } from '../types';
import { 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  MoreVertical,
  ChevronRight,
  X,
  Loader2,
  Camera,
  Upload,
  Check,
  Ban,
  Eye,
  Trash2,
  ArrowLeft,
  Calendar,
  History,
  User as UserIcon,
  Printer,
  ChevronDown,
  Sparkles,
  Download,
  List
} from 'lucide-react';
import { cn, formatCurrency, formatDate, handleFirestoreError, OperationType } from '../lib/utils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { generateRequisitionDescription } from '../services/geminiService';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Fuse from 'fuse.js';
import { SearchableSelect } from './SearchableSelect';
import ConfirmationModal from './ConfirmationModal';
import PDFPreview from './PDFPreview';

export default function Requisitions() {
  const { organisation, profile, user, isDemo, showToast } = useAuth();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
  const [paymentCycles, setPaymentCycles] = useState<PaymentCycle[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfPreview, setPdfPreview] = useState<{ isOpen: boolean, title: string, blobUrl: string | null, filename: string }>({
    isOpen: false,
    title: '',
    blobUrl: null,
    filename: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isCCModalOpen, setIsCCModalOpen] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [newCC, setNewCC] = useState('');
  const [selectedReq, setSelectedReq] = useState<Requisition | null>(null);
  const [viewingReq, setViewingReq] = useState<Requisition | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<RequisitionStatus | 'All' | 'Pending Payments'>('All');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [paymentCycleFilter, setPaymentCycleFilter] = useState<string>('All');
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [rejectingReq, setRejectingReq] = useState<Requisition | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isMarkingAsPaid, setIsMarkingAsPaid] = useState(false);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);

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

  const activeChartOfAccounts = useMemo(() => 
    chartOfAccounts.filter(cc => cc.status !== 'Archived'),
    [chartOfAccounts]
  );

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    contactId: '',
    lineItems: [] as any[],
    paymentDate: '',
    isException: false,
    attachments: [] as any[],
    departmentId: '', // Header department (optional)
  });

  const createNewLineItem = () => ({
    id: Math.random().toString(36).substr(2, 9),
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    chartOfAccountId: '',
    departmentId: '',
    projectId: '',
    phase: '',
    subPhase: '',
    description: '',
    amount: 0,
    vatType: 'No VAT' as 'Inclusive' | 'Exclusive' | 'No VAT',
    vatAmount: 0,
    netAmount: 0,
  });

  const addLineItem = () => {
    setFormData(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, createNewLineItem()]
    }));
  };

  const removeLineItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter(item => item.id !== id)
    }));
  };

  const updateLineItem = (id: string, updates: any) => {
    setFormData(prev => {
      const newLineItems = prev.lineItems.map(item => {
        if (item.id === id) {
          const newItem = { ...item, ...updates };
          const vatRate = organisation?.vatRate || 15;
          
          let amount = Number(newItem.amount) || 0;
          let vatAmount = 0;
          let netAmount = 0;

          if (newItem.vatType === 'Inclusive') {
            netAmount = amount / (1 + vatRate / 100);
            vatAmount = amount - netAmount;
          } else if (newItem.vatType === 'Exclusive') {
            netAmount = amount;
            vatAmount = amount * (vatRate / 100);
            amount = netAmount + vatAmount;
          } else {
            netAmount = amount;
            vatAmount = 0;
          }

          return { 
            ...newItem, 
            amount: Number(amount.toFixed(2)), 
            vatAmount: Number(vatAmount.toFixed(2)), 
            netAmount: Number(netAmount.toFixed(2)) 
          };
        }
        return item;
      });
      return { ...prev, lineItems: newLineItems };
    });
  };

  const [contactFormData, setContactFormData] = useState({
    name: '',
    email: '',
    phone: '',
    category: 'Supplier' as 'Supplier' | 'Employee' | 'Contractor' | 'Other',
    bankDetails: {
      type: 'Bank Account' as 'Bank Account' | 'Cash' | 'Cash Send',
      bankName: '',
      accountNumber: '',
      branchCode: '',
      accountType: 'Current',
      cellphoneNumber: '',
    },
  });

  // Automatic Draft Save
  useEffect(() => {
    const savedDraft = localStorage.getItem('requisition_draft');
    if (savedDraft && !isModalOpen) {
      try {
        const draft = JSON.parse(savedDraft);
        setFormData(prev => ({ ...prev, ...draft }));
      } catch (e) { console.error('Failed to load draft', e); }
    }
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      localStorage.setItem('requisition_draft', JSON.stringify(formData));
    }
  }, [formData, isModalOpen]);

  const clearDraft = () => {
    localStorage.removeItem('requisition_draft');
  };

  const handleExportCSV = () => {
    setIsExporting(true);
    try {
      const headers = ['Status', 'Actioned Date', 'INV/Quote No', 'INV/QUOTE Date', 'Contact Name', 'Project', 'Project Subphase', 'Amount', 'Payment Method', 'Bank Name', 'Account No', 'Branch Code'];
      const requisitionsToExport = selectedIds.length > 0 
        ? requisitions.filter(r => selectedIds.includes(r.id)) 
        : filteredRequisitions;

      const rows = requisitionsToExport.map(req => {
        const contact = contacts.find(c => c.id === req.contactId);
        const project = projects.find(p => p.id === req.projectId);
        
        const lastAction = (req.approvalHistory || [])
          .filter(h => h.action === 'Approved' || h.action === 'Paid')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        const actionedDate = lastAction ? formatDate(lastAction.date) : 'N/A';

        let paymentMethod = 'Bank Account';
        let bankName = contact?.bankDetails?.bankName || 'None';
        let accountNo = contact?.bankDetails?.accountNumber || 'None';
        let branchCode = contact?.bankDetails?.branchCode || 'None';

        if (contact?.bankDetails?.type === 'Cash') {
          paymentMethod = 'Cash';
          bankName = 'None';
          accountNo = 'None';
          branchCode = 'None';
        } else if (contact?.bankDetails?.type === 'Cash Send') {
          paymentMethod = 'Cash Send';
          bankName = 'Cash Send';
          accountNo = contact.bankDetails.cellphoneNumber || contact.contactNumber || 'None';
          branchCode = 'None';
        }

        return [
          req.status === 'Paid' ? 'PAID' : 'OUTSTANDING',
          actionedDate,
          req.lineItems?.length > 0 ? req.lineItems.map(i => i.invoiceNumber).join('; ') : (req.invoiceNumber || 'N/A'),
          formatDate(req.date),
          contact?.name || 'N/A',
          req.lineItems?.length > 0 ? [...new Set(req.lineItems.map(i => projects.find(p => p.id === i.projectId)?.name).filter(Boolean))].join('; ') : (project?.name || 'N/A'),
          req.lineItems?.length > 0 ? req.lineItems.map(i => i.phase).filter(Boolean).join('; ') : (req.subPhase || req.phase || 'N/A'),
          req.totalAmount || req.amount || 0,
          paymentMethod,
          bankName,
          accountNo,
          branchCode
        ];
      });

      const exportDateHeader = `Export Date: ${formatDate(new Date().toISOString())}\n`;
      const dateRangeHeader = (dateRange.start || dateRange.end) 
        ? `Date Range: ${dateRange.start || 'Start'} to ${dateRange.end || 'End'}\n`
        : '';

      const csvContent = [
        exportDateHeader + dateRangeHeader + headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `requisitions_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJSON = () => {
    setIsExporting(true);
    try {
      const requisitionsToExport = selectedIds.length > 0 
        ? requisitions.filter(r => selectedIds.includes(r.id)) 
        : filteredRequisitions;

      const data = requisitionsToExport.map(req => {
        const contact = contacts.find(c => c.id === req.contactId);
        const project = projects.find(p => p.id === req.projectId);
        
        let paymentMethod = 'Bank Account';
        let bankName = contact?.bankDetails?.bankName || 'None';
        let accountNo = contact?.bankDetails?.accountNumber || 'None';
        let branchCode = contact?.bankDetails?.branchCode || 'None';

        if (contact?.bankDetails?.type === 'Cash') {
          paymentMethod = 'Cash';
          bankName = 'None';
          accountNo = 'None';
          branchCode = 'None';
        } else if (contact?.bankDetails?.type === 'Cash Send') {
          paymentMethod = 'Cash Send';
          bankName = 'Cash Send';
          accountNo = contact.bankDetails.cellphoneNumber || contact.contactNumber || 'None';
          branchCode = 'None';
        }

        return {
          'INV/Quote No': req.invoiceNumber,
          'INV/QUOTE Date': formatDate(req.date),
          'Contact Name': contact?.name || 'N/A',
          'Project': project?.name || 'N/A',
          'Project Subphase': req.subPhase || req.phase || 'N/A',
          'Amount': req.amount,
          'Payment Method': paymentMethod,
          'Bank Name': bankName,
          'Account No': accountNo,
          'Branch Code': branchCode
        };
      });

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `requisitions_${new Date().toISOString().split('T')[0]}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setIsExporting(false);
    }
  };

  const [isSuperUserApprovalModalOpen, setIsSuperUserApprovalModalOpen] = useState(false);
  const [superUserApprovalType, setSuperUserApprovalType] = useState<'Manager' | 'Financial Manager' | 'CEO/CFO' | 'Both'>('Both');
  const [search, setSearch] = useState('');

  const handleMagicDescription = async (lineId: string) => {
    const item = formData.lineItems.find(i => i.id === lineId);
    const contact = contacts.find(c => c.id === formData.contactId);
    if (!contact || !item || !item.invoiceNumber) return;
    
    setGeneratingDescription(true);
    try {
      const description = await generateRequisitionDescription(
        item.invoiceNumber,
        contact.name,
        item.amount
      );
      if (description) {
        updateLineItem(lineId, { description: description.substring(0, 50) });
      }
    } finally {
      setGeneratingDescription(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) { // 500KB limit for Firestore base64
      showToast('File is too large. Please upload a file smaller than 500KB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setFormData(prev => ({
        ...prev,
        attachments: [...(prev as any).attachments || [], {
          name: file.name,
          type: file.type,
          data: base64String,
          uploadedAt: new Date().toISOString()
        }]
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleGeminiAudit = async (req: Requisition) => {
    if (!req) return;
    setIsAuditing(true);
    setAuditResult(null);
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.APP_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key is missing.');
      }
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3.1-pro-preview";
      
      const prompt = `As a financial auditor for ${organisation?.name || 'an organisation'}, analyse this payment requisition for potential issues, policy violations, or suspicious patterns. 
      
      Requisition Details:
      - Total Amount: ${formatCurrency(req.totalAmount || req.amount || 0)}
      - Contact: ${contacts.find(c => c.id === req.contactId)?.name || 'N/A'}
      - Status: ${req.status}
      - Created By: ${req.creatorName}
      - Date: ${formatDate(req.date)}
      
      Line Items:
      ${(req.lineItems || []).map(item => `- INV ${item.invoiceNumber}: ${formatCurrency(item.amount)} (${item.description}) - Dept: ${departments.find(d => d.id === item.departmentId)?.name || 'N/A'}, Account: ${chartOfAccounts.find(cc => cc.id === item.chartOfAccountId)?.name || 'N/A'}`).join('\n')}
      
      Provide a detailed audit report including:
      1. Risk Assessment (Low/Medium/High)
      2. Potential Issues or Red Flags
      3. Compliance Check
      4. Recommendation for the Approver
      
      Be thorough and professional.`;

      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });

      setAuditResult(response.text || "No analysis generated.");
    } catch (err) {
      console.error("Gemini Audit Error:", err);
      setAuditResult("Failed to perform audit. Please try again later.");
    } finally {
      setIsAuditing(false);
    }
  };

  useEffect(() => {
    if (isDemo) {
      import('../lib/demoData').then(demo => {
        setRequisitions(demo.DEMO_REQUISITIONS);
        setContacts(demo.DEMO_CONTACTS);
        setProjects(demo.DEMO_PROJECTS);
        setChartOfAccounts(demo.DEMO_CHART_OF_ACCOUNTS);
        setPaymentCycles(demo.DEMO_PAYMENT_CYCLES);
        setDepartments(demo.DEMO_DEPARTMENTS);
        setLoading(false);
      });
      return;
    }

    if (!organisation?.id || !auth.currentUser) return;

    // Step 1: Immediate state clearing and loading indication
    setLoading(true);
    setRequisitions([]);
    setContacts([]);
    setProjects([]);
    setChartOfAccounts([]);
    setPaymentCycles([]);
    setDepartments([]);

    const fetchData = async () => {
      try {
        // Step 2: Parallel fetch for initial render speed
        const qReq = query(
          collection(db, 'requisitions'), 
          where('organisationId', '==', organisation.id),
          where('date', '>=', organisation.financialYear.startDate),
          where('date', '<=', organisation.financialYear.endDate)
        );

        const [reqSnap, contactSnap, projectSnap, ccSnap, cycleSnap, deptSnap] = await Promise.all([
          getDocs(qReq),
          getDocs(query(collection(db, 'contacts'), where('organisationId', '==', organisation.id))),
          getDocs(query(collection(db, 'projects'), where('organisationId', '==', organisation.id))),
          getDocs(query(collection(db, 'chartOfAccounts'), where('organisationId', '==', organisation.id))),
          getDocs(query(collection(db, 'paymentCycles'), where('organisationId', '==', organisation.id))),
          getDocs(query(collection(db, 'departments'), where('organisationId', '==', organisation.id)))
        ]);

        setRequisitions(reqSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Requisition)));
        setContacts(contactSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact)));
        setProjects(projectSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
        setChartOfAccounts(ccSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChartOfAccount)));
        setPaymentCycles(cycleSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentCycle)));
        setDepartments(deptSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)));
        
        setLoading(false);
      } catch (err) {
        console.error('Initial requisitions fetch error:', err);
        setLoading(false);
      }
    };

    fetchData();

    // Step 3: Attach long-lived listeners for updates
    const qReqRealtime = query(
      collection(db, 'requisitions'), 
      where('organisationId', '==', organisation.id),
      where('date', '>=', organisation.financialYear.startDate),
      where('date', '<=', organisation.financialYear.endDate)
    );

    const unsubReq = onSnapshot(qReqRealtime, (snapshot) => {
      setRequisitions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Requisition)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'requisitions'));

    const unsubContacts = onSnapshot(query(collection(db, 'contacts'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'contacts'));

    const unsubProjects = onSnapshot(query(collection(db, 'projects'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'projects'));

    const unsubCC = onSnapshot(query(collection(db, 'chartOfAccounts'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setChartOfAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChartOfAccount)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'chartOfAccounts'));

    const unsubCycles = onSnapshot(query(collection(db, 'paymentCycles'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setPaymentCycles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentCycle)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'paymentCycles'));

    const unsubDept = onSnapshot(query(collection(db, 'departments'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setDepartments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'departments'));

    return () => {
      unsubReq();
      unsubContacts();
      unsubProjects();
      unsubCC();
      unsubCycles();
      unsubDept();
    };
  }, [organisation?.id, isDemo]);

  const handleSubmit = async (status: RequisitionStatus) => {
    if (isDemo) {
      const totalAmount = formData.lineItems.reduce((sum, item) => sum + item.amount, 0);
      const totalVatAmount = formData.lineItems.reduce((sum, item) => sum + item.vatAmount, 0);
      const totalNetAmount = formData.lineItems.reduce((sum, item) => sum + item.netAmount, 0);

      const newReq: Requisition = {
        ...formData,
        id: selectedReq?.id || Math.random().toString(36).substr(2, 9),
        status: status,
        date: new Date().toISOString().split('T')[0],
        organisationId: organisation?.id || 'demo-org-123',
        createdBy: user?.uid || 'demo-user',
        creatorName: profile?.displayName || 'Demo User',
        totalAmount,
        totalVatAmount,
        totalNetAmount,
        approvalHistory: [
          ...(selectedReq?.approvalHistory || []),
          {
            userId: user?.uid || 'demo-user',
            userName: profile?.displayName || 'Demo User',
            userRole: profile?.role || 'Requester',
            date: new Date().toISOString(),
            action: status === 'Submitted' ? 'Submitted' : 'Approved'
          }
        ]
      };

      if (selectedReq) {
        setRequisitions(prev => prev.map(r => r.id === selectedReq.id ? newReq : r));
      } else {
        setRequisitions(prev => [newReq, ...prev]);
      }

      setIsModalOpen(false);
      setSelectedReq(null);
      resetForm();
      return;
    }
    if (!organisation || !user || !profile) return;
    
    // Validation
    if (status === 'Submitted') {
      if (!formData.contactId) {
        showToast('Please select a contact.', 'warning');
        return;
      }
      if (formData.lineItems.length === 0) {
        showToast('Please add at least one line item.', 'warning');
        return;
      }
      if (!formData.paymentDate) {
        showToast('Please select a payment date.', 'warning');
        return;
      }

      for (const item of formData.lineItems) {
        if (!item.invoiceNumber.trim()) {
          showToast('All line items must have an invoice number.', 'warning');
          return;
        }
        if (item.amount <= 0) {
          showToast('All line items must have an amount greater than 0.', 'warning');
          return;
        }
        if (!item.departmentId) {
          showToast('All line items must have a department.', 'warning');
          return;
        }
        if (!item.chartOfAccountId) {
          showToast('All line items must have a Chart of Account.', 'warning');
          return;
        }
      }
    }

    // Budget Validation
    const budgetErrors: string[] = [];
    formData.lineItems.forEach((item, index) => {
      const dept = departments.find(d => d.id === item.departmentId);
      const deptProjects = projects.filter(p => p.departmentIds.includes(item.departmentId));
      const departmentBudget = deptProjects.reduce((sum, p) => sum + (p.totalBudget || 0), 0);

      if (dept && departmentBudget > 0) {
        const deptSpent = requisitions
          .filter(r => r.status !== 'Rejected' && r.status !== 'Draft')
          .reduce((sum, r) => {
            const itemSum = (r.lineItems || []).filter(li => li.departmentId === dept.id).reduce((s, li) => s + li.amount, 0);
            return sum + itemSum;
          }, 0);
        
        if ((deptSpent + item.amount) > departmentBudget) {
          budgetErrors.push(`Line ${index + 1}: Department "${dept.name}" budget exceeded. Available: R${(departmentBudget - deptSpent).toLocaleString()}`);
        }
      }

      if (item.projectId && item.phase && item.subPhase && item.chartOfAccountId) {
        const project = projects.find(p => p.id === item.projectId);
        const phase = project?.phases?.find(p => p.name === item.phase);
        const subPhase = phase?.subPhases?.find(sp => sp.name === item.subPhase);
        const ccBudget = subPhase?.chartOfAccountBudgets?.find(ccb => ccb.chartOfAccountId === item.chartOfAccountId);

        if (ccBudget) {
          const ccSpent = requisitions
            .filter(r => r.status !== 'Rejected' && r.status !== 'Draft')
            .reduce((sum, r) => {
              const itemSum = (r.lineItems || []).filter(li => 
                li.projectId === item.projectId && 
                li.phase === item.phase && 
                li.subPhase === item.subPhase && 
                li.chartOfAccountId === item.chartOfAccountId
              ).reduce((s, li) => s + li.amount, 0);
              return sum + itemSum;
            }, 0);
          
          if ((ccSpent + item.amount) > ccBudget.amount) {
            budgetErrors.push(`Line ${index + 1}: Account budget for "${item.subPhase}" exceeded. Available: R${(ccBudget.amount - ccSpent).toLocaleString()}`);
          }
        }
      }
    });

    if (budgetErrors.length > 0 && status !== 'Draft') {
      if (!confirm(`Budget Warnings:\n${budgetErrors.join('\n')}\n\nDo you want to proceed anyway?`)) {
        return;
      }
    }

    setSubmitting(true);

    const history: ApprovalHistory[] = selectedReq?.approvalHistory || [];
    if (status === 'Submitted') {
      history.push({
        userId: user.uid,
        userName: profile.displayName,
        userRole: profile.role,
        date: new Date().toISOString(),
        action: 'Submitted'
      });
      // Initial status after submission
      status = 'Awaiting Departmental Approval';
    }

    const totalAmount = formData.lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
    const totalVatAmount = formData.lineItems.reduce((sum, item) => sum + Number(item.vatAmount), 0);
    const totalNetAmount = formData.lineItems.reduce((sum, item) => sum + Number(item.netAmount), 0);

    const mappedLineItems = formData.lineItems.map(item => {
      if (!item.projectId) {
        const generalProj = projects.find(p => p.isGeneral);
        if (generalProj) {
          return { ...item, projectId: generalProj.id };
        }
      }
      return item;
    });

    const reqData = {
      ...formData,
      lineItems: mappedLineItems,
      totalAmount,
      totalVatAmount,
      totalNetAmount,
      status,
      organisationId: organisation.id,
      createdBy: selectedReq ? selectedReq.createdBy : user.uid,
      creatorName: selectedReq ? selectedReq.creatorName : profile.displayName,
      approvalHistory: history
    };

    try {
      const isSubmitting = status === 'Awaiting Departmental Approval';
      
      if (selectedReq) {
        await updateDoc(doc(db, 'requisitions', selectedReq.id), reqData);
      } else {
        await addDoc(collection(db, 'requisitions'), reqData);
      }
      
      setIsModalOpen(false);
      clearDraft();
      setSelectedReq(null);
      resetForm();
      
      if (isSubmitting) {
        setTimeout(() => {
          showToast('Requisition submitted successfully!', 'success');
        }, 100);
      }
    } catch (err) {
      console.error('Error saving requisition:', err);
      handleFirestoreError(err, selectedReq ? OperationType.UPDATE : OperationType.CREATE, 'requisitions');
      showToast('Failed to save requisition. Please check your permissions or required fields.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      contactId: '',
      lineItems: [createNewLineItem()],
      paymentDate: '',
      isException: false,
      attachments: [] as any[],
      departmentId: '',
    });
  };

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewId = searchParams.get('view');

  useEffect(() => {
    if (viewId && requisitions.length > 0) {
      const req = requisitions.find(r => r.id === viewId);
      if (req) {
        setViewingReq(req);
      }
    }
  }, [viewId, requisitions]);

  const closeViewingReq = () => {
    setViewingReq(null);
    setAuditResult(null);
    setIsAuditing(false);
    setSearchParams({});
  };

  const handleApprove = async (req: Requisition, suType?: 'Manager' | 'Financial Manager' | 'CEO/CFO' | 'Both') => {
    if (!profile || !user) return;
    
    let nextStatus: RequisitionStatus = req.status;
    const history: ApprovalHistory[] = [...(req.approvalHistory || [])];

    const isManager = profile.role === 'Manager';
    const isFM = profile.role === 'Financial Manager';
    const isCEO = profile.role === 'CEO/CFO';
    const isSU = profile.role === 'Super User';

    // Departmental Approval
    if (req.status === 'Awaiting Departmental Approval') {
      if (isManager || isFM || isCEO || isSU) {
        nextStatus = 'Awaiting Finance Approval';
      }
    } 
    // Finance Approval
    else if (req.status === 'Awaiting Finance Approval') {
      if (isFM || isSU) {
        nextStatus = 'Awaiting CEO/CFO Approval';
      }
    }
    // CEO/CFO Approval
    else if (req.status === 'Awaiting CEO/CFO Approval') {
      if (isCEO || isSU) {
        nextStatus = 'Approved';
      }
    }
    // Super User Override
    if (isSU && suType) {
      if (suType === 'Both') {
        nextStatus = 'Approved';
      } else if (suType === 'Financial Manager') {
        if (req.status === 'Awaiting Finance Approval') nextStatus = 'Awaiting CEO/CFO Approval';
        else if (req.status === 'Awaiting Departmental Approval') nextStatus = 'Awaiting Finance Approval';
      } else if (suType === 'CEO/CFO') {
        if (req.status === 'Awaiting CEO/CFO Approval') nextStatus = 'Approved';
        else if (req.status === 'Awaiting Departmental Approval') nextStatus = 'Awaiting Finance Approval';
      } else if (suType === 'Manager') {
        if (req.status === 'Awaiting Departmental Approval') nextStatus = 'Awaiting Finance Approval';
      }
    }

    if (nextStatus === req.status) {
      showToast('You do not have permission to approve this requisition at its current stage.', 'warning');
      return;
    }

    history.push({
      userId: user.uid,
      userName: profile.displayName,
      userRole: profile.role,
      date: new Date().toISOString(),
      action: 'Approved',
      comment: isSU ? `Approved on behalf of ${suType || 'Super User'}` : undefined
    });

    try {
      await updateDoc(doc(db, 'requisitions', req.id), { 
        status: nextStatus,
        approvalHistory: history
      });
      setViewingReq(null);
      setIsSuperUserApprovalModalOpen(false);
      showToast(`Requisition moved to: ${nextStatus}`, 'success');
    } catch (err) {
      console.error('Error approving requisition:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'requisitions');
      showToast('Failed to approve requisition. Please check your permissions.', 'error');
    }
  };

  const handleDelete = (req: Requisition) => {
    if (!profile || !user) return;
    if (req.createdBy !== user.uid && !['Super User', 'Financial Manager', 'CEO/CFO'].includes(profile.role)) {
      showToast('You do not have permission to delete this requisition.', 'warning');
      return;
    }
    
    setConfirmModal({
      isOpen: true,
      title: 'Delete Requisition',
      message: 'Are you sure you want to delete this requisition? This action cannot be undone.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          setLoading(true);
          if (isDemo) {
            setRequisitions(prev => prev.filter(r => r.id !== req.id));
          } else {
            await deleteDoc(doc(db, 'requisitions', req.id));
          }
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'requisitions');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleReject = async (req: Requisition) => {
    if (!profile || !user || !rejectionReason) return;

    setLoading(true);
    try {
      const history: ApprovalHistory[] = [...(req.approvalHistory || [])];
      history.push({
        userId: user.uid,
        userName: profile.displayName,
        userRole: profile.role,
        date: new Date().toISOString(),
        action: 'Rejected',
        comment: rejectionReason
      });

      await updateDoc(doc(db, 'requisitions', req.id), { 
        status: 'Rejected', 
        rejectionReason: rejectionReason,
        approvalHistory: history
      });
      closeViewingReq();
      setRejectingReq(null);
      setRejectionReason('');
    } catch (err) {
      console.error('Error rejecting/voiding requisition:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'requisitions');
      showToast('Failed to reject requisition. Please check your permissions.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organisation) return;
    setLoading(true);

    try {
      const contactData = {
        name: contactFormData.name,
        email: contactFormData.email,
        contactNumber: contactFormData.phone,
        category: contactFormData.category,
        organisationId: organisation.id,
        attachments: [],
        bankDetails: contactFormData.bankDetails.type === 'Cash Send' 
          ? { 
              type: 'Cash Send', 
              cellphoneNumber: contactFormData.phone 
            } 
          : {
              ...contactFormData.bankDetails,
              type: 'Bank Account'
            }
      };

      const docRef = await addDoc(collection(db, 'contacts'), contactData);
      setFormData({ ...formData, contactId: docRef.id });
      setIsContactModalOpen(false);
      setContactFormData({
        name: '',
        email: '',
        phone: '',
        category: 'Supplier',
        bankDetails: {
          type: 'Bank Account',
          bankName: '',
          accountNumber: '',
          branchCode: '',
          accountType: 'Current',
          cellphoneNumber: '',
        },
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCC = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organisation || !newCC) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'chartOfAccounts'), { 
        name: newCC, 
        organisationId: organisation.id 
      });
      setIsCCModalOpen(false);
      setNewCC('');
      showToast(`Account "${newCC}" added to Chart of Accounts.`, 'success');
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  const handleBulkApprove = async () => {
    if (!profile || !user || selectedIds.length === 0) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      let count = 0;
      for (const id of selectedIds) {
        const req = requisitions.find(r => r.id === id);
        if (!req) continue;

        let nextStatus: RequisitionStatus = req.status;
        const history: ApprovalHistory[] = [...(req.approvalHistory || [])];

        const isManager = profile.role === 'Manager';
        const isFM = profile.role === 'Financial Manager';
        const isCEO = profile.role === 'CEO/CFO';
        const isSU = profile.role === 'Super User';

        // Departmental Approval
        if (req.status === 'Awaiting Departmental Approval') {
          if (isManager || isFM || isCEO || isSU) {
            nextStatus = 'Awaiting Finance Approval';
          }
        } 
        // Finance Approval
        else if (req.status === 'Awaiting Finance Approval') {
          if (isFM || isSU) {
            nextStatus = 'Awaiting CEO/CFO Approval';
          }
        }
        // CEO/CFO Approval
        else if (req.status === 'Awaiting CEO/CFO Approval') {
          if (isCEO || isSU) {
            nextStatus = 'Approved';
          }
        }

        if (nextStatus !== req.status) {
          history.push({
            userId: user.uid,
            userName: profile.displayName,
            userRole: profile.role,
            date: new Date().toISOString(),
            action: 'Approved'
          });
          batch.update(doc(db, 'requisitions', id), { 
            status: nextStatus,
            approvalHistory: history
          });
          count++;
        }
      }
      await batch.commit();
      showToast(`Bulk approved ${count} requisitions.`, 'success');
      setSelectedIds([]);
    } catch (err) {
      console.error('Error bulk approving:', err);
      showToast('Failed to bulk approve.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!user || selectedIds.length === 0) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      let count = 0;
      for (const id of selectedIds) {
        const req = requisitions.find(r => r.id === id);
        if (!req || req.status !== 'Approved') continue;

        const history: ApprovalHistory[] = [...(req.approvalHistory || [])];
        history.push({
          userId: user.uid,
          userName: profile?.displayName || 'System',
          userRole: profile?.role || 'Requester',
          date: new Date().toISOString(),
          action: 'Paid',
          comment: `Marked as Paid. Payment Date: ${paidDate || 'Not specified'}`
        });

        batch.update(doc(db, 'requisitions', id), { 
          status: 'Paid',
          paymentDate: paidDate || req.paymentDate || '',
          approvalHistory: history
        });
        count++;
      }
      
      if (count > 0) {
        await batch.commit();
        showToast(`Successfully marked ${count} requisition(s) as paid.`, 'success');
      }
      setSelectedIds([]);
      setIsMarkingAsPaid(false);
    } catch (err) {
      console.error('Error marking as paid:', err);
      showToast('Failed to mark requisitions as paid. Please check your permissions.', 'error');
      handleFirestoreError(err, OperationType.UPDATE, 'requisitions');
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    pending: requisitions.filter(r => ['Submitted', 'Awaiting Departmental Approval', 'Awaiting CEO/CFO Approval', 'Awaiting Finance Approval'].includes(r.status)).reduce((acc, r) => acc + (r.totalAmount || r.amount || 0), 0),
    submitted: requisitions.filter(r => r.status !== 'Draft').reduce((acc, r) => acc + (r.totalAmount || r.amount || 0), 0),
    approved: requisitions.filter(r => ['Approved', 'Paid'].includes(r.status)).reduce((acc, r) => acc + (r.totalAmount || r.amount || 0), 0),
    paid: requisitions.filter(r => r.status === 'Paid').reduce((acc, r) => acc + (r.totalAmount || r.amount || 0), 0),
  };

  const fuse = useMemo(() => new Fuse(requisitions, {
    keys: [
      'invoiceNumber',
      'creatorName',
      'description',
      'status'
    ],
    threshold: 0.3,
  }), [requisitions]);

  const filteredRequisitions = useMemo(() => {
    let base = requisitions;
    
    if (search) {
      const results = fuse.search(search);
      base = results.map(res => res.item);
    }

    return base.filter(r => {
      let matchesStatus = filter === 'All' || r.status === filter;
      if (filter === 'Pending Payments') {
        matchesStatus = r.status === 'Approved';
      }
      const matchesDateRange = (!dateRange.start || r.date >= dateRange.start) && 
                               (!dateRange.end || r.date <= dateRange.end);
      const matchesPaymentCycle = paymentCycleFilter === 'All' || r.paymentDate === paymentCycleFilter;
      
      return matchesStatus && matchesDateRange && matchesPaymentCycle;
    });
  }, [requisitions, filter, dateRange, paymentCycleFilter, search, fuse]);

  const handlePrint = () => {
    window.print();
  };

  const viewAttachment = (file: any) => {
    try {
      const newTab = window.open();
      if (!newTab) {
        showToast('Please allow popups to view attachments', 'info');
        return;
      }
      
      // For images and PDFs, we can often just write the iframe or use the data URL directly
      // However, some browsers have restrictions on data URLs in window.open
      // A more robust way is to use a blob
      const base64Data = file.data.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: file.type });
      const url = URL.createObjectURL(blob);
      
      newTab.location.href = url;
    } catch (err) {
      console.error('Error viewing attachment:', err);
      // Fallback to direct window.open if blob fails
      window.open(file.data, '_blank');
    }
  };

  const handleSavePDF = () => {
    const doc = new jsPDF('landscape');
    const requisitionsToExport = selectedIds.length > 0 
      ? requisitions.filter(r => selectedIds.includes(r.id)) 
      : filteredRequisitions;

    const isException = requisitionsToExport.every(r => r.isException);
    const isNormal = requisitionsToExport.every(r => !r.isException);
    const reqType = isException ? 'Payment Exception Requisition' : isNormal ? 'Normal Payment Requisition' : 'Mixed Payment Requisition';
    const paymentDates = [...new Set(requisitionsToExport.map(r => formatDate(r.paymentDate)))].join(', ');
    
    const isPaid = requisitionsToExport.every(r => r.status === 'Paid');
    const statusText = isPaid ? 'STATUS: PAID' : 'STATUS: OUTSTANDING';
    
    const actionedDates = requisitionsToExport.flatMap(r => 
      (r.approvalHistory || [])
        .filter(h => h.action === 'Approved' || h.action === 'Paid')
        .map(h => h.date)
    ).sort();
    const lastActionedDate = actionedDates.length > 0 ? formatDate(actionedDates[actionedDates.length - 1]) : 'N/A';

    doc.setFontSize(16);
    if (organisation?.logoURL) {
      try {
        doc.addImage(organisation.logoURL, 'PNG', 14, 10, 30, 30);
        doc.text(organisation?.name || 'Organisation', 50, 20);
      } catch (e) {
        doc.text(organisation?.name || 'Organisation', 14, 15);
      }
    } else {
      doc.text(organisation?.name || 'Organisation', 14, 15);
    }
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(reqType, 14, 22);
    doc.setFontSize(10);
    doc.text(`Requested Payment Date: ${paymentDates}`, 14, 28);
    doc.text(`Generated on ${new Date().toLocaleDateString()} | Actioned Date: ${lastActionedDate}`, 14, 34);
    doc.text(statusText, 14, 40);
    doc.text(`Export Date: ${formatDate(new Date().toISOString())}`, 14, 46);
    
    if (dateRange.start || dateRange.end) {
      doc.text(`Date Range: ${dateRange.start || 'Start'} to ${dateRange.end || 'End'}`, 14, 52);
    }

    // Consolidated Summary
    const consolidated = requisitionsToExport.reduce((acc, req) => {
      const contactId = req.contactId;
      const amount = req.totalAmount || req.amount || 0;
      if (!acc[contactId]) acc[contactId] = { amount: 0, reqs: [] };
      acc[contactId].amount += amount;
      acc[contactId].reqs.push(req);
      return acc;
    }, {} as Record<string, { amount: number, reqs: Requisition[] }>);

    const summaryData = Object.entries(consolidated).map(([contactId, data]) => {
      const contact = contacts.find(c => c.id === contactId);
      let bankName = contact?.bankDetails?.bankName || 'N/A';
      let accountNo = contact?.bankDetails?.accountNumber || 'N/A';
      let branchCode = contact?.bankDetails?.branchCode || 'N/A';

      if (contact?.bankDetails?.type === 'Cash Send') {
        bankName = 'Cash Send';
        accountNo = contact.bankDetails.cellphoneNumber || contact.contactNumber || 'N/A';
      }

      return [
        contact?.name || 'Unknown',
        bankName,
        accountNo,
        branchCode,
        formatCurrency(data.amount)
      ];
    });

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Consolidated Payment Summary', 14, 55);

    autoTable(doc, {
      head: [['Contact / Client', 'Bank Name', 'Account No', 'Branch', 'Total Amount']],
      body: summaryData,
      startY: 60,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] }
    });

    const summaryY = (doc as any).lastAutoTable.finalY + 15;
    doc.text('Detailed Invoice List', 14, summaryY);

    const tableData: any[] = [];
    requisitionsToExport.forEach(req => {
      const contact = contacts.find(c => c.id === req.contactId);
      
      let paymentMethod = 'Bank Account';
      let bankName = contact?.bankDetails?.bankName || 'None';
      let accountNo = contact?.bankDetails?.accountNumber || 'None';
      let branchCode = contact?.bankDetails?.branchCode || 'None';

      if (contact?.bankDetails?.type === 'Cash') {
        paymentMethod = 'Cash';
        bankName = 'None';
        accountNo = 'None';
        branchCode = 'None';
      } else if (contact?.bankDetails?.type === 'Cash Send') {
        paymentMethod = 'Cash Send';
        bankName = 'Cash Send';
        accountNo = contact.bankDetails.cellphoneNumber || contact.contactNumber || 'None';
        branchCode = 'None';
      }

      if (req.lineItems && req.lineItems.length > 0) {
        req.lineItems.forEach(li => {
          const project = projects.find(p => p.id === li.projectId);
          tableData.push([
            req.status === 'Paid' ? 'PAID' : 'OUTSTANDING',
            li.invoiceNumber || 'N/A',
            formatDate(li.invoiceDate || req.date),
            contact?.name || 'N/A',
            project?.name || 'N/A',
            li.subPhase || li.phase || 'N/A',
            formatCurrency(li.amount),
            paymentMethod,
            bankName,
            accountNo,
            branchCode
          ]);
        });
      } else {
        const project = projects.find(p => p.id === req.projectId);
        tableData.push([
          req.status === 'Paid' ? 'PAID' : 'OUTSTANDING',
          req.invoiceNumber || 'N/A',
          formatDate(req.date),
          contact?.name || 'N/A',
          project?.name || 'N/A',
          req.subPhase || req.phase || 'N/A',
          formatCurrency(req.amount || 0),
          paymentMethod,
          bankName,
          accountNo,
          branchCode
        ]);
      }
    });

    autoTable(doc, {
      head: [['Status', 'INV/Quote No', 'INV/QUOTE Date', 'Contact Name', 'Project', 'Project Subphase', 'Amount', 'Payment Method', 'Bank Name', 'Account No', 'Branch Code']],
      body: tableData,
      startY: summaryY + 5,
      theme: 'grid',
      styles: { fontSize: 7 },
      headStyles: { fillColor: [71, 85, 105] }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    
    // Signature lines
    const sigWidth = 60;
    const startX = 14;
    
    const sigs = [
      { label: 'Requester Signature', role: 'Requester' },
      { label: 'Reviewer Signature', role: 'Reviewer' },
      { label: 'Financial Manager Signature', role: 'Financial Manager' },
      { label: 'CEO Signature', role: 'CEO/CFO' }
    ];

    sigs.forEach((sig, i) => {
      const x = startX + (i % 2) * (sigWidth + 40);
      const y = finalY + Math.floor(i / 2) * 30;
      
      if (y > doc.internal.pageSize.height - 20) {
        doc.addPage();
        // Reset Y if needed, but for simplicity we just continue
      }

      doc.line(x, y, x + sigWidth, y);
      doc.text(sig.label, x, y + 5);
      doc.setFontSize(8);
      doc.text('Date: ________________', x, y + 10);
      doc.setFontSize(10);
    });

    const blobUrl = doc.output('bloburl') as unknown as string;
    setPdfPreview({
      isOpen: true,
      title: 'Requisitions Report',
      blobUrl,
      filename: `requisitions_${new Date().toISOString().split('T')[0]}.pdf`
    });
  };

  if (isPrintMode) {
    const requisitionsToPrint = selectedIds.length > 0 
      ? requisitions.filter(r => selectedIds.includes(r.id)) 
      : filteredRequisitions;

    const consolidatedData = requisitionsToPrint.reduce((acc, req) => {
      const contactId = req.contactId;
      const amount = req.totalAmount || req.amount || 0;
      if (!acc[contactId]) acc[contactId] = { amount: 0, reqs: [] };
      acc[contactId].amount += amount;
      acc[contactId].reqs.push(req);
      return acc;
    }, {} as Record<string, { amount: number, reqs: Requisition[] }>);

    return (
      <div className="p-8 bg-white min-h-screen text-slate-900">
        <div className="flex items-center justify-between mb-8 no-print">
          <button onClick={() => setIsPrintMode(false)} className="flex items-center gap-2 text-slate-500 font-bold">
            <ArrowLeft size={20} /> Exit Print View
          </button>
          <div className="flex gap-4">
            <button onClick={handleSavePDF} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2">
              <Download size={20} /> Save PDF
            </button>
            <button onClick={handlePrint} className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2">
              <Printer size={20} /> Print Now
            </button>
          </div>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-2">{organisation?.name}</h1>
          <h2 className="text-xl text-slate-900 font-bold uppercase tracking-wider">
            {requisitionsToPrint.every(r => r.isException) ? 'Payment Exception Requisition' : 
             requisitionsToPrint.every(r => !r.isException) ? 'Normal Payment Requisition' : 
             'Mixed Payment Requisition'}
          </h2>
          <div className="mt-4 space-y-1">
            <p className="text-sm font-bold text-slate-600">
              Requested Payment Date: {
                [...new Set(requisitionsToPrint.map(r => formatDate(r.paymentDate)))].join(', ')
              }
            </p>
            <p className="text-sm font-bold text-slate-600">
              Status: {requisitionsToPrint.every(r => r.status === 'Paid') ? 'PAID' : 'OUTSTANDING'}
            </p>
            {(dateRange.start || dateRange.end) && (
              <p className="text-sm font-bold text-blue-600">
                Date Range: {dateRange.start || 'Start'} to {dateRange.end || 'End'}
              </p>
            )}
            <p className="text-xs text-slate-400">
              Generated on {new Date().toLocaleDateString()} | Actioned Date: {
                (() => {
                  const actionedDates = requisitionsToPrint.flatMap(r => 
                    (r.approvalHistory || [])
                      .filter(h => h.action === 'Approved' || h.action === 'Paid')
                      .map(h => h.date)
                  ).sort();
                  return actionedDates.length > 0 ? formatDate(actionedDates[actionedDates.length - 1]) : 'N/A';
                })()
              }
            </p>
          </div>
        </div>

        {/* Summary Table */}
        <div className="mb-12">
          <h3 className="text-lg font-bold mb-4 border-b-2 border-slate-900 pb-2 flex items-center gap-2">
            <FileText size={20} className="text-blue-500" />
            Consolidated Payment Summary
          </h3>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="py-2 text-[10px] uppercase font-bold">Contact / Client</th>
                <th className="py-2 text-[10px] uppercase font-bold">Bank Name</th>
                <th className="py-2 text-[10px] uppercase font-bold">Account No</th>
                <th className="py-2 text-[10px] uppercase font-bold">Branch</th>
                <th className="py-2 text-[10px] uppercase font-bold text-right">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(consolidatedData).map(([contactId, data]) => {
                const contact = contacts.find(c => c.id === contactId);
                let bankName = contact?.bankDetails?.bankName || 'N/A';
                let accountNo = contact?.bankDetails?.accountNumber || 'N/A';
                let branchCode = contact?.bankDetails?.branchCode || 'N/A';

                if (contact?.bankDetails?.type === 'Cash Send') {
                  bankName = 'Cash Send';
                  accountNo = contact.bankDetails.cellphoneNumber || contact.contactNumber || 'N/A';
                }

                return (
                  <tr key={contactId} className="border-b border-slate-100">
                    <td className="py-3 text-xs font-bold">{contact?.name || 'Unknown'}</td>
                    <td className="py-3 text-xs">{bankName}</td>
                    <td className="py-3 text-xs">{accountNo}</td>
                    <td className="py-3 text-xs">{branchCode}</td>
                    <td className="py-3 text-xs font-bold text-right">{formatCurrency(data.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold">
                <td colSpan={4} className="py-3 text-right text-xs">Grand Total:</td>
                <td className="py-3 text-right text-xs">{formatCurrency(requisitionsToPrint.reduce((acc, r) => acc + (r.totalAmount || r.amount || 0), 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mb-4">
          <h3 className="text-lg font-bold border-b-2 border-slate-900 pb-2 flex items-center gap-2">
            <List size={20} className="text-blue-500" />
            Detailed Invoice List
          </h3>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className="py-4 font-bold text-[10px] uppercase tracking-wider">Status</th>
              <th className="py-4 font-bold text-[10px] uppercase tracking-wider">INV/Quote No</th>
              <th className="py-4 font-bold text-[10px] uppercase tracking-wider">INV/QUOTE Date</th>
              <th className="py-4 font-bold text-[10px] uppercase tracking-wider">Contact Name</th>
              <th className="py-4 font-bold text-[10px] uppercase tracking-wider">Project</th>
              <th className="py-4 font-bold text-[10px] uppercase tracking-wider">Project Subphase</th>
              <th className="py-4 font-bold text-[10px] uppercase tracking-wider">Amount</th>
              <th className="py-4 font-bold text-[10px] uppercase tracking-wider">Payment Method</th>
              <th className="py-4 font-bold text-[10px] uppercase tracking-wider">Bank Name</th>
              <th className="py-4 font-bold text-[10px] uppercase tracking-wider">Account No</th>
              <th className="py-4 font-bold text-[10px] uppercase tracking-wider">Branch Code</th>
            </tr>
          </thead>
          <tbody>
            {requisitionsToPrint.map(req => {
              const contact = contacts.find(c => c.id === req.contactId);
              const project = projects.find(p => p.id === req.projectId);
              
              let paymentMethod = 'Bank Account';
              let bankName = contact?.bankDetails?.bankName || 'None';
              let accountNo = contact?.bankDetails?.accountNumber || 'None';
              let branchCode = contact?.bankDetails?.branchCode || 'None';

              if (contact?.bankDetails?.type === 'Cash') {
                paymentMethod = 'Cash';
                bankName = 'None';
                accountNo = 'None';
                branchCode = 'None';
              } else if (contact?.bankDetails?.type === 'Cash Send') {
                paymentMethod = 'Cash Send';
                bankName = 'Cash Send';
                accountNo = contact.bankDetails.cellphoneNumber || contact.contactNumber || 'None';
                branchCode = 'None';
              }

              return (
                <tr key={req.id} className="border-b border-slate-100">
                  <td className="py-4 text-[10px] font-bold">{req.status}</td>
                  <td className="py-4 text-xs font-bold">
                    {req.lineItems?.length > 0 
                      ? req.lineItems.map(i => i.invoiceNumber).join(', ')
                      : (req.invoiceNumber || 'N/A')}
                  </td>
                  <td className="py-4 text-xs">{formatDate(req.date)}</td>
                  <td className="py-4 text-xs">{contact?.name || 'N/A'}</td>
                  <td className="py-4 text-xs">
                    {req.lineItems?.length > 0
                      ? [...new Set(req.lineItems.map(i => projects.find(p => p.id === i.projectId)?.name).filter(Boolean))].join(', ')
                      : (project?.name || 'N/A')}
                  </td>
                  <td className="py-4 text-xs">
                    {req.lineItems?.length > 0
                      ? req.lineItems.map(i => i.phase).filter(Boolean).join(', ')
                      : (req.subPhase || req.phase || 'N/A')}
                  </td>
                  <td className="py-4 text-xs font-bold">{formatCurrency(req.totalAmount || req.amount || 0)}</td>
                  <td className="py-4 text-xs">{paymentMethod}</td>
                  <td className="py-4 text-xs">{bankName}</td>
                  <td className="py-4 text-xs">{accountNo}</td>
                  <td className="py-4 text-xs">{branchCode}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900">
              <td colSpan={5} className="py-4 font-bold text-right">Total:</td>
              <td className="py-4 font-bold">{formatCurrency(requisitionsToPrint.reduce((acc, r) => acc + (r.totalAmount || r.amount || 0), 0))}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-20 grid grid-cols-2 gap-y-16 gap-x-20">
          <div className="border-t border-slate-900 pt-4">
            <p className="text-sm font-bold uppercase tracking-widest">Requester Signature</p>
            <div className="flex justify-between mt-4">
              <p className="text-xs text-slate-400 italic">Name: ________________________</p>
              <p className="text-xs text-slate-400 italic">Date: ________________________</p>
            </div>
          </div>
          <div className="border-t border-slate-900 pt-4">
            <p className="text-sm font-bold uppercase tracking-widest">Reviewer Signature</p>
            <div className="flex justify-between mt-4">
              <p className="text-xs text-slate-400 italic">Name: ________________________</p>
              <p className="text-xs text-slate-400 italic">Date: ________________________</p>
            </div>
          </div>
          <div className="border-t border-slate-900 pt-4">
            <p className="text-sm font-bold uppercase tracking-widest">Financial Manager Signature</p>
            <div className="flex justify-between mt-4">
              <p className="text-xs text-slate-400 italic">Name: ________________________</p>
              <p className="text-xs text-slate-400 italic">Date: ________________________</p>
            </div>
          </div>
          <div className="border-t border-slate-900 pt-4">
            <p className="text-sm font-bold uppercase tracking-widest">CEO Signature</p>
            <div className="flex justify-between mt-4">
              <p className="text-xs text-slate-400 italic">Name: ________________________</p>
              <p className="text-xs text-slate-400 italic">Date: ________________________</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (viewingReq) {
    return (
      <>
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button onClick={closeViewingReq} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft size={20} />
            Back to list
          </button>
          
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-8 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Requisition Details</p>
              <h2 className="text-2xl font-bold text-slate-900">
                {viewingReq.lineItems?.length > 0 
                  ? (viewingReq.lineItems.length === 1 ? `Invoice: ${viewingReq.lineItems[0].invoiceNumber}` : `${viewingReq.lineItems.length} Invoices`)
                  : (viewingReq.invoiceNumber || 'Requisition Details')}
              </h2>
            </div>
            <div className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold",
              viewingReq.status === 'Approved' ? "bg-emerald-50 text-emerald-600" :
              viewingReq.status === 'Rejected' ? "bg-rose-50 text-rose-600" :
              "bg-blue-50 text-blue-600"
            )}>
              {viewingReq.status}
            </div>
          </div>
          
          <div className="p-8 border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <DetailItem label="Date" value={formatDate(viewingReq.date)} />
            <DetailItem label="Total Amount" value={formatCurrency(viewingReq.totalAmount || viewingReq.amount || 0)} />
            <DetailItem label="Contact" value={contacts.find(c => c.id === viewingReq.contactId)?.name || 'Unknown'} />
            <DetailItem label="Payment Date" value={formatDate(viewingReq.paymentDate)} />
            <div className="md:col-span-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Payment Status</p>
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                viewingReq.status === 'Paid' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
              )}>
                {viewingReq.status === 'Paid' ? 'Paid' : 'Outstanding'}
              </span>
            </div>
            <div className="md:col-span-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Created By</p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-600">
                  {viewingReq.creatorName?.charAt(0) || 'U'}
                </div>
                <p className="text-slate-900 font-medium text-sm">{viewingReq.creatorName}</p>
              </div>
            </div>
          </div>

          {viewingReq.lineItems && viewingReq.lineItems.length > 0 && (
            <div className="p-8 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileText size={18} className="text-blue-500" />
                Line Items
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-slate-400 uppercase font-bold border-b border-slate-100">
                    <tr>
                      <th className="pb-3 pr-4">Invoice</th>
                      <th className="pb-3 pr-4">Description</th>
                      <th className="pb-3 pr-4">Project / Phase</th>
                      <th className="pb-3 pr-4">Dept / CC</th>
                      <th className="pb-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {viewingReq.lineItems.map((item, i) => (
                      <tr key={i}>
                        <td className="py-3 pr-4 font-medium text-slate-900">{item.invoiceNumber}</td>
                        <td className="py-3 pr-4 text-slate-500">{item.description}</td>
                        <td className="py-3 pr-4 text-slate-500">
                          {projects.find(p => p.id === item.projectId)?.name || 'N/A'}
                          <div className="text-[10px] opacity-60">{item.phase} {item.subPhase ? `• ${item.subPhase}` : ''}</div>
                        </td>
                        <td className="py-3 pr-4 text-slate-500">
                          {departments.find(d => d.id === item.departmentId)?.name || 'N/A'}
                          <div className="text-[10px] opacity-60">{chartOfAccounts.find(cc => cc.id === item.chartOfAccountId)?.name || 'N/A'}</div>
                        </td>
                        <td className="py-3 text-right font-bold text-slate-900">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {(!viewingReq.lineItems || viewingReq.lineItems.length === 0) && (
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 border-b border-slate-100">
              <DetailItem label="Invoice Number" value={viewingReq.invoiceNumber || 'N/A'} />
              <DetailItem label="Project" value={projects.find(p => p.id === viewingReq.projectId)?.name || 'N/A'} />
              <DetailItem label="Department" value={departments.find(d => d.id === viewingReq.departmentId)?.name || 'N/A'} />
              <DetailItem label="Chart of Account" value={chartOfAccounts.find(cc => cc.id === viewingReq.chartOfAccountId)?.name || 'N/A'} />
              <DetailItem label="Phase" value={viewingReq.phase || 'N/A'} />
              <DetailItem label="Sub-Phase" value={viewingReq.subPhase || 'N/A'} />
              <div className="md:col-span-2">
                <DetailItem label="Description" value={viewingReq.description || 'N/A'} />
              </div>
            </div>
          )}

          <div className="p-8 border-t border-slate-100">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <History size={18} className="text-slate-400" />
              Approval History
            </h3>
            <div className="space-y-4">
              {viewingReq.approvalHistory?.map((h, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm",
                      h.action === 'Submitted' ? "bg-blue-500" :
                      h.action === 'Approved' ? "bg-emerald-500" : "bg-rose-500"
                    )}>
                      {h.action === 'Submitted' ? <Upload size={14} /> :
                       h.action === 'Approved' ? <Check size={14} /> : <Ban size={14} />}
                    </div>
                    {i < viewingReq.approvalHistory.length - 1 && <div className="w-0.5 h-full bg-slate-100 my-1" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-bold text-slate-900">{h.action} by {h.userName}</p>
                    <p className="text-xs text-slate-500">{h.userRole} • {formatDate(h.date)}</p>
                    {h.comment && (
                      <div className="mt-2 p-3 bg-slate-50 rounded-xl text-sm text-slate-600 border border-slate-100 italic">
                        "{h.comment}"
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-8 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">Gemini Auditor</h3>
              <button
                onClick={() => handleGeminiAudit(viewingReq)}
                disabled={isAuditing}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                {isAuditing ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                {isAuditing ? 'Auditing...' : 'Run Audit'}
              </button>
            </div>
            
            {auditResult && (
              <div className="bg-white border border-indigo-100 rounded-2xl p-6 text-sm text-slate-700 shadow-sm prose prose-slate max-w-none">
                <div className="flex items-center gap-2 text-indigo-600 mb-3">
                  <Sparkles size={18} />
                  <span className="font-bold uppercase tracking-wider text-xs">Audit Report</span>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">
                  {auditResult}
                </div>
              </div>
            )}
            
            {!auditResult && !isAuditing && (
              <p className="text-xs text-slate-500 italic">
                Use Gemini to analyse this requisition for risks and compliance.
              </p>
            )}
          </div>

          <div className="p-8 border-t border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-900 mb-4">Attachments</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {viewingReq.attachments?.map((file: any, index: number) => (
                <div key={index} className="group relative aspect-square bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center p-4 text-center transition-all hover:border-blue-200 hover:bg-blue-50/30 shadow-sm">
                  <FileText size={32} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <span className="text-[10px] font-medium text-slate-500 mt-2 line-clamp-2">{file.name}</span>
                  <button 
                    onClick={() => viewAttachment(file)}
                    className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 group-hover:opacity-100 rounded-2xl transition-all"
                  >
                    <Eye className="text-white" size={24} />
                  </button>
                </div>
              ))}
              {(!viewingReq.attachments || viewingReq.attachments.length === 0) && (
                <p className="col-span-full text-xs text-slate-400 italic">No attachments uploaded.</p>
              )}
            </div>
          </div>

            {profile?.role !== 'Requester' && viewingReq.status !== 'Rejected' && (
              <div className="p-8 border-t border-slate-100 flex gap-4">
                <button 
                  onClick={() => {
                    setSelectedIds([viewingReq.id]);
                    setIsPrintMode(true);
                  }}
                  className="flex-1 bg-slate-900 text-white p-4 rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                >
                  <Eye size={20} /> PDF Preview
                </button>
                {(viewingReq.status !== 'Approved' && viewingReq.status !== 'Paid') && (
                  <>
                    {((viewingReq.status === 'Draft' || viewingReq.status === 'Submitted' || viewingReq.status.startsWith('Awaiting')) && (viewingReq.createdBy === user?.uid || ['Super User', 'Financial Manager', 'CEO/CFO', 'Manager'].includes(profile?.role || ''))) && (
                      <button 
                        onClick={() => {
                          const req = viewingReq;
                          setSelectedReq(req);
                          setFormData({
                            date: req.date,
                            contactId: req.contactId,
                            lineItems: req.lineItems || [{
                              id: Math.random().toString(36).substr(2, 9),
                              invoiceNumber: req.invoiceNumber || '',
                              chartOfAccountId: req.chartOfAccountId || '',
                              departmentId: req.departmentId || '',
                              projectId: req.projectId || '',
                              phase: req.phase || '',
                              subPhase: req.subPhase || '',
                              description: req.description || '',
                              amount: req.amount || 0
                            }],
                            paymentDate: req.paymentDate || '',
                            isException: req.isException || false,
                            attachments: req.attachments || [],
                            departmentId: req.departmentId || ''
                          });
                          setViewingReq(null);
                          setIsModalOpen(true);
                        }}
                        className="flex-1 bg-blue-600 text-white p-4 rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus size={20} /> Edit
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        if (profile.role === 'Super User') {
                          setIsSuperUserApprovalModalOpen(true);
                        } else {
                          handleApprove(viewingReq);
                        }
                      }}
                      className="flex-1 bg-emerald-600 text-white p-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Check size={20} /> Approve
                    </button>
                  </>
                )}
                <button 
                  onClick={() => setRejectingReq(viewingReq)}
                  className="flex-1 bg-rose-600 text-white p-4 rounded-2xl font-bold hover:bg-rose-700 transition-all flex items-center justify-center gap-2"
                >
                  <Ban size={20} /> {viewingReq.status === 'Approved' ? 'Void / Reject' : 'Reject'}
                </button>
              </div>
            )}
        </div>
      </div>

      {isMarkingAsPaid && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Mark as Paid</h2>
              <button onClick={() => setIsMarkingAsPaid(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <p className="text-slate-600">Please select the payment date for the selected requisitions ({selectedIds.length}):</p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Payment Date (Optional)</label>
                <input 
                  type="date" 
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500"
                  value={paidDate}
                  onChange={e => setPaidDate(e.target.value)}
                />
              </div>
              <button
                onClick={handleMarkAsPaid}
                className="w-full bg-slate-900 text-white p-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {isSuperUserApprovalModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Super User Approval</h2>
              <button onClick={() => setIsSuperUserApprovalModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <p className="text-slate-600">Please indicate on whose behalf you are approving this requisition:</p>
              <div className="space-y-3">
                {(['Manager', 'Financial Manager', 'CEO/CFO', 'Both'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setSuperUserApprovalType(type)}
                    className={cn(
                      "w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between",
                      superUserApprovalType === type 
                        ? "border-blue-600 bg-blue-50 text-blue-600" 
                        : "border-slate-100 hover:border-slate-200 text-slate-500"
                    )}
                  >
                    <span className="font-bold">{type === 'Both' ? 'Approve for Both (Full Approval)' : `Approve for ${type}`}</span>
                    {superUserApprovalType === type && <Check size={20} />}
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleApprove(viewingReq, superUserApprovalType)}
                className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
              >
                Confirm Approval
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Requisitions</h1>
          <p className="text-slate-500">Track and manage payment requests.</p>
        </div>
        <div className="flex gap-3">
          <div className="hidden md:flex items-center bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <button 
              onClick={() => setIsPrintMode(true)}
              disabled={requisitions.length === 0}
              className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50 border-r border-slate-200"
            >
              <Eye size={18} /> PDF Preview
            </button>
            <button 
              onClick={handleExportCSV}
              disabled={isExporting || requisitions.length === 0}
              className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50 border-r border-slate-200"
            >
              CSV
            </button>
            <button 
              onClick={handleExportJSON}
              disabled={isExporting || requisitions.length === 0}
              className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              JSON
            </button>
          </div>
          {selectedIds.length > 0 && (
            <div className="flex gap-2">
              {profile?.role !== 'Requester' && (
                <button 
                  onClick={handleBulkApprove}
                  className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                >
                  <Check size={20} />
                  Approve Selected ({selectedIds.length})
                </button>
              )}
              {requisitions.filter(r => selectedIds.includes(r.id)).every(r => r.status === 'Approved') && (
                <button 
                  onClick={() => setIsMarkingAsPaid(true)}
                  className="flex items-center justify-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                >
                  <CheckCircle2 size={20} />
                  Mark as Paid ({selectedIds.length})
                </button>
              )}
            </div>
          )}
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            <Plus size={20} />
            New Requisition
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MiniStat label="Pending" amount={stats.pending} color="blue" />
        <MiniStat label="Submitted" amount={stats.submitted} color="amber" />
        <MiniStat label="Approved" amount={stats.approved} color="emerald" />
        <MiniStat label="Paid" amount={stats.paid} color="slate" />
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-50 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
              {(['All', 'Draft', 'Awaiting Departmental Approval', 'Awaiting Finance Approval', 'Awaiting CEO/CFO Approval', 'Approved', 'Pending Payments', 'Paid', 'Rejected'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
                    filter === s ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Fuzzy search requisitions..." 
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase whitespace-nowrap">Date Range:</span>
              <div className="flex items-center gap-2 flex-1">
                <input 
                  type="date" 
                  className="flex-1 p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none"
                  value={dateRange.start}
                  onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                />
                <span className="text-slate-300">-</span>
                <input 
                  type="date" 
                  className="flex-1 p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none"
                  value={dateRange.end}
                  onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase whitespace-nowrap">Cycle Due:</span>
              <select 
                className="flex-1 p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none"
                value={paymentCycleFilter}
                onChange={e => setPaymentCycleFilter(e.target.value)}
              >
                <option value="All">All Cycles</option>
                {paymentCycles.flatMap(c => c.paymentDates).sort().map((d, i) => (
                  <option key={i} value={d}>{formatDate(d)}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end">
              <button 
                onClick={() => { setFilter('All'); setDateRange({ start: '', end: '' }); setPaymentCycleFilter('All'); }}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-slate-400 text-xs uppercase tracking-widest font-bold">
              <tr>
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300" 
                    onChange={(e) => setSelectedIds(e.target.checked ? filteredRequisitions.map(r => r.id) : [])}
                  />
                </th>
                <th className="px-6 py-4">Invoice / Date</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Project</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredRequisitions.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300" 
                      checked={selectedIds.includes(req.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds([...selectedIds, req.id]);
                        else setSelectedIds(selectedIds.filter(id => id !== req.id));
                      }}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">
                      {req.lineItems?.length > 0 
                        ? (req.lineItems.length === 1 ? req.lineItems[0].invoiceNumber : `${req.lineItems.length} Invoices`)
                        : (req.invoiceNumber || 'N/A')}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <UserIcon size={10} />
                      <span>{req.creatorName} • {formatDate(req.date)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-slate-700">
                      {contacts.find(c => c.id === req.contactId)?.name || 'Unknown'}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-500">
                      {req.lineItems?.length > 0 
                        ? [...new Set(req.lineItems.map(item => projects.find(p => p.id === item.projectId)?.name).filter(Boolean))].join(', ') || 'N/A'
                        : (projects.find(p => p.id === req.projectId)?.name || 'N/A')}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">{formatCurrency(req.totalAmount || req.amount || 0)}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      req.status === 'Approved' ? "bg-emerald-50 text-emerald-600" :
                      req.status === 'Paid' ? "bg-slate-100 text-slate-600" :
                      req.status === 'Rejected' ? "bg-rose-50 text-rose-600" :
                      req.status === 'Draft' ? "bg-slate-100 text-slate-500" :
                      "bg-blue-50 text-blue-600"
                    )}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setViewingReq(req)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Eye size={18} />
                        </button>
                        {req.status === 'Approved' && (
                          <button 
                            onClick={() => {
                              setSelectedIds([req.id]);
                              setIsMarkingAsPaid(true);
                            }} 
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Mark as Paid"
                          >
                            <CheckCircle2 size={18} />
                          </button>
                        )}
                        {((req.status === 'Draft' || req.status === 'Submitted' || req.status.startsWith('Awaiting')) && (req.createdBy === user?.uid || ['Super User', 'Financial Manager', 'CEO/CFO', 'Manager'].includes(profile?.role || ''))) && (
                          <button onClick={() => { 
                            setSelectedReq(req); 
                            setFormData({ 
                              date: req.date,
                              contactId: req.contactId,
                              lineItems: req.lineItems || [{
                                id: Math.random().toString(36).substr(2, 9),
                                invoiceNumber: req.invoiceNumber || '',
                                chartOfAccountId: req.chartOfAccountId || '',
                                departmentId: req.departmentId || '',
                                projectId: req.projectId || '',
                                phase: req.phase || '',
                                subPhase: req.subPhase || '',
                                description: req.description || '',
                                amount: req.amount || 0
                              }],
                              paymentDate: req.paymentDate || '',
                              isException: req.isException || false,
                              attachments: req.attachments || [],
                              departmentId: req.departmentId || ''
                            }); 
                            setIsModalOpen(true); 
                          }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Plus size={18} />
                          </button>
                        )}
                        {(req.createdBy === user?.uid || ['Super User', 'Financial Manager', 'CEO/CFO'].includes(profile?.role || '')) && (
                          <button onClick={() => handleDelete(req)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRequisitions.length === 0 && (
            <div className="py-20 text-center text-slate-400">
              <FileText size={48} className="mx-auto mb-4 opacity-10" />
              <p>No requisitions found</p>
            </div>
          )}
        </div>
      </div>

      {rejectingReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 space-y-6">
            <h2 className="text-xl font-bold text-slate-900">Reject Requisition</h2>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Reason for rejection</label>
              <textarea 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 h-32"
                placeholder="Explain why this requisition is being rejected..."
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => { setRejectingReq(null); setRejectionReason(''); }}
                className="flex-1 p-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleReject(rejectingReq)}
                disabled={!rejectionReason || loading}
                className="flex-1 bg-rose-600 text-white p-4 rounded-2xl font-bold hover:bg-rose-700 transition-all disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">{selectedReq ? 'Edit' : 'Create'} Requisition</h2>
              <button onClick={() => { setIsModalOpen(false); setSelectedReq(null); }} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 space-y-8 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Requisition Date</label>
                  <input
                    type="date"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">Contact / Vendor</label>
                    <button 
                      type="button"
                      onClick={() => setIsContactModalOpen(true)}
                      className="text-blue-600 hover:text-blue-700 text-xs font-bold flex items-center gap-1"
                    >
                      <Plus size={12} /> New Contact
                    </button>
                  </div>
                  <select
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.contactId}
                    onChange={e => setFormData({ ...formData, contactId: e.target.value })}
                  >
                    <option value="">Select Contact</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">Payment Date</label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-blue-600"
                        checked={formData.isException}
                        onChange={e => setFormData({ ...formData, isException: e.target.checked, paymentDate: '' })}
                      />
                      Exception Payment
                    </label>
                  </div>
                  {formData.isException ? (
                    <input
                      type="date"
                      className="w-full p-3 bg-rose-50 border border-rose-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none"
                      value={formData.paymentDate}
                      onChange={e => setFormData({ ...formData, paymentDate: e.target.value })}
                    />
                  ) : (
                    <select
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.paymentDate}
                      onChange={e => setFormData({ ...formData, paymentDate: e.target.value })}
                    >
                      <option value="">Select Cycle Date</option>
                      {paymentCycles.flatMap(c => c.paymentDates).sort().map((d, i) => (
                        <option key={i} value={d}>{formatDate(d)}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <FileText size={18} className="text-blue-500" />
                    Line Items (Invoices)
                  </h3>
                  <button 
                    type="button"
                    onClick={addLineItem}
                    className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all flex items-center gap-2"
                  >
                    <Plus size={14} /> Add Line Item
                  </button>
                </div>

                <div className="space-y-6">
                  {formData.lineItems.map((item, index) => (
                    <div key={item.id} className="p-6 bg-slate-50/50 border border-slate-100 rounded-2xl space-y-4 relative group">
                      <button 
                        type="button"
                        onClick={() => removeLineItem(item.id)}
                        className="absolute top-4 right-4 p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={16} />
                      </button>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invoice Number</label>
                          <input
                            type="text"
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="INV-001"
                            value={item.invoiceNumber}
                            onChange={e => updateLineItem(item.id, { invoiceNumber: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invoice Date</label>
                          <input
                            type="date"
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={item.invoiceDate}
                            onChange={e => updateLineItem(item.id, { invoiceDate: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">VAT Type</label>
                          <select
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={item.vatType}
                            onChange={e => updateLineItem(item.id, { vatType: e.target.value })}
                          >
                            <option value="Inclusive">Inclusive</option>
                            <option value="Exclusive">Exclusive</option>
                            <option value="No VAT">No VAT</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount (ZAR)</label>
                          <input
                            type="number"
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="0.00"
                            value={item.amount}
                            onChange={e => updateLineItem(item.id, { amount: Number(e.target.value) })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description (Max 50 chars)</label>
                            <button 
                              type="button"
                              onClick={() => handleMagicDescription(item.id)}
                              disabled={generatingDescription || !item.invoiceNumber || !formData.contactId}
                              className="text-blue-600 hover:text-blue-700 text-[10px] font-bold flex items-center gap-1 disabled:opacity-50"
                            >
                              {generatingDescription ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                              Smart
                            </button>
                          </div>
                          <input
                            type="text"
                            maxLength={50}
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Brief description..."
                            value={item.description}
                            onChange={e => updateLineItem(item.id, { description: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">VAT Amount</label>
                          <div className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500">
                            {formatCurrency(item.vatAmount)}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net Amount (Excl. VAT)</label>
                          <div className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500">
                            {formatCurrency(item.netAmount)}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department</label>
                          <select
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={item.departmentId}
                            onChange={e => updateLineItem(item.id, { departmentId: e.target.value })}
                          >
                            <option value="">Select Dept</option>
                            {departments.filter(d => d.name !== 'General').map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chart of Account</label>
                          <SearchableSelect 
                            options={activeChartOfAccounts}
                            value={item.chartOfAccountId}
                            onChange={(val) => updateLineItem(item.id, { chartOfAccountId: val })}
                            onAdd={handleAddChartOfAccount}
                            placeholder="Select CC"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project</label>
                          <select
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={item.projectId}
                            onChange={e => updateLineItem(item.id, { projectId: e.target.value, phase: '', subPhase: '' })}
                          >
                            <option value="">General (No Project)</option>
                            {projects.filter(p => p.status === 'Open' && (!item.departmentId || !p.departmentIds || p.departmentIds.length === 0 || p.departmentIds.includes(item.departmentId))).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phase</label>
                          <select
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={item.phase}
                            onChange={e => updateLineItem(item.id, { phase: e.target.value, subPhase: '' })}
                            disabled={!item.projectId}
                          >
                            <option value="">Select Phase</option>
                            {(projects.find(p => p.id === item.projectId)?.phases || []).map(p => (
                              <option key={p.id} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}

                  {formData.lineItems.length === 0 && (
                    <div className="py-12 border-2 border-dashed border-slate-100 rounded-3xl text-center">
                      <p className="text-slate-400 text-sm">No line items added yet. Click "Add Line Item" to begin.</p>
                    </div>
                  )}
                </div>

                <div className="p-6 bg-slate-900 rounded-2xl flex items-center justify-between text-white">
                  <span className="font-bold uppercase tracking-widest text-xs opacity-60">Total Requisition Amount</span>
                  <span className="text-2xl font-black">{formatCurrency(formData.lineItems.reduce((sum, item) => sum + Number(item.amount), 0))}</span>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-medium text-slate-700 block">Attachments</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:text-blue-500 hover:border-blue-200 transition-all gap-2 cursor-pointer">
                    <Upload size={24} />
                    <span className="text-[10px] font-bold uppercase">Upload</span>
                    <input type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                  {formData.attachments?.map((file: any, index: number) => (
                    <div key={index} className="relative aspect-square bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center p-2 text-center">
                      <FileText size={20} className="text-blue-500" />
                      <span className="text-[8px] font-medium text-slate-500 mt-1 line-clamp-2">{file.name}</span>
                      <button 
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== index) }))}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center hover:bg-rose-600 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 flex gap-4">
                <button
                  onClick={() => handleSubmit('Draft')}
                  disabled={submitting}
                  className="flex-1 bg-slate-100 text-slate-600 p-4 rounded-2xl font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  Save as Draft
                </button>
                <button
                  onClick={() => handleSubmit('Submitted')}
                  disabled={submitting}
                  className="flex-1 bg-blue-600 text-white p-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="animate-spin mx-auto" /> : 'Submit Requisition'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isContactModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Add New Contact</h2>
              <button onClick={() => setIsContactModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleAddContact} className="p-8 space-y-6 overflow-y-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Full Name / Company Name</label>
                <input
                  required
                  type="text"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  value={contactFormData.name}
                  onChange={e => setContactFormData({ ...contactFormData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Email Address</label>
                  <input
                    type="email"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={contactFormData.email}
                    onChange={e => setContactFormData({ ...contactFormData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Phone Number</label>
                  <input
                    type="tel"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={contactFormData.phone}
                    onChange={e => setContactFormData({ ...contactFormData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">Payment Details</h3>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setContactFormData({
                        ...contactFormData,
                        bankDetails: { ...contactFormData.bankDetails, type: 'Bank Account' }
                      })}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                        contactFormData.bankDetails.type === 'Bank Account'
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      Bank Account
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactFormData({
                        ...contactFormData,
                        bankDetails: { ...contactFormData.bankDetails, type: 'Cash Send' }
                      })}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                        contactFormData.bankDetails.type === 'Cash Send'
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      Cash Send / Mobile
                    </button>
                  </div>
                </div>

                {contactFormData.bankDetails.type === 'Bank Account' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Bank Name</label>
                      <select
                        required
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        value={contactFormData.bankDetails.bankName}
                        onChange={e => setContactFormData({ 
                          ...contactFormData, 
                          bankDetails: { ...contactFormData.bankDetails, bankName: e.target.value } 
                        })}
                      >
                        <option value="">Select Bank</option>
                        <option value="ABSA">ABSA</option>
                        <option value="Capitec">Capitec</option>
                        <option value="FNB">FNB</option>
                        <option value="Nedbank">Nedbank</option>
                        <option value="Standard Bank">Standard Bank</option>
                        <option value="TymeBank">TymeBank</option>
                        <option value="Discovery Bank">Discovery Bank</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Account Number</label>
                      <input
                        required
                        type="text"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        value={contactFormData.bankDetails.accountNumber}
                        onChange={e => setContactFormData({ 
                          ...contactFormData, 
                          bankDetails: { ...contactFormData.bankDetails, accountNumber: e.target.value } 
                        })}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                      <Upload size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">Mobile Payment (Cash Send)</p>
                      <p className="text-xs text-slate-500">Funds will be sent to the contact's phone number: <span className="font-bold text-blue-600">{contactFormData.phone || 'Not provided yet'}</span></p>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Save Contact'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isCCModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Add to Chart of Accounts</h2>
              <button onClick={() => setIsCCModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddCC} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Account Name</label>
                <input
                  required
                  type="text"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Marketing"
                  value={newCC}
                  onChange={e => setNewCC(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Save Account'}
              </button>
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
        loading={loading}
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

function MiniStat({ label, amount, color }: any) {
  const colors: any = {
    blue: "text-blue-600 bg-blue-50",
    amber: "text-amber-600 bg-amber-50",
    emerald: "text-emerald-600 bg-emerald-50",
  };
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <p className={cn("text-2xl font-bold", colors[color])}>{formatCurrency(amount)}</p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-slate-900 font-medium">{value}</p>
    </div>
  );
}

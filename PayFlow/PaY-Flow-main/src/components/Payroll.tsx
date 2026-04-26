import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { Employee, Deduction, PayrollRun, Department, ChartOfAccount, PayrollEmployeeRecord, TaxConfig, Contribution } from '../types';
import { 
  Users, 
  Plus, 
  Trash2, 
  Calendar, 
  Shield, 
  Loader2, 
  CheckCircle2, 
  Clock, 
  X, 
  AlertTriangle, 
  Download, 
  FileText, 
  Search,
  Filter,
  ChevronRight,
  Briefcase,
  Banknote,
  Sparkles,
  ArrowRight,
  Printer,
  FileSpreadsheet,
  UserPlus,
  RefreshCw,
  Wallet,
  Settings as SettingsIcon,
  Heart,
  PiggyBank,
  PieChart,
  TrendingUp
} from 'lucide-react';
import { handleFirestoreError, OperationType, cn, formatCurrency, formatDate, calculateSARS, getLastWorkingDayOfMonth } from '../lib/utils';
import { analysePayrollCosts } from '../services/geminiService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ConfirmationModal from './ConfirmationModal';
import PDFPreview from './PDFPreview';

export default function Payroll() {
  const { organisation, profile, isDemo, showInstallBtn, handleInstallClick, showToast } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'employees' | 'deductions' | 'runs' | 'tax'>('dashboard');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
  const [taxConfig, setTaxConfig] = useState<TaxConfig | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [isAddDeductionOpen, setIsAddDeductionOpen] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ isOpen: boolean, title: string, blobUrl: string | null, filename: string }>({
    isOpen: false,
    title: '',
    blobUrl: null,
    filename: ''
  });
  const [isProcessPayrollOpen, setIsProcessPayrollOpen] = useState(false);
  const [isEditEmployeeOpen, setIsEditEmployeeOpen] = useState(false);
  const [isEditTaxOpen, setIsEditTaxOpen] = useState(false);
  const [isAddCCModalOpen, setIsAddCCModalOpen] = useState(false);
  const [newCCName, setNewCCName] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const [previewData, setPreviewData] = useState<{
    title: string;
    columns: string[];
    rows: any[][];
    filename: string;
  } | null>(null);

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

  // Form states
  const [newEmployee, setNewEmployee] = useState<Partial<Employee>>({
    paymentDateType: 'Last Working Day',
    isUifContributor: true,
    status: 'Active'
  });
  const [newDeduction, setNewDeduction] = useState<Partial<Deduction>>({
    intervals: 1,
    status: 'Active'
  });

  useEffect(() => {
    if (isDemo) {
      import('../lib/demoData').then(demo => {
        setEmployees(demo.DEMO_EMPLOYEES);
        setDeductions(demo.DEMO_DEDUCTIONS);
        setDepartments(demo.DEMO_DEPARTMENTS);
        setChartOfAccounts(demo.DEMO_CHART_OF_ACCOUNTS);
        setLoading(false);
      });
      return;
    }

    if (!organisation || !auth.currentUser) {
      return;
    }

    // Clear previous data to prevent 'flashing' old org data
    setEmployees([]);
    setDeductions([]);
    setPayrollRuns([]);
    setDepartments([]);
    setChartOfAccounts([]);
    setPublicHolidays([]);
    setAiAnalysis(null);

    const unsubEmployees = onSnapshot(
      query(collection(db, 'employees'), where('organisationId', '==', organisation.id)),
      (snapshot) => setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'employees')
    );

    const unsubDeductions = onSnapshot(
      query(collection(db, 'deductions'), where('organisationId', '==', organisation.id)),
      (snapshot) => setDeductions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Deduction))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'deductions')
    );

    const unsubRuns = onSnapshot(
      query(collection(db, 'payrollRuns'), where('organisationId', '==', organisation.id), orderBy('month', 'desc')),
      (snapshot) => setPayrollRuns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PayrollRun))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'payrollRuns')
    );

    const unsubDepts = onSnapshot(
      query(collection(db, 'departments'), where('organisationId', '==', organisation.id)),
      (snapshot) => setDepartments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'departments')
    );

    const unsubCC = onSnapshot(
      query(collection(db, 'chartOfAccounts'), where('organisationId', '==', organisation.id)),
      (snapshot) => setChartOfAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChartOfAccount))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'chartOfAccounts')
    );

    const unsubHolidays = onSnapshot(
      query(collection(db, 'publicHolidays'), where('organisationId', '==', organisation.id)),
      (snapshot) => setPublicHolidays(snapshot.docs.map(doc => doc.data().date)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'publicHolidays')
    );

    const unsubTaxConfig = onSnapshot(
      doc(db, 'taxConfigs', '2026-2027'),
      (snapshot) => {
        if (snapshot.exists()) {
          setTaxConfig({ id: snapshot.id, ...snapshot.data() } as TaxConfig);
        } else {
          // Fallback to default if not in DB
          const defaultTax: TaxConfig = {
            id: '2026-2027',
            year: '2026-2027',
            primaryRebate: 17820,
            secondaryRebate: 9900,
            tertiaryRebate: 3300,
            taxThresholdUnder65: 99000,
            taxThreshold65To75: 153300,
            taxThreshold75Plus: 171600,
            brackets: [
              { min: 0, max: 237100, baseTax: 0, rate: 18 },
              { min: 237100, max: 370500, baseTax: 42678, rate: 26 },
              { min: 370500, max: 512800, baseTax: 77362, rate: 31 },
              { min: 512800, max: 673000, baseTax: 121475, rate: 36 },
              { min: 673000, max: 857900, baseTax: 179147, rate: 39 },
              { min: 857900, max: 1817000, baseTax: 251258, rate: 41 },
              { min: 1817000, max: null, baseTax: 644489, rate: 45 }
            ],
            medicalTaxCredits: {
              mainMember: 376,
              firstDependant: 376,
              additionalDependant: 254
            },
            retirementLimitPercentage: 27.5,
            retirementLimitCap: 430000,
            uifRate: 1,
            uifCap: 177.12,
            sdlRate: 1,
            sdlThreshold: 500000 / 12
          };
          setTaxConfig(defaultTax);
        }
      }
    );

    setLoading(false);

    return () => {
      unsubEmployees();
      unsubDeductions();
      unsubRuns();
      unsubDepts();
      unsubCC();
      unsubHolidays();
      unsubTaxConfig();
    };
  }, [organisation]);

  const handleAddChartOfAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      const newCC: ChartOfAccount = {
        id: Math.random().toString(36).substr(2, 9),
        name: newCCName,
        organisationId: organisation?.id || 'demo-org-123'
      };
      setChartOfAccounts(prev => [...prev, newCC]);
      if (isAddEmployeeOpen) {
        setNewEmployee(prev => ({ ...prev, chartOfAccountId: newCC.id }));
      } else if (isEditEmployeeOpen && editingEmployee) {
        setEditingEmployee(prev => prev ? ({ ...prev, chartOfAccountId: newCC.id }) : null);
      }
      setIsAddCCModalOpen(false);
      setNewCCName('');
      return;
    }

    if (!organisation || !newCCName) return;

    try {
      setLoading(true);
      const docRef = await addDoc(collection(db, 'chartOfAccounts'), {
        name: newCCName,
        organisationId: organisation.id,
        status: 'Active',
        createdAt: new Date().toISOString()
      });
      if (isAddEmployeeOpen) {
        setNewEmployee(prev => ({ ...prev, chartOfAccountId: docRef.id }));
      } else if (isEditEmployeeOpen && editingEmployee) {
        setEditingEmployee(prev => prev ? ({ ...prev, chartOfAccountId: docRef.id }) : null);
      }
      setIsAddCCModalOpen(false);
      setNewCCName('');
      showToast(`Account "${newCCName}" added to Chart of Accounts.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'chartOfAccounts');
    } finally {
      setLoading(false);
    }
  };

  const openAddEmployeeModal = () => {
    const salariesCC = chartOfAccounts.find(cc => cc.name.toLowerCase() === 'salaries and wages');
    setNewEmployee({
      paymentDateType: 'Last Working Day',
      isUifContributor: true,
      status: 'Active',
      chartOfAccountId: salariesCC?.id || '',
      medicalAidDependants: 0,
      contributions: [],
      dateOfBirth: '1990-01-01'
    });
    setIsAddEmployeeOpen(true);
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast("Actions are disabled in demo mode.", "warning");
      return;
    }
    if (!organisation || !newEmployee.name || !newEmployee.surname || !newEmployee.grossSalary || !newEmployee.dateOfBirth) return;

    try {
      setLoading(true);
      await addDoc(collection(db, 'employees'), {
        ...newEmployee,
        medicalAidDependants: newEmployee.medicalAidDependants || 0,
        contributions: newEmployee.contributions || [],
        organisationId: organisation.id,
        createdAt: new Date().toISOString()
      });
      setIsAddEmployeeOpen(false);
      setNewEmployee({ 
        paymentDateType: 'Last Working Day', 
        isUifContributor: true, 
        status: 'Active',
        medicalAidDependants: 0,
        contributions: [],
        dateOfBirth: '1990-01-01'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'employees');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDeduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast("Actions are disabled in demo mode.", "warning");
      return;
    }
    if (!organisation || !newDeduction.employeeId || !newDeduction.totalAmount || !newDeduction.intervals) return;

    try {
      setLoading(true);
      const amountPerInterval = Number(newDeduction.totalAmount) / Number(newDeduction.intervals);
      await addDoc(collection(db, 'deductions'), {
        ...newDeduction,
        remainingAmount: Number(newDeduction.totalAmount),
        amountPerInterval,
        organisationId: organisation.id,
        createdAt: new Date().toISOString()
      });
      setIsAddDeductionOpen(false);
      setNewDeduction({ intervals: 1, status: 'Active' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'deductions');
    } finally {
      setLoading(false);
    }
  };

  const processPayroll = async () => {
    if (isDemo) {
      showToast("Actions are disabled in demo mode.", "warning");
      return;
    }
    if (!organisation || !taxConfig) return;

    const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    const existingRun = payrollRuns.find(run => run.month === currentMonth);
    if (existingRun) {
      showToast("Payroll for this month has already been initiated.", "warning");
      return;
    }

    try {
      setLoading(true);
      const activeEmployees = employees.filter(e => e.status === 'Active');
      const records: PayrollEmployeeRecord[] = activeEmployees.map(emp => {
        // Apply manual deductions (loans etc)
        const empDeductions = deductions
          .filter(d => d.employeeId === emp.id && d.status === 'Active')
          .reduce((sum, d) => sum + d.amountPerInterval, 0);
        
        const result = calculateSARS(emp, taxConfig);
        
        return {
          ...result,
          deductions: result.deductions + empDeductions,
          netSalary: result.netSalary - empDeductions
        };
      });

      const totalGross = records.reduce((sum, r) => sum + r.grossSalary, 0);
      const totalPaye = records.reduce((sum, r) => sum + r.paye, 0);
      const totalUif = records.reduce((sum, r) => sum + r.uif, 0);
      const totalDeductions = records.reduce((sum, r) => sum + r.deductions, 0);
      const totalNet = records.reduce((sum, r) => sum + r.netSalary, 0);

      const paymentDate = getLastWorkingDayOfMonth(
        new Date().getFullYear(),
        new Date().getMonth(),
        publicHolidays
      );

      await addDoc(collection(db, 'payrollRuns'), {
        month: currentMonth,
        organisationId: organisation.id,
        status: 'Draft',
        totalGross,
        totalPaye,
        totalUif,
        totalDeductions,
        totalNet,
        records,
        paymentDate,
        createdAt: new Date().toISOString()
      });

      // Generate EMP201 Payment Requisition automatically
      const totalSars = totalPaye + (totalUif * 2) + records.reduce((sum, r) => sum + r.sdl, 0);
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const dueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 7).toISOString().split('T')[0];

      await addDoc(collection(db, 'requisitions'), {
        organisationId: organisation.id,
        invoiceNumber: `EMP201-${currentMonth.replace(' ', '-')}`,
        contactId: 'SARS-INTERNAL',
        contactName: 'SARS EMP201',
        amount: totalSars,
        description: `EMP201 Monthly Submission for ${currentMonth}`,
        status: 'Awaiting Departmental Approval',
        category: 'Statutory',
        priority: 'High',
        dueDate,
        createdBy: profile?.uid,
        createdAt: new Date().toISOString(),
        items: [
          { description: 'PAYE', amount: totalPaye },
          { description: 'UIF (Employee + Employer)', amount: totalUif * 2 },
          { description: 'SDL', amount: records.reduce((sum, r) => sum + r.sdl, 0) }
        ]
      });

      setIsProcessPayrollOpen(false);
      showToast('Payroll processed successfully! Draft run and EMP201 requisition generated.', 'success');
      setActiveTab('runs');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'payrollRuns');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (runId: string, newStatus: 'Submitted' | 'Approved') => {
    if (isDemo) {
      showToast("Actions are disabled in demo mode.", "warning");
      return;
    }
    try {
      setLoading(true);
      const updateData: any = { status: newStatus };
      if (newStatus === 'Submitted') {
        updateData.submittedBy = profile?.uid;
        updateData.submittedAt = new Date().toISOString();
      } else if (newStatus === 'Approved') {
        updateData.approvedBy = profile?.uid;
        updateData.approvedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'payrollRuns', runId), updateData);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'payrollRuns');
    } finally {
      setLoading(false);
    }
  };

  const handleRollover = async (run: PayrollRun) => {
    if (isDemo) {
      showToast("Actions are disabled in demo mode.", "warning");
      return;
    }
    if (run.status !== 'Approved') {
      showToast("Payroll must be approved before rollover.", "warning");
      return;
    }

    try {
      setLoading(true);
      // Update deductions remaining amounts and employee paid status
      for (const record of run.records) {
        // Mark employee as having been paid
        await updateDoc(doc(db, 'employees', record.employeeId), { hasBeenPaid: true });

        const empDeductions = deductions.filter(d => d.employeeId === record.employeeId && d.status === 'Active');
        for (const d of empDeductions) {
          const newRemaining = d.remainingAmount - d.amountPerInterval;
          await updateDoc(doc(db, 'deductions', d.id), {
            remainingAmount: newRemaining,
            status: newRemaining <= 0 ? 'Completed' : 'Active'
          });
        }
      }
      showToast("Rollover successful. Deductions and employee records updated.", "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'deductions');
    } finally {
      setLoading(false);
    }
  };

  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast("Actions are disabled in demo mode.", "warning");
      return;
    }
    if (!editingEmployee) return;

    try {
      setLoading(true);
      const { id, ...data } = editingEmployee;
      await updateDoc(doc(db, 'employees', id), {
        ...data,
        medicalAidDependants: data.medicalAidDependants || 0,
        contributions: data.contributions || [],
        updatedAt: new Date().toISOString()
      });
      setIsEditEmployeeOpen(false);
      setEditingEmployee(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'employees');
    } finally {
      setLoading(false);
    }
  };

  const handleTerminateEmployee = (emp: Employee) => {
    setConfirmModal({
      isOpen: true,
      title: 'Terminate Employee',
      message: `Are you sure you want to terminate ${emp.name} ${emp.surname}? They will no longer appear in future payroll runs.`,
      variant: 'warning',
      onConfirm: async () => {
        try {
          setLoading(true);
          if (isDemo) {
            setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: 'Terminated' } : e));
          } else {
            await updateDoc(doc(db, 'employees', emp.id), { status: 'Terminated' });
          }
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, 'employees');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeleteEmployee = (emp: Employee) => {
    if (emp.hasBeenPaid) {
      setConfirmModal({
        isOpen: true,
        title: 'Cannot Delete',
        message: "This employee has already been paid and cannot be deleted. Please use the Terminate option instead to keep financial records intact.",
        variant: 'info',
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Delete Employee',
      message: `Are you sure you want to delete ${emp.name} ${emp.surname}? This action cannot be undone.`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          setLoading(true);
          if (isDemo) {
            setEmployees(prev => prev.filter(e => e.id !== emp.id));
          } else {
            await deleteDoc(doc(db, 'employees', emp.id));
          }
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'employees');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const generatePDF = (run: PayrollRun, type: 'summary' | 'detailed') => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42);
    doc.text(organisation?.name || 'Organisation', 14, 20);
    
    doc.setFontSize(14);
    doc.setTextColor(100, 116, 139);
    doc.text(`Payroll ${type === 'summary' ? 'Summary' : 'Detailed Report'} - ${run.month}`, 14, 30);

    if (type === 'summary') {
      autoTable(doc, {
        startY: 40,
        head: [['Description', 'Amount']],
        body: [
          ['Total Gross Salary', formatCurrency(run.totalGross)],
          ['Total PAYE Tax', formatCurrency(run.totalPaye)],
          ['Total UIF', formatCurrency(run.totalUif)],
          ['Total Deductions', formatCurrency(run.totalDeductions)],
          ['Total Net Payable', formatCurrency(run.totalNet)],
        ],
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }
      });
    } else {
      autoTable(doc, {
        startY: 40,
        head: [['Employee', 'Gross', 'PAYE', 'UIF', 'Deductions', 'Net']],
        body: run.records.map(r => [
          `${r.name} ${r.surname}`,
          formatCurrency(r.grossSalary),
          formatCurrency(r.paye),
          formatCurrency(r.uif),
          formatCurrency(r.deductions),
          formatCurrency(r.netSalary)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }
      });
    }

    // Signatures
    const finalY = (doc as any).lastAutoTable.finalY + 30;
    doc.setFontSize(10);
    doc.text('__________________________', 14, finalY);
    doc.text('Payroll Manager Signature', 14, finalY + 5);

    doc.text('__________________________', pageWidth / 2 - 25, finalY);
    doc.text('Financial Manager Signature', pageWidth / 2 - 25, finalY + 5);

    doc.text('__________________________', pageWidth - 65, finalY);
    doc.text('CEO/CFO Signature', pageWidth - 65, finalY + 5);

    const blobUrl = doc.output('bloburl') as unknown as string;
    setPdfPreview({
      isOpen: true,
      title: `Payroll ${type === 'summary' ? 'Summary' : 'Detailed Report'}`,
      blobUrl,
      filename: `Payroll_${run.month}_${type}.pdf`
    });
  };

  const exportToPDF = (title: string, columns: string[], rows: any[][], filename: string) => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(organisation?.name || 'Organisation', 14, 20);
    doc.setFontSize(14);
    doc.text(title, 14, 30);
    
    autoTable(doc, {
      startY: 40,
      head: [columns],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });
    
    const blobUrl = doc.output('bloburl') as unknown as string;
    setPdfPreview({
      isOpen: true,
      title: title,
      blobUrl,
      filename: `${filename}.pdf`
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const exportEmployees = () => {
    const filtered = employees.filter(e => 
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      e.surname.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const columns = ['Employee', 'Department', 'Gross Salary', 'UIF', 'Status'];
    const rows = filtered.map(emp => [
      `${emp.name} ${emp.surname}`,
      departments.find(d => d.id === emp.departmentId)?.name || 'N/A',
      formatCurrency(emp.grossSalary),
      emp.isUifContributor ? 'Contributor' : 'Exempt',
      emp.status
    ]);
    setPreviewData({ title: 'Employee List', columns, rows, filename: 'Employees' });
    setIsPreviewOpen(true);
  };

  const exportDeductions = () => {
    const columns = ['Employee', 'Description', 'Total Amount', 'Remaining', 'Monthly', 'Status'];
    const rows = deductions.map(ded => {
      const emp = employees.find(e => e.id === ded.employeeId);
      return [
        emp ? `${emp.name} ${emp.surname}` : 'Unknown',
        ded.description,
        formatCurrency(ded.totalAmount),
        formatCurrency(ded.remainingAmount),
        formatCurrency(ded.amountPerInterval),
        ded.status
      ];
    });
    setPreviewData({ title: 'Deductions List', columns, rows, filename: 'Deductions' });
    setIsPreviewOpen(true);
  };

  const exportPayrollRuns = () => {
    const columns = ['Month', 'Total Gross', 'Total Net', 'Status', 'Payment Date'];
    const rows = payrollRuns.map(run => [
      run.month,
      formatCurrency(run.totalGross),
      formatCurrency(run.totalNet),
      run.status,
      formatDate(run.paymentDate)
    ]);
    setPreviewData({ title: 'Payroll Runs History', columns, rows, filename: 'Payroll_Runs' });
    setIsPreviewOpen(true);
  };

  const currentRun = payrollRuns[0]; // Latest run
  const upcomingGross = employees.filter(e => e.status === 'Active').reduce((sum, e) => sum + e.grossSalary, 0);
  const upcomingNet = employees.filter(e => e.status === 'Active').reduce((sum, e) => {
    if (!taxConfig) return sum;
    const result = calculateSARS(e, taxConfig);
    const empDeductions = deductions.filter(d => d.employeeId === e.id && d.status === 'Active').reduce((s, d) => s + d.amountPerInterval, 0);
    return sum + (result.netSalary - empDeductions);
  }, 0);

  const upcomingSars = employees.filter(e => e.status === 'Active').reduce((sum, e) => {
    if (!taxConfig) return sum;
    const result = calculateSARS(e, taxConfig);
    return sum + result.paye + (result.employerUif + result.uif) + result.sdl;
  }, 0);

  const handleAnalysePayroll = async () => {
    if (!payrollRuns[0]) {
      showToast("No payroll runs available for analysis.", "info");
      return;
    }
    setIsAnalysing(true);
    try {
      const analysis = await analysePayrollCosts(payrollRuns[0]);
      setAiAnalysis(analysis);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalysing(false);
    }
  };

  const deptTotals = departments.map(dept => {
    const deptEmployees = employees.filter(e => e.departmentId === dept.id && e.status === 'Active');
    const total = deptEmployees.reduce((sum, e) => sum + e.grossSalary, 0);
    return { name: dept.name, total };
  });

  const handleUpdateTaxConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast("Actions are disabled in demo mode.", "warning");
      return;
    }
    if (!taxConfig) return;

    try {
      setLoading(true);
      await updateDoc(doc(db, 'taxConfigs', taxConfig.id), {
        ...taxConfig,
        updatedAt: new Date().toISOString()
      });
      setIsEditTaxOpen(false);
      showToast("Tax configuration updated successfully.", "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'taxConfigs');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadEmployeeTemplate = () => {
    const headers = [
      'Name',
      'Surname',
      'ID/Passport Number',
      'Employee Number',
      'Email',
      'Phone',
      'Gross Salary',
      'Bank Name',
      'Account Number',
      'Account Type',
      'Branch Code',
      'Department Name',
      'Position',
      'Date of Birth (YYYY-MM-DD)',
      'Medical Aid Dependants',
      'UIF Contributor (Yes/No)'
    ];
    const example = [
      'John',
      'Doe',
      '9001015000081',
      'EMP001',
      'john.doe@example.com',
      '0123456789',
      '25000',
      'FNB',
      '62000000001',
      'Savings',
      '250655',
      departments[0]?.name || 'Operations',
      'Specialist',
      '1990-01-01',
      '0',
      'Yes'
    ];
    const csvContent = [headers.join(','), example.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'employees_template.csv');
    link.click();
  };

  const handleImportEmployeesCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
     
      const headerMap: Record<string, number> = {};
      headers.forEach((h, i) => headerMap[h] = i);

      const employeesToImport: any[] = [];
      const salariesCC = chartOfAccounts.find(cc => cc.name.toLowerCase().includes('salary'))?.id || '';

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].split(',').map(c => c.trim());
        
        const getVal = (key: string) => {
          const idx = headers.findIndex(h => h.includes(key.toLowerCase()));
          return idx !== -1 ? cols[idx] : '';
        };

        const deptName = getVal('department');
        const deptId = departments.find(d => d.name.toLowerCase() === deptName.toLowerCase())?.id || departments[0]?.id || '';

        employeesToImport.push({
          name: getVal('name'),
          surname: getVal('surname'),
          idNumber: getVal('id/passport') || getVal('id number'),
          employeeNumber: getVal('employee number') || `EMP-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
          email: getVal('email'),
          phone: getVal('phone'),
          grossSalary: Number(getVal('gross salary')) || 0,
          bankName: getVal('bank name'),
          accountNumber: getVal('account number'),
          accountType: getVal('account type'),
          branchCode: getVal('branch code'),
          departmentId: deptId,
          position: getVal('position'),
          dateOfBirth: getVal('date of birth') || '1990-01-01',
          medicalAidDependants: Number(getVal('medical aid')) || 0,
          isUifContributor: getVal('uif').toLowerCase() !== 'no',
          status: 'Active',
          paymentDateType: 'Last Working Day',
          chartOfAccountId: salariesCC,
          organisationId: organisation.id,
          createdAt: new Date().toISOString()
        });
      }

      if (employeesToImport.length === 0) {
        showToast('No valid employees found in CSV', 'error');
        return;
      }

      setLoading(true);
      try {
        const promises = employeesToImport.map(emp => addDoc(collection(db, 'employees'), emp));
        await Promise.all(promises);
        showToast(`Successfully imported ${employeesToImport.length} employees`, 'success');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'employees');
      } finally {
        setLoading(false);
        if (importInputRef.current) importInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Payroll Management</h1>
          <p className="text-slate-500 mt-1">Manage employees, deductions, and monthly payroll processing</p>
        </div>
        <div className="flex items-center gap-3">
          {showInstallBtn && (
            <button 
              onClick={handleInstallClick}
              className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg"
            >
              <Download size={20} />
              Download App
            </button>
          )}
          <button 
            onClick={() => setIsProcessPayrollOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            <RefreshCw size={20} />
            Process Monthly Payroll
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100 w-fit">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: PieChart },
          { id: 'employees', label: 'Employees', icon: Users },
          { id: 'deductions', label: 'Deductions', icon: TrendingUp },
          { id: 'runs', label: 'Payroll Runs', icon: Clock },
          { id: 'tax', label: 'Tax Settings', icon: SettingsIcon }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
              activeTab === tab.id ? "bg-slate-900 text-white shadow-lg" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                <Banknote size={24} />
              </div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Upcoming Gross Bill</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(upcomingGross)}</h3>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
                <Wallet size={24} />
              </div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Upcoming Net Payable</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(upcomingNet)}</h3>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
                <Shield size={24} />
              </div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Upcoming SARS EMP201</p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1">{formatCurrency(upcomingSars)}</h3>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
                <Users size={24} />
              </div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Total Employees</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{employees.length}</h3>
            </div>
          </div>

          {/* AI Analysis Section */}
          <div className="bg-slate-900 rounded-[2rem] p-8 text-white relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-blue-400 mb-4">
                  <Sparkles size={20} />
                  <span className="font-bold uppercase tracking-widest text-xs">AI Budget Advisor</span>
                </div>
                <h2 className="text-3xl font-bold mb-4">Analyse your payroll costs with Gemini</h2>
                <p className="text-slate-400 text-lg">Get deep insights into your statutory compliance, gross vs net distribution, and potential cost optimisations.</p>
                
                {aiAnalysis && (
                  <div className="mt-8 p-6 bg-white/5 rounded-2xl border border-white/10 prose prose-invert max-w-none">
                    <div className="text-slate-300 whitespace-pre-wrap">{aiAnalysis}</div>
                  </div>
                )}
              </div>
              <button 
                onClick={handleAnalysePayroll}
                disabled={isAnalysing}
                className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-bold hover:bg-blue-50 transition-all flex items-center gap-3 shrink-0 disabled:opacity-50"
              >
                {isAnalysing ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />}
                {isAnalysing ? 'Analysing...' : 'Analyse with AI'}
              </button>
            </div>
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 blur-[120px] -mr-48 -mt-48 rounded-full"></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <h3 className="text-xl font-bold text-slate-900 mb-6">Departmental Breakdown</h3>
              <div className="space-y-4">
                {deptTotals.map(dept => (
                  <div key={dept.name} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                        <Briefcase size={20} />
                      </div>
                      <span className="font-bold text-slate-700">{dept.name}</span>
                    </div>
                    <span className="font-bold text-slate-900">{formatCurrency(dept.total)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 p-8 rounded-3xl text-white shadow-xl shadow-slate-200">
              <h3 className="text-xl font-bold mb-6">Latest Payroll Run</h3>
              {currentRun ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Month</p>
                      <p className="text-lg font-bold">{currentRun.month}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-400 uppercase">Status</p>
                      <span className={cn(
                        "text-xs px-2 py-1 rounded-md font-bold uppercase",
                        currentRun.status === 'Approved' ? "bg-emerald-500/20 text-emerald-400" :
                        currentRun.status === 'Submitted' ? "bg-blue-500/20 text-blue-400" :
                        "bg-slate-500/20 text-slate-400"
                      )}>
                        {currentRun.status}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Total Net</span>
                      <span className="font-bold">{formatCurrency(currentRun.totalNet)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Payment Date</span>
                      <span className="font-bold">{formatDate(currentRun.paymentDate)}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab('runs')}
                    className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                  >
                    View Details
                    <ChevronRight size={18} />
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="mx-auto text-slate-700 mb-4" size={48} />
                  <p className="text-slate-400">No payroll runs yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'employees' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 max-w-2xl">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  placeholder="Search employees..."
                  className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                onClick={exportEmployees}
                className="flex items-center gap-2 bg-white text-slate-600 px-6 py-3 rounded-2xl font-bold border border-slate-200 hover:bg-slate-50 transition-all"
              >
                <Printer size={20} />
                Export/Print
              </button>
            </div>
            <div className="flex bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
              <button 
                onClick={handleDownloadEmployeeTemplate}
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
                <FileSpreadsheet size={20} />
              </button>
              <input 
                type="file"
                ref={importInputRef}
                onChange={handleImportEmployeesCSV}
                className="hidden"
                accept=".csv"
              />
            </div>
            <button 
              onClick={openAddEmployeeModal}
              className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all"
            >
              <UserPlus size={20} />
              Onboard Employee
            </button>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Department</th>
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Gross Salary</th>
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">UIF</th>
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Payment Date</th>
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {employees.filter(e => 
                    e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    e.surname.toLowerCase().includes(searchTerm.toLowerCase())
                  ).map(emp => (
                    <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold">
                            {emp.name[0]}{emp.surname[0]}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{emp.name} {emp.surname}</p>
                            <p className="text-xs text-slate-500">ID: {emp.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        <span className="text-sm font-medium text-slate-600">
                          {departments.find(d => d.id === emp.departmentId)?.name || 'N/A'}
                        </span>
                      </td>
                      <td className="p-6">
                        <span className="font-bold text-slate-900">{formatCurrency(emp.grossSalary)}</span>
                      </td>
                      <td className="p-6">
                        <span className={cn(
                          "text-xs px-2 py-1 rounded-md font-bold uppercase",
                          emp.isUifContributor ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
                        )}>
                          {emp.isUifContributor ? 'Contributor' : 'Exempt'}
                        </span>
                      </td>
                      <td className="p-6">
                        <span className="text-sm text-slate-600">
                          {emp.paymentDateType === 'Last Working Day' ? 'Last Working Day' : `Day ${emp.customPaymentDay}`}
                        </span>
                      </td>
                      <td className="p-6">
                        <span className={cn(
                          "text-xs px-2 py-1 rounded-md font-bold uppercase",
                          emp.status === 'Active' ? "bg-emerald-50 text-emerald-600" : 
                          emp.status === 'Terminated' ? "bg-slate-100 text-slate-500" :
                          "bg-rose-50 text-rose-600"
                        )}>
                          {emp.status}
                        </span>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              setEditingEmployee(emp);
                              setIsEditEmployeeOpen(true);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Employee"
                          >
                            <FileText size={18} />
                          </button>
                          {emp.status !== 'Terminated' && (
                            <button 
                              onClick={() => handleTerminateEmployee(emp)}
                              className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Terminate Employee"
                            >
                              <AlertTriangle size={18} />
                            </button>
                          )}
                          <button 
                            onClick={() => handleDeleteEmployee(emp)}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Employee"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'deductions' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex justify-between items-center">
            <button 
              onClick={exportDeductions}
              className="flex items-center gap-2 bg-white text-slate-600 px-6 py-3 rounded-2xl font-bold border border-slate-200 hover:bg-slate-50 transition-all"
            >
              <Printer size={20} />
              Export/Print
            </button>
            <button 
              onClick={() => setIsAddDeductionOpen(true)}
              className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all"
            >
              <Plus size={20} />
              Add Deduction
            </button>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Description</th>
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Total Amount</th>
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Remaining</th>
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Intervals</th>
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Monthly</th>
                    <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {deductions.map(ded => {
                    const emp = employees.find(e => e.id === ded.employeeId);
                    return (
                      <tr key={ded.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-6">
                          <p className="font-bold text-slate-900">{emp ? `${emp.name} ${emp.surname}` : 'Unknown'}</p>
                        </td>
                        <td className="p-6">
                          <span className="text-sm text-slate-600">{ded.description}</span>
                        </td>
                        <td className="p-6">
                          <span className="font-bold text-slate-900">{formatCurrency(ded.totalAmount)}</span>
                        </td>
                        <td className="p-6">
                          <span className="font-bold text-rose-600">{formatCurrency(ded.remainingAmount)}</span>
                        </td>
                        <td className="p-6">
                          <span className="text-sm text-slate-600">{ded.intervals}</span>
                        </td>
                        <td className="p-6">
                          <span className="font-bold text-slate-900">{formatCurrency(ded.amountPerInterval)}</span>
                        </td>
                        <td className="p-6">
                          <span className={cn(
                            "text-xs px-2 py-1 rounded-md font-bold uppercase",
                            ded.status === 'Active' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
                          )}>
                            {ded.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'runs' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex justify-between items-center">
            <button 
              onClick={exportPayrollRuns}
              className="flex items-center gap-2 bg-white text-slate-600 px-6 py-3 rounded-2xl font-bold border border-slate-200 hover:bg-slate-50 transition-all"
            >
              <Printer size={20} />
              Export/Print
            </button>
          </div>
          {payrollRuns.map(run => (
            <div key={run.id} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm">
                    <Calendar size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{run.month}</h3>
                    <p className="text-sm text-slate-500">Payment Date: {formatDate(run.paymentDate)}</p>
                  </div>
                  <span className={cn(
                    "text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider",
                    run.status === 'Approved' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                    run.status === 'Submitted' ? "bg-blue-50 text-blue-600 border border-blue-100" :
                    "bg-slate-100 text-slate-500 border border-slate-200"
                  )}>
                    {run.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => generatePDF(run, 'summary')}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    title="Download Summary PDF"
                  >
                    <FileText size={20} />
                  </button>
                  <button 
                    onClick={() => generatePDF(run, 'detailed')}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    title="Download Detailed PDF"
                  >
                    <Printer size={20} />
                  </button>
                  
                  {run.status === 'Draft' && (profile?.role === 'Financial Manager' || profile?.role === 'CEO/CFO' || profile?.role === 'Super User') && (
                    <button 
                      onClick={() => handleUpdateStatus(run.id, 'Submitted')}
                      className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all text-sm"
                    >
                      Submit for Approval
                    </button>
                  )}
                  
                  {run.status === 'Submitted' && (profile?.role === 'CEO/CFO' || profile?.role === 'Super User' || profile?.role === 'Financial Manager') && (
                    <button 
                      onClick={() => handleUpdateStatus(run.id, 'Approved')}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-all text-sm"
                    >
                      Approve Payroll
                    </button>
                  )}

                  {run.status === 'Approved' && (
                    <button 
                      onClick={() => handleRollover(run)}
                      className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold hover:bg-slate-800 transition-all text-sm flex items-center gap-2"
                    >
                      <RefreshCw size={16} />
                      Rollover
                    </button>
                  )}
                </div>
              </div>
              <div className="p-6 grid grid-cols-2 md:grid-cols-5 gap-6">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gross Total</p>
                  <p className="text-lg font-bold text-slate-900">{formatCurrency(run.totalGross)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">PAYE Tax</p>
                  <p className="text-lg font-bold text-rose-600">{formatCurrency(run.totalPaye)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">UIF</p>
                  <p className="text-lg font-bold text-amber-600">{formatCurrency(run.totalUif)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Deductions</p>
                  <p className="text-lg font-bold text-rose-600">{formatCurrency(run.totalDeductions)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Net Payable</p>
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(run.totalNet)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'tax' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">SARS Tax Configuration</h2>
                <p className="text-slate-500">Current Tax Year: {taxConfig?.year || '2026/2027'}</p>
              </div>
              {['Super User', 'Financial Manager'].includes(profile?.role || '') && (
                <button 
                  className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2"
                  onClick={() => setIsEditTaxOpen(true)}
                >
                  <SettingsIcon size={20} />
                  Edit Configuration
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-6">
                <h3 className="font-bold text-slate-900 border-b pb-2">Rebates & Thresholds</h3>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Primary Rebate</span>
                    <span className="font-bold">{formatCurrency(taxConfig?.primaryRebate || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Secondary Rebate (65+)</span>
                    <span className="font-bold">{formatCurrency(taxConfig?.secondaryRebate || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tertiary Rebate (75+)</span>
                    <span className="font-bold">{formatCurrency(taxConfig?.tertiaryRebate || 0)}</span>
                  </div>
                  <div className="flex justify-between pt-4 border-t">
                    <span className="text-slate-500">Tax Threshold (&lt;65)</span>
                    <span className="font-bold">{formatCurrency(taxConfig?.taxThresholdUnder65 || 0)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="font-bold text-slate-900 border-b pb-2">Medical Tax Credits</h3>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Main Member</span>
                    <span className="font-bold">{formatCurrency(taxConfig?.medicalTaxCredits.mainMember || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">First Dependant</span>
                    <span className="font-bold">{formatCurrency(taxConfig?.medicalTaxCredits.firstDependant || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Additional Dependants</span>
                    <span className="font-bold">{formatCurrency(taxConfig?.medicalTaxCredits.additionalDependant || 0)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="font-bold text-slate-900 border-b pb-2">Statutory Limits</h3>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-slate-500">UIF Monthly Cap</span>
                    <span className="font-bold">{formatCurrency(taxConfig?.uifCap || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Retirement Limit (%)</span>
                    <span className="font-bold">27.5%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Retirement Cap (Annual)</span>
                    <span className="font-bold">{formatCurrency(taxConfig?.retirementLimitCap || 350000)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-12">
              <h3 className="font-bold text-slate-900 mb-6">Tax Brackets</h3>
              <div className="overflow-hidden rounded-2xl border border-slate-100">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase">Taxable Income Bracket</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase">Tax Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {taxConfig?.brackets.map((bracket, i) => (
                      <tr key={i}>
                        <td className="p-4 text-sm">
                          {bracket.min === 0 ? 'Up to ' : `${formatCurrency(bracket.min)} - `}
                          {bracket.max ? formatCurrency(bracket.max) : 'and above'}
                        </td>
                        <td className="p-4 text-sm font-bold">
                          {bracket.baseTax > 0 ? `${formatCurrency(bracket.baseTax)} + ` : ''}
                          {bracket.rate}% of amount above {formatCurrency(bracket.min)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {isAddEmployeeOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
          >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-2xl font-bold text-slate-900">Onboard New Employee</h2>
              <button onClick={() => setIsAddEmployeeOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddEmployee} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">First Name</label>
                  <input 
                    required
                    type="text"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={newEmployee.name || ''}
                    onChange={e => setNewEmployee({...newEmployee, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Surname</label>
                  <input 
                    required
                    type="text"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={newEmployee.surname || ''}
                    onChange={e => setNewEmployee({...newEmployee, surname: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Date of Birth</label>
                  <input 
                    required
                    type="date"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={newEmployee.dateOfBirth || ''}
                    onChange={e => setNewEmployee({...newEmployee, dateOfBirth: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Medical Aid Dependants</label>
                  <input 
                    type="number"
                    min="0"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={newEmployee.medicalAidDependants || 0}
                    onChange={e => setNewEmployee({...newEmployee, medicalAidDependants: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Department</label>
                  <select 
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={newEmployee.departmentId || ''}
                    onChange={e => setNewEmployee({...newEmployee, departmentId: e.target.value})}
                  >
                    <option value="">Select Department</option>
                    {departments.filter(d => d.name !== 'General').map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-slate-700">Chart of Account</label>
                    <button 
                      type="button"
                      onClick={() => setIsAddCCModalOpen(true)}
                      className="text-blue-600 hover:text-blue-700 text-xs font-bold flex items-center gap-1"
                    >
                      <Plus size={14} />
                      Add New
                    </button>
                  </div>
                  <select 
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={newEmployee.chartOfAccountId || ''}
                    onChange={e => setNewEmployee({...newEmployee, chartOfAccountId: e.target.value})}
                  >
                    <option value="">Select Account</option>
                    {chartOfAccounts.filter(c => c.status !== 'Archived').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Gross Monthly Salary</label>
                  <input 
                    required
                    type="number"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={newEmployee.grossSalary || ''}
                    onChange={e => setNewEmployee({...newEmployee, grossSalary: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">UIF Contributor</label>
                  <div className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <input 
                      type="checkbox"
                      className="w-5 h-5 text-blue-600 rounded"
                      checked={newEmployee.isUifContributor}
                      onChange={e => setNewEmployee({...newEmployee, isUifContributor: e.target.checked})}
                    />
                    <span className="text-sm text-slate-600">Employee contributes to UIF</span>
                  </div>
                </div>
              </div>

              {/* Recurring Contributions */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Heart className="text-rose-500" size={20} />
                    Recurring Contributions
                  </h3>
                  <button 
                    type="button"
                    onClick={() => {
                      const contributions = newEmployee.contributions || [];
                      setNewEmployee({
                        ...newEmployee,
                        contributions: [...contributions, { id: Math.random().toString(36).substr(2, 9), type: 'Other', description: '', employeeAmount: 0, employerAmount: 0, isFringeBenefit: false }]
                      });
                    }}
                    className="text-blue-600 hover:text-blue-700 text-sm font-bold flex items-center gap-1"
                  >
                    <Plus size={16} />
                    Add Contribution
                  </button>
                </div>
                
                <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {(newEmployee.contributions || []).map((contribution, index) => (
                    <div key={contribution.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="grid grid-cols-2 gap-4 flex-1">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Type</label>
                            <select 
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                              value={contribution.type}
                              onChange={e => {
                                const newContribs = [...(newEmployee.contributions || [])];
                                newContribs[index].type = e.target.value as any;
                                setNewEmployee({...newEmployee, contributions: newContribs});
                              }}
                            >
                              <option value="Medical Aid">Medical Aid</option>
                              <option value="Retirement Annuity">Retirement Annuity</option>
                              <option value="Other">Other Policy</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                            <input 
                              type="text"
                              placeholder="e.g. Discovery Health"
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                              value={contribution.description}
                              onChange={e => {
                                const newContribs = [...(newEmployee.contributions || [])];
                                newContribs[index].description = e.target.value;
                                setNewEmployee({...newEmployee, contributions: newContribs});
                              }}
                            />
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            const newContribs = (newEmployee.contributions || []).filter((_, i) => i !== index);
                            setNewEmployee({...newEmployee, contributions: newContribs});
                          }}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg ml-2"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Employee Amt</label>
                          <input 
                            type="number"
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                            value={contribution.employeeAmount}
                            onChange={e => {
                              const newContribs = [...(newEmployee.contributions || [])];
                              newContribs[index].employeeAmount = Number(e.target.value);
                              setNewEmployee({...newEmployee, contributions: newContribs});
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Employer Amt</label>
                          <input 
                            type="number"
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                            value={contribution.employerAmount}
                            onChange={e => {
                              const newContribs = [...(newEmployee.contributions || [])];
                              newContribs[index].employerAmount = Number(e.target.value);
                              setNewEmployee({...newEmployee, contributions: newContribs});
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-5">
                          <input 
                            type="checkbox"
                            id={`fringe-${index}`}
                            checked={contribution.isFringeBenefit}
                            onChange={e => {
                              const newContribs = [...(newEmployee.contributions || [])];
                              newContribs[index].isFringeBenefit = e.target.checked;
                              setNewEmployee({...newEmployee, contributions: newContribs});
                            }}
                          />
                          <label htmlFor={`fringe-${index}`} className="text-xs font-bold text-slate-600 cursor-pointer">Fringe Benefit</label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Payment Date Type</label>
                  <select 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={newEmployee.paymentDateType}
                    onChange={e => setNewEmployee({...newEmployee, paymentDateType: e.target.value as any})}
                  >
                    <option value="Last Working Day">Last Working Day of Month</option>
                    <option value="Custom">Custom Date</option>
                  </select>
                </div>
                {newEmployee.paymentDateType === 'Custom' && (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Custom Payment Day (1-31)</label>
                    <input 
                      required
                      type="number"
                      min="1"
                      max="31"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                      value={newEmployee.customPaymentDay || ''}
                      onChange={e => setNewEmployee({...newEmployee, customPaymentDay: Number(e.target.value)})}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsAddEmployeeOpen(false)}
                  className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" /> : 'Onboard Employee'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {isAddCCModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-2xl font-bold text-slate-900">Add to Chart of Accounts</h2>
              <button onClick={() => setIsAddCCModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddChartOfAccount} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Account Name</label>
                <input 
                  required
                  autoFocus
                  type="text"
                  placeholder="e.g. Salaries and Wages"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  value={newCCName}
                  onChange={e => setNewCCName(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsAddCCModalOpen(false)}
                  className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading || !newCCName}
                  className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" /> : 'Add Account'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {isAddDeductionOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-2xl font-bold text-slate-900">Add Deduction</h2>
              <button onClick={() => setIsAddDeductionOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddDeduction} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Employee</label>
                <select 
                  required
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  value={newDeduction.employeeId || ''}
                  onChange={e => setNewDeduction({...newDeduction, employeeId: e.target.value})}
                >
                  <option value="">Select Employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name} {e.surname}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Description</label>
                <input 
                  required
                  type="text"
                  placeholder="e.g. Loan Repayment"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  value={newDeduction.description || ''}
                  onChange={e => setNewDeduction({...newDeduction, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Total Amount</label>
                  <input 
                    required
                    type="number"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={newDeduction.totalAmount || ''}
                    onChange={e => setNewDeduction({...newDeduction, totalAmount: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Intervals (Months)</label>
                  <input 
                    required
                    type="number"
                    min="1"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={newDeduction.intervals || ''}
                    onChange={e => setNewDeduction({...newDeduction, intervals: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-sm text-blue-800">
                  Monthly Deduction: <strong>{formatCurrency(Number(newDeduction.totalAmount || 0) / Number(newDeduction.intervals || 1))}</strong>
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsAddDeductionOpen(false)}
                  className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" /> : 'Add Deduction'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {isEditEmployeeOpen && editingEmployee && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
          >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-2xl font-bold text-slate-900">Edit Employee</h2>
              <button onClick={() => setIsEditEmployeeOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleEditEmployee} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">First Name</label>
                  <input 
                    required
                    type="text"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingEmployee.name || ''}
                    onChange={e => setEditingEmployee({...editingEmployee, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Surname</label>
                  <input 
                    required
                    type="text"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingEmployee.surname || ''}
                    onChange={e => setEditingEmployee({...editingEmployee, surname: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Date of Birth</label>
                  <input 
                    required
                    type="date"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingEmployee.dateOfBirth || ''}
                    onChange={e => setEditingEmployee({...editingEmployee, dateOfBirth: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Medical Aid Dependants</label>
                  <input 
                    type="number"
                    min="0"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingEmployee.medicalAidDependants || 0}
                    onChange={e => setEditingEmployee({...editingEmployee, medicalAidDependants: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Department</label>
                  <select 
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingEmployee.departmentId || ''}
                    onChange={e => setEditingEmployee({...editingEmployee, departmentId: e.target.value})}
                  >
                    <option value="">Select Department</option>
                    {departments.filter(d => d.name !== 'General').map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-slate-700">Chart of Account</label>
                    <button 
                      type="button"
                      onClick={() => setIsAddCCModalOpen(true)}
                      className="text-blue-600 hover:text-blue-700 text-xs font-bold flex items-center gap-1"
                    >
                      <Plus size={14} />
                      Add New
                    </button>
                  </div>
                  <select 
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingEmployee.chartOfAccountId || ''}
                    onChange={e => setEditingEmployee({...editingEmployee, chartOfAccountId: e.target.value})}
                  >
                    <option value="">Select Account</option>
                    {chartOfAccounts.filter(c => c.status !== 'Archived').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Gross Monthly Salary</label>
                  <input 
                    required
                    type="number"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingEmployee.grossSalary || ''}
                    onChange={e => setEditingEmployee({...editingEmployee, grossSalary: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">UIF Contributor</label>
                  <div className="flex items-center gap-4 h-[50px]">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        checked={editingEmployee.isUifContributor === true}
                        onChange={() => setEditingEmployee({...editingEmployee, isUifContributor: true})}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm">Yes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        checked={editingEmployee.isUifContributor === false}
                        onChange={() => setEditingEmployee({...editingEmployee, isUifContributor: false})}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm">No</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Recurring Contributions */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Heart className="text-rose-500" size={20} />
                    Recurring Contributions
                  </h3>
                  <button 
                    type="button"
                    onClick={() => {
                      const contributions = editingEmployee.contributions || [];
                      setEditingEmployee({
                        ...editingEmployee,
                        contributions: [...contributions, { id: Math.random().toString(36).substr(2, 9), type: 'Other', description: '', employeeAmount: 0, employerAmount: 0, isFringeBenefit: false }]
                      });
                    }}
                    className="text-blue-600 hover:text-blue-700 text-sm font-bold flex items-center gap-1"
                  >
                    <Plus size={16} />
                    Add Contribution
                  </button>
                </div>
                
                <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {(editingEmployee.contributions || []).map((contribution, index) => (
                    <div key={contribution.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="grid grid-cols-2 gap-4 flex-1">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Type</label>
                            <select 
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                              value={contribution.type}
                              onChange={e => {
                                const newContribs = [...(editingEmployee.contributions || [])];
                                newContribs[index].type = e.target.value as any;
                                setEditingEmployee({...editingEmployee, contributions: newContribs});
                              }}
                            >
                              <option value="Medical Aid">Medical Aid</option>
                              <option value="Retirement Annuity">Retirement Annuity</option>
                              <option value="Other">Other Policy</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                            <input 
                              type="text"
                              placeholder="e.g. Discovery Health"
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                              value={contribution.description}
                              onChange={e => {
                                const newContribs = [...(editingEmployee.contributions || [])];
                                newContribs[index].description = e.target.value;
                                setEditingEmployee({...editingEmployee, contributions: newContribs});
                              }}
                            />
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            const newContribs = (editingEmployee.contributions || []).filter((_, i) => i !== index);
                            setEditingEmployee({...editingEmployee, contributions: newContribs});
                          }}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg ml-2"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Employee Amt</label>
                          <input 
                            type="number"
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                            value={contribution.employeeAmount}
                            onChange={e => {
                              const newContribs = [...(editingEmployee.contributions || [])];
                              newContribs[index].employeeAmount = Number(e.target.value);
                              setEditingEmployee({...editingEmployee, contributions: newContribs});
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Employer Amt</label>
                          <input 
                            type="number"
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                            value={contribution.employerAmount}
                            onChange={e => {
                              const newContribs = [...(editingEmployee.contributions || [])];
                              newContribs[index].employerAmount = Number(e.target.value);
                              setEditingEmployee({...editingEmployee, contributions: newContribs});
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-5">
                          <input 
                            type="checkbox"
                            id={`edit-fringe-${index}`}
                            checked={contribution.isFringeBenefit}
                            onChange={e => {
                              const newContribs = [...(editingEmployee.contributions || [])];
                              newContribs[index].isFringeBenefit = e.target.checked;
                              setEditingEmployee({...editingEmployee, contributions: newContribs});
                            }}
                          />
                          <label htmlFor={`edit-fringe-${index}`} className="text-xs font-bold text-slate-600 cursor-pointer">Fringe Benefit</label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Payment Date Type</label>
                  <select 
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingEmployee.paymentDateType || ''}
                    onChange={e => setEditingEmployee({...editingEmployee, paymentDateType: e.target.value as any})}
                  >
                    <option value="Last Working Day">Last Working Day</option>
                    <option value="Custom">Custom Date</option>
                  </select>
                </div>
                {editingEmployee.paymentDateType === 'Custom' && (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Payment Day (1-31)</label>
                    <input 
                      required
                      type="number"
                      min="1"
                      max="31"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                      value={editingEmployee.customPaymentDay || ''}
                      onChange={e => setEditingEmployee({...editingEmployee, customPaymentDay: Number(e.target.value)})}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsEditEmployeeOpen(false)}
                  className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {isProcessPayrollOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-2xl font-bold text-slate-900">Process Payroll</h2>
              <button onClick={() => setIsProcessPayrollOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-4 p-4 bg-amber-50 text-amber-800 rounded-2xl border border-amber-100">
                <AlertTriangle size={24} />
                <p className="text-sm">
                  This will generate a draft payroll run for <strong>{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</strong> based on current employee salaries and active deductions.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Active Employees</span>
                  <span className="font-bold text-slate-900">{employees.filter(e => e.status === 'Active').length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Estimated Gross Total</span>
                  <span className="font-bold text-slate-900">{formatCurrency(upcomingGross)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsProcessPayrollOpen(false)}
                  className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={processPayroll}
                  disabled={loading}
                  className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" /> : 'Generate Draft Payroll'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {isPreviewOpen && previewData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-end">
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            className="bg-white h-full w-full max-w-4xl shadow-2xl flex flex-col"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{previewData.title}</h2>
                <p className="text-sm text-slate-500">Preview and export your data</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => exportToPDF(previewData.title, previewData.columns, previewData.rows, previewData.filename)}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
                >
                  <Download size={18} />
                  Download PDF
                </button>
                <button 
                  onClick={handlePrint}
                  className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                >
                  <Printer size={18} />
                  Print
                </button>
                <button 
                  onClick={() => setIsPreviewOpen(false)} 
                  className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-8 bg-slate-100/50">
              <div className="bg-white p-8 shadow-lg rounded-sm min-h-full print:shadow-none print:p-0" id="printable-area">
                <div className="mb-8 flex justify-between items-start">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">{organisation?.name}</h1>
                    <p className="text-slate-500">{organisation?.address}</p>
                    <p className="text-slate-500">{organisation?.telephone}</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xl font-bold text-slate-900 uppercase tracking-wider">{previewData.title}</h2>
                    <p className="text-slate-500">Date: {new Date().toLocaleDateString()}</p>
                  </div>
                </div>

                <table className="w-full text-left border-collapse border border-slate-200">
                  <thead>
                    <tr className="bg-slate-50">
                      {previewData.columns.map((col, i) => (
                        <th key={i} className="p-3 text-xs font-bold text-slate-600 uppercase border border-slate-200">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className="p-3 text-sm text-slate-600 border border-slate-200">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-12 pt-8 border-t border-slate-100">
                  <p className="text-xs text-slate-400 text-center">
                    Generated by PayFlow Payroll Management System
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {isEditTaxOpen && taxConfig && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-6 overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-8"
          >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Edit Tax Configuration</h2>
                <p className="text-sm text-slate-500">Update SARS tax brackets and statutory limits</p>
              </div>
              <button onClick={() => setIsEditTaxOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleUpdateTaxConfig} className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Primary Rebate</label>
                  <input 
                    type="number"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={taxConfig.primaryRebate}
                    onChange={e => setTaxConfig({...taxConfig, primaryRebate: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Secondary Rebate (65+)</label>
                  <input 
                    type="number"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={taxConfig.secondaryRebate}
                    onChange={e => setTaxConfig({...taxConfig, secondaryRebate: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Tertiary Rebate (75+)</label>
                  <input 
                    type="number"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={taxConfig.tertiaryRebate}
                    onChange={e => setTaxConfig({...taxConfig, tertiaryRebate: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Threshold (&lt;65)</label>
                  <input 
                    type="number"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={taxConfig.taxThresholdUnder65}
                    onChange={e => setTaxConfig({...taxConfig, taxThresholdUnder65: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Threshold (65-75)</label>
                  <input 
                    type="number"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={taxConfig.taxThreshold65To75}
                    onChange={e => setTaxConfig({...taxConfig, taxThreshold65To75: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Threshold (75+)</label>
                  <input 
                    type="number"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={taxConfig.taxThreshold75Plus}
                    onChange={e => setTaxConfig({...taxConfig, taxThreshold75Plus: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Shield size={18} className="text-blue-600" />
                  Tax Brackets
                </h3>
                <div className="space-y-3">
                  {taxConfig.brackets.map((bracket, index) => (
                    <div key={index} className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Min Income</label>
                        <input 
                          type="number"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                          value={bracket.min}
                          onChange={e => {
                            const newBrackets = [...taxConfig.brackets];
                            newBrackets[index].min = Number(e.target.value);
                            setTaxConfig({...taxConfig, brackets: newBrackets});
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Max Income</label>
                        <input 
                          type="number"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                          value={bracket.max || ''}
                          placeholder="No limit"
                          onChange={e => {
                            const newBrackets = [...taxConfig.brackets];
                            newBrackets[index].max = e.target.value ? Number(e.target.value) : null;
                            setTaxConfig({...taxConfig, brackets: newBrackets});
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Base Tax</label>
                        <input 
                          type="number"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                          value={bracket.baseTax}
                          onChange={e => {
                            const newBrackets = [...taxConfig.brackets];
                            newBrackets[index].baseTax = Number(e.target.value);
                            setTaxConfig({...taxConfig, brackets: newBrackets});
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Rate (%)</label>
                        <input 
                          type="number"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                          value={bracket.rate}
                          onChange={e => {
                            const newBrackets = [...taxConfig.brackets];
                            newBrackets[index].rate = Number(e.target.value);
                            setTaxConfig({...taxConfig, brackets: newBrackets});
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">UIF Rate (%)</label>
                  <input 
                    type="number"
                    step="0.1"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={taxConfig.uifRate}
                    onChange={e => setTaxConfig({...taxConfig, uifRate: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">UIF Monthly Cap</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={taxConfig.uifCap}
                    onChange={e => setTaxConfig({...taxConfig, uifCap: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Retirement Cap (Annual)</label>
                  <input 
                    type="number"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={taxConfig.retirementLimitCap}
                    onChange={e => setTaxConfig({...taxConfig, retirementLimitCap: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsEditTaxOpen(false)}
                  className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" /> : 'Save Configuration'}
                </button>
              </div>
            </form>
          </motion.div>
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

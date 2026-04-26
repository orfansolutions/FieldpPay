import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { Requisition, RecurringCost, PaymentCycle, Contact, Project, PayrollRun } from '../types';
import { 
  Calendar, 
  Search, 
  Download, 
  Printer, 
  FileText, 
  Repeat, 
  ChevronRight,
  Filter,
  ArrowLeft,
  Building2,
  Users,
  Loader2,
  Banknote
} from 'lucide-react';
import { cn, formatCurrency, formatDate, handleFirestoreError, OperationType } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PDFPreview from './PDFPreview';

export default function PaymentSchedule() {
  const { organisation, profile, isDemo } = useAuth();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [recurringCosts, setRecurringCosts] = useState<RecurringCost[]>([]);
  const [paymentCycles, setPaymentCycles] = useState<PaymentCycle[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCycleDate, setSelectedCycleDate] = useState<string>('');
  const [search, setSearch] = useState('');
  const [pdfPreview, setPdfPreview] = useState<{ isOpen: boolean, title: string, blobUrl: string | null, filename: string }>({
    isOpen: false,
    title: '',
    blobUrl: null,
    filename: ''
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 5000);

    if (isDemo) {
      import('../lib/demoData').then(demo => {
        setRequisitions(demo.DEMO_REQUISITIONS.filter(r => r.status === 'Approved'));
        setRecurringCosts([]);
        setPaymentCycles(demo.DEMO_PAYMENT_CYCLES);
        setContacts(demo.DEMO_CONTACTS);
        setProjects(demo.DEMO_PROJECTS);
        
        const today = new Date().toISOString().split('T')[0];
        const allDates = demo.DEMO_PAYMENT_CYCLES.flatMap(c => c.paymentDates).sort();
        const nextDate = allDates.find(d => d >= today);
        if (nextDate) setSelectedCycleDate(nextDate);
        
        setLoading(false);
      });
      return;
    }

    if (!organisation || !auth.currentUser) return;

    const unsubReq = onSnapshot(query(collection(db, 'requisitions'), where('organisationId', '==', organisation.id), where('status', '==', 'Approved')), (snapshot) => {
      setRequisitions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Requisition)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'requisitions'));

    const unsubRecurring = onSnapshot(query(collection(db, 'recurringCosts'), where('organisationId', '==', organisation.id), where('status', '==', 'Active')), (snapshot) => {
      setRecurringCosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecurringCost)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'recurringCosts'));

    const unsubCycles = onSnapshot(query(collection(db, 'paymentCycles'), where('organisationId', '==', organisation.id)), (snapshot) => {
      const cycles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentCycle));
      setPaymentCycles(cycles);
      
      // Set default cycle to the next upcoming one
      const today = new Date().toISOString().split('T')[0];
      const allDates = cycles.flatMap(c => c.paymentDates).sort();
      const nextDate = allDates.find(d => d >= today);
      if (nextDate) setSelectedCycleDate(nextDate);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'paymentCycles'));

    const unsubContacts = onSnapshot(query(collection(db, 'contacts'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'contacts'));

    const unsubProjects = onSnapshot(query(collection(db, 'projects'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'projects'));

    const isFinanceOrAbove = ['Super User', 'CEO/CFO', 'Financial Manager', 'Manager'].includes(profile?.role || '');
    let unsubPayroll = () => {};

    if (isFinanceOrAbove) {
      unsubPayroll = onSnapshot(query(collection(db, 'payrollRuns'), where('organisationId', '==', organisation.id), where('status', '==', 'Approved')), (snapshot) => {
        setPayrollRuns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PayrollRun)));
      }, (error) => handleFirestoreError(error, OperationType.GET, 'payrollRuns'));
    }

    return () => {
      unsubReq();
      unsubRecurring();
      unsubCycles();
      unsubContacts();
      unsubProjects();
      unsubPayroll();
      clearTimeout(timer);
    };
  }, [organisation, isDemo]);

  const allPaymentDates = useMemo(() => {
    return [...new Set(paymentCycles.flatMap(c => c.paymentDates))].sort();
  }, [paymentCycles]);

  const scheduleData = useMemo(() => {
    if (!selectedCycleDate) return [];

    const cycleReqs = requisitions.filter(r => {
      // Include requisitions for the selected date
      if (r.paymentDate === selectedCycleDate) return true;
      
      // Carry-over logic: Include requisitions that were supposed to be paid in the past but are still 'Approved'
      if (r.paymentDate < selectedCycleDate && r.status === 'Approved') return true;
      
      return false;
    });
    
    // For recurring costs, we assume they fall into the cycle if their start date is before or on the cycle date
    // and they match the frequency. This is a simplified logic.
    const cycleRecurring = recurringCosts.filter(cost => {
      const startDate = new Date(cost.startDate);
      const cycleDate = new Date(selectedCycleDate);
      if (startDate > cycleDate) return false;

      // Simple frequency check
      const diffMonths = (cycleDate.getFullYear() - startDate.getFullYear()) * 12 + (cycleDate.getMonth() - startDate.getMonth());
      if (cost.frequency === 'Monthly') return true;
      if (cost.frequency === 'Quarterly') return diffMonths % 3 === 0;
      if (cost.frequency === 'Yearly') return diffMonths % 12 === 0;
      return false;
    });

    const combined = [
      ...cycleReqs.map(r => ({
        id: r.id,
        type: 'Requisition',
        name: contacts.find(c => c.id === r.contactId)?.name || 'Unknown Contact',
        description: r.lineItems?.map(li => li.description).join(', ') || r.description || 'No description',
        amount: r.totalAmount || r.amount || 0,
        reference: r.invoiceNumber || r.lineItems?.[0]?.invoiceNumber || 'N/A',
        category: 'Variable'
      })),
      ...cycleRecurring.map(c => ({
        id: c.id,
        type: 'Recurring',
        name: c.name,
        description: c.description,
        amount: c.amount,
        reference: 'RECURRING',
        category: 'Fixed'
      })),
      ...payrollRuns.filter(run => run.paymentDate === selectedCycleDate).map(run => ({
        id: run.id,
        type: 'Payroll',
        name: 'Monthly Salaries',
        description: `Consolidated payroll for ${run.month}`,
        amount: run.totalNet,
        reference: `PAYROLL-${run.month}`,
        category: 'Fixed'
      }))
    ];

    if (search) {
      return combined.filter(item => 
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase()) ||
        item.reference.toLowerCase().includes(search.toLowerCase())
      );
    }

    return combined;
  }, [selectedCycleDate, requisitions, recurringCosts, contacts, search]);

  const totalAmount = useMemo(() => {
    return scheduleData.reduce((acc, item) => acc + item.amount, 0);
  }, [scheduleData]);

  const handleExportCSV = () => {
    const headers = ['Type', 'Name', 'Description', 'Reference', 'Category', 'Amount'];
    const rows = scheduleData.map(item => [
      item.type,
      item.name,
      item.description,
      item.reference,
      item.category,
      item.amount
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `payment_schedule_${selectedCycleDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`${organisation?.name} - Payment Schedule`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Payment Date: ${formatDate(selectedCycleDate)}`, 14, 30);
    doc.text(`Total Amount: ${formatCurrency(totalAmount)}`, 14, 38);

    const tableData: any[] = [];
    
    scheduleData.forEach(item => {
      if (item.type === 'Requisition') {
        const req = requisitions.find(r => r.id === item.id);
        if (req && req.lineItems && req.lineItems.length > 0) {
          req.lineItems.forEach(li => {
            tableData.push([
              'Requisition',
              item.name,
              li.description,
              li.invoiceNumber || item.reference,
              formatCurrency(li.amount)
            ]);
          });
        } else {
          tableData.push([
            item.type,
            item.name,
            item.description,
            item.reference,
            formatCurrency(item.amount)
          ]);
        }
      } else {
        tableData.push([
          item.type,
          item.name,
          item.description,
          item.reference,
          formatCurrency(item.amount)
        ]);
      }
    });

    autoTable(doc, {
      startY: 45,
      head: [['Type', 'Name', 'Description', 'Reference', 'Amount']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59] }
    });

    const blobUrl = doc.output('bloburl') as unknown as string;
    setPdfPreview({
      isOpen: true,
      title: 'Payment Schedule',
      blobUrl,
      filename: `payment_schedule_${selectedCycleDate}.pdf`
    });
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8 print:space-y-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Payment Schedule</h1>
          <p className="text-slate-500">View and export upcoming payments for specific cycles.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handlePrint}
            className="p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            title="Print Schedule"
          >
            <Printer size={20} />
          </button>
          <button 
            onClick={handleExportPDF}
            className="p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            title="Download PDF"
          >
            <FileText size={20} />
          </button>
          <button 
            onClick={handleExportCSV}
            className="p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            title="Export CSV"
          >
            <Download size={20} />
          </button>
        </div>
      </header>

      {/* Print Header */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-8">
        <h1 className="text-2xl font-bold">{organisation?.name} - Payment Schedule</h1>
        <p className="text-slate-600">Payment Date: {formatDate(selectedCycleDate)}</p>
        <p className="text-slate-600 font-bold">Total: {formatCurrency(totalAmount)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Filters */}
        <div className="lg:col-span-1 space-y-6 print:hidden">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Select Payment Date</label>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {allPaymentDates.map(date => (
                  <button
                    key={date}
                    onClick={() => setSelectedCycleDate(date)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl text-sm font-medium transition-all border",
                      selectedCycleDate === date 
                        ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100" 
                        : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Calendar size={16} />
                      {formatDate(date)}
                    </div>
                    {selectedCycleDate === date && <ChevronRight size={16} />}
                  </button>
                ))}
                {allPaymentDates.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No payment cycles defined in settings.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Search Schedule</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text"
                  placeholder="Filter by name..."
                  className="w-full pl-10 p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="bg-blue-600 p-6 rounded-3xl text-white shadow-xl shadow-blue-100">
            <h3 className="text-sm font-bold opacity-80 uppercase tracking-wider mb-2">Cycle Total</h3>
            <p className="text-3xl font-bold">{formatCurrency(totalAmount)}</p>
            <p className="text-xs opacity-80 mt-2">{scheduleData.length} items scheduled for payment</p>
          </div>
        </div>

        {/* Main Schedule List */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-bold border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Payee / Name</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">Reference</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {scheduleData.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          item.type === 'Requisition' ? "bg-blue-50 text-blue-600" : 
                          item.type === 'Payroll' ? "bg-amber-50 text-amber-600" :
                          "bg-indigo-50 text-indigo-600"
                        )}>
                          {item.type === 'Requisition' ? <FileText size={16} /> : 
                           item.type === 'Payroll' ? <Banknote size={16} /> :
                           <Repeat size={16} />}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{item.name}</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{item.category}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-600 line-clamp-1 max-w-xs">{item.description}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">
                          {item.reference}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="font-bold text-slate-900">{formatCurrency(item.amount)}</p>
                      </td>
                    </tr>
                  ))}
                  {scheduleData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <Calendar size={48} className="opacity-20" />
                          <p>No payments scheduled for this cycle</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
                {scheduleData.length > 0 && (
                  <tfoot className="bg-slate-50/50 border-t border-slate-100">
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-right font-bold text-slate-500 uppercase tracking-wider text-xs">Total for Cycle</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 text-lg">{formatCurrency(totalAmount)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
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

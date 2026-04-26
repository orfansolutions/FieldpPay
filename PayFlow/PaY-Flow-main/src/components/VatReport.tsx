import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { Requisition, Project, Department, Contact, PaymentCycle } from '../types';
import { 
  FileText, 
  Download, 
  Search, 
  Filter,
  Calendar,
  ArrowLeft,
  PieChart,
  Table as TableIcon
} from 'lucide-react';
import { cn, formatCurrency, formatDate, handleFirestoreError, OperationType } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PDFPreview from './PDFPreview';

export default function VatReport() {
  const { organisation, isDemo } = useAuth();
  const navigate = useNavigate();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [paymentCycles, setPaymentCycles] = useState<PaymentCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfPreview, setPdfPreview] = useState<{ isOpen: boolean, title: string, blobUrl: string | null, filename: string }>({
    isOpen: false,
    title: '',
    blobUrl: null,
    filename: ''
  });
  
  const [filter, setFilter] = useState({
    period: 'All',
    month: 'All',
    cycle: 'All',
    project: 'All',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 5000);

    if (isDemo) {
      import('../lib/demoData').then(demo => {
        setRequisitions(demo.DEMO_REQUISITIONS);
        setProjects(demo.DEMO_PROJECTS);
        setDepartments(demo.DEMO_DEPARTMENTS);
        setContacts(demo.DEMO_CONTACTS);
        setPaymentCycles(demo.DEMO_PAYMENT_CYCLES);
        setLoading(false);
      });
      return;
    }

    if (!organisation || !auth.currentUser) return;

    const unsubReq = onSnapshot(query(collection(db, 'requisitions'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setRequisitions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Requisition)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'requisitions'));

    const unsubProj = onSnapshot(query(collection(db, 'projects'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'projects'));

    const unsubDept = onSnapshot(query(collection(db, 'departments'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setDepartments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'departments'));

    const unsubContacts = onSnapshot(query(collection(db, 'contacts'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'contacts'));

    const unsubCycles = onSnapshot(query(collection(db, 'paymentCycles'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setPaymentCycles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentCycle)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'paymentCycles'));

    return () => {
      unsubReq();
      unsubProj();
      unsubDept();
      unsubContacts();
      unsubCycles();
      clearTimeout(timer);
    };
  }, [organisation, isDemo]);

  const filteredData = useMemo(() => {
    return requisitions.filter(r => {
      if (r.status === 'Draft') return false;
      
      const date = new Date(r.date);
      const month = date.toLocaleString('default', { month: 'long' });
      
      const matchesMonth = filter.month === 'All' || month === filter.month;
      const matchesProject = filter.project === 'All' || r.projectId === filter.project || r.lineItems?.some(li => li.projectId === filter.project);
      const matchesCycle = filter.cycle === 'All' || r.paymentDate === filter.cycle;
      
      let matchesCustomDate = true;
      if (filter.startDate) {
        matchesCustomDate = matchesCustomDate && r.date >= filter.startDate;
      }
      if (filter.endDate) {
        matchesCustomDate = matchesCustomDate && r.date <= filter.endDate;
      }
      
      return matchesMonth && matchesProject && matchesCycle && matchesCustomDate;
    });
  }, [requisitions, filter]);

  const vatStats = useMemo(() => {
    let totalVat = 0;
    let totalNet = 0;
    let totalGross = 0;

    filteredData.forEach(r => {
      if (r.lineItems?.length > 0) {
        r.lineItems.forEach(li => {
          totalVat += Number(li.vatAmount || 0);
          totalNet += Number(li.netAmount || (li.amount - (li.vatAmount || 0)));
          totalGross += Number(li.amount || 0);
        });
      } else {
        totalVat += Number(r.totalVatAmount || 0);
        totalNet += Number(r.totalNetAmount || ((r.totalAmount || r.amount || 0) - (r.totalVatAmount || 0)));
        totalGross += Number(r.totalAmount || r.amount || 0);
      }
    });

    return { totalVat, totalNet, totalGross };
  }, [filteredData]);

  const exportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text('VAT Report', 14, 22);
    
    doc.setFontSize(10);
    doc.text(`Organisation: ${organisation?.name}`, 14, 30);
    const dateRange = filter.startDate && filter.endDate 
      ? `${formatDate(filter.startDate)} - ${formatDate(filter.endDate)}`
      : `${filter.month} / ${filter.cycle}`;
    doc.text(`Date Range: ${dateRange}`, 14, 35);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 40);
    
    const summaryData = [
      ['Total Net Amount', formatCurrency(vatStats.totalNet)],
      ['Total VAT Amount', formatCurrency(vatStats.totalVat)],
      ['Total Gross Amount', formatCurrency(vatStats.totalGross)]
    ];
    
    autoTable(doc, {
      startY: 50,
      head: [['Summary', 'Value']],
      body: summaryData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] } // Indigo-600
    });
    
    const tableData = filteredData.map(r => {
      const contact = contacts.find(c => c.id === r.contactId);
      return [
        formatDate(r.date),
        r.invoiceNumber || 'N/A',
        contact?.name || 'Unknown',
        formatCurrency(r.totalNetAmount || (r.totalAmount || r.amount || 0) - (r.totalVatAmount || 0)),
        formatCurrency(r.totalVatAmount || 0),
        formatCurrency(r.totalAmount || r.amount || 0)
      ];
    });
    
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Date', 'Invoice', 'Contact', 'Net', 'VAT', 'Gross']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] } // Indigo-600
    });
    
    const blobUrl = doc.output('bloburl') as unknown as string;
    setPdfPreview({
      isOpen: true,
      title: 'VAT Report',
      blobUrl,
      filename: `VAT_Report_${new Date().toISOString().split('T')[0]}.pdf`
    });
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (loading) return <div className="p-8 animate-pulse space-y-4">
    <div className="h-8 bg-slate-200 rounded w-1/4" />
    <div className="h-64 bg-slate-200 rounded" />
  </div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">VAT Report</h1>
            <p className="text-slate-500">Detailed VAT breakdown for all requisitions</p>
          </div>
        </div>
        <button 
          onClick={exportPDF}
          className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
        >
          <Download size={20} />
          Export PDF
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
            <Calendar size={14} /> Month
          </label>
          <select 
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
            value={filter.month}
            onChange={e => setFilter({ ...filter, month: e.target.value, startDate: '', endDate: '' })}
          >
            <option value="All">All Months</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
            <Filter size={14} /> Payment Cycle
          </label>
          <select 
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
            value={filter.cycle}
            onChange={e => setFilter({ ...filter, cycle: e.target.value, startDate: '', endDate: '' })}
          >
            <option value="All">All Cycles</option>
            {paymentCycles.flatMap(c => c.paymentDates).sort().map(d => (
              <option key={d} value={d}>{formatDate(d)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
            <Calendar size={14} /> Start Date
          </label>
          <input 
            type="date"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
            value={filter.startDate}
            onChange={e => setFilter({ ...filter, startDate: e.target.value, month: 'All', cycle: 'All' })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
            <Calendar size={14} /> End Date
          </label>
          <input 
            type="date"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
            value={filter.endDate}
            onChange={e => setFilter({ ...filter, endDate: e.target.value, month: 'All', cycle: 'All' })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
            <PieChart size={14} /> Project
          </label>
          <select 
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
            value={filter.project}
            onChange={e => setFilter({ ...filter, project: e.target.value })}
          >
            <option value="All">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button 
            onClick={() => setFilter({ period: 'All', month: 'All', cycle: 'All', project: 'All', startDate: '', endDate: '' })}
            className="w-full p-3 text-slate-500 hover:text-slate-900 font-medium transition-colors"
          >
            Reset Filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500 mb-1">Total Net</p>
          <p className="text-3xl font-bold text-slate-900">{formatCurrency(vatStats.totalNet)}</p>
        </div>
        <div className="bg-indigo-50 p-8 rounded-3xl border border-indigo-100">
          <p className="text-sm font-medium text-indigo-600 mb-1">Total VAT (15%)</p>
          <p className="text-3xl font-bold text-indigo-700">{formatCurrency(vatStats.totalVat)}</p>
        </div>
        <div className="bg-slate-900 p-8 rounded-3xl shadow-lg shadow-slate-200">
          <p className="text-sm font-medium text-slate-400 mb-1">Total Gross</p>
          <p className="text-3xl font-bold text-white">{formatCurrency(vatStats.totalGross)}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <TableIcon size={20} className="text-slate-400" />
            Detailed VAT List
          </h2>
          <p className="text-sm text-slate-500">{filteredData.length} Records</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-slate-400 text-xs uppercase tracking-widest font-bold">
              <tr>
                <th className="px-6 py-4">Date / Invoice</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4 text-right">Net Amount</th>
                <th className="px-6 py-4 text-right">VAT Amount</th>
                <th className="px-6 py-4 text-right">Gross Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredData.map(req => {
                const contact = contacts.find(c => c.id === req.contactId);
                const net = req.totalNetAmount || (req.totalAmount || req.amount || 0) - (req.totalVatAmount || 0);
                const vat = req.totalVatAmount || 0;
                const gross = req.totalAmount || req.amount || 0;
                
                return (
                  <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{req.invoiceNumber || 'N/A'}</p>
                      <p className="text-xs text-slate-400">{formatDate(req.date)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-700">{contact?.name || 'Unknown'}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-600">{formatCurrency(net)}</td>
                    <td className="px-6 py-4 text-right font-bold text-indigo-600">{formatCurrency(vat)}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">{formatCurrency(gross)}</td>
                  </tr>
                );
              })}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center text-slate-400">
                    <FileText size={48} className="mx-auto mb-4 opacity-10" />
                    <p>No records found for the selected filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

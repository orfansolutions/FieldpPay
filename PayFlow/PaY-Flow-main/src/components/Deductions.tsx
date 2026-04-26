import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDocs, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { Employee, Deduction } from '../types';
import { 
  Plus, 
  Trash2, 
  Loader2, 
  X, 
  TrendingUp,
  Search,
  Filter,
  Users,
  AlertTriangle,
  FileText,
  Upload,
  Paperclip,
  Download,
  CheckCircle
} from 'lucide-react';
import { handleFirestoreError, OperationType, cn, formatCurrency } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ConfirmationModal from './ConfirmationModal';
import PDFPreview from './PDFPreview';

export default function Deductions() {
  const { organisation, isDemo, showToast } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDeductionOpen, setIsAddDeductionOpen] = useState(false);
  const [isEditDeductionOpen, setIsEditDeductionOpen] = useState(false);
  const [editingDeduction, setEditingDeduction] = useState<Deduction | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
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

  const [newDeduction, setNewDeduction] = useState<Partial<Deduction>>({
    intervals: 1,
    status: 'Active'
  });

  useEffect(() => {
    if (isDemo) {
      import('../lib/demoData').then(demo => {
        setEmployees(demo.DEMO_EMPLOYEES);
        setDeductions(demo.DEMO_DEDUCTIONS);
        setLoading(false);
      });
      return;
    }

    if (!organisation || !auth.currentUser) {
      return;
    }

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

    setLoading(false);

    return () => {
      unsubEmployees();
      unsubDeductions();
    };
  }, [organisation]);

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
        createdAt: new Date().toISOString(),
        attachments: newDeduction.attachments || []
      });
      setIsAddDeductionOpen(false);
      setNewDeduction({ intervals: 1, status: 'Active' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'deductions');
    } finally {
      setLoading(false);
    }
  };

  const handleEditDeduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast("Actions are disabled in demo mode.", "warning");
      return;
    }
    if (!editingDeduction) return;

    try {
      setLoading(true);
      const amountPerInterval = Number(editingDeduction.totalAmount) / Number(editingDeduction.intervals);
      const { id, ...data } = editingDeduction;
      await updateDoc(doc(db, 'deductions', id), {
        ...data,
        amountPerInterval
      });
      setIsEditDeductionOpen(false);
      setEditingDeduction(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'deductions');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: any[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      const promise = new Promise((resolve) => {
        reader.onload = (event) => {
          resolve({
            name: file.name,
            type: file.type,
            data: event.target?.result as string
          });
        };
      });
      reader.readAsDataURL(file);
      newAttachments.push(await promise);
    }

    if (isEdit && editingDeduction) {
      setEditingDeduction({
        ...editingDeduction,
        attachments: [...(editingDeduction.attachments || []), ...newAttachments]
      });
    } else {
      setNewDeduction({
        ...newDeduction,
        attachments: [...(newDeduction.attachments || []), ...newAttachments]
      });
    }
  };

  const handleDeleteDeduction = (ded: Deduction) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Deduction',
      message: `Are you sure you want to delete this deduction for ${employees.find(e => e.id === ded.employeeId)?.name}? This action cannot be undone.`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          setLoading(true);
          if (isDemo) {
            setDeductions(prev => prev.filter(d => d.id !== ded.id));
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
            return;
          }
          // Check if any processed payroll run has this deduction
          const runsSnapshot = await getDocs(query(
            collection(db, 'payrollRuns'),
            where('organisationId', '==', organisation?.id),
            where('status', 'in', ['Approved', 'Processed'])
          ));
          
          if (!runsSnapshot.empty) {
            if (ded.remainingAmount < ded.totalAmount) {
              setConfirmModal({
                isOpen: true,
                title: 'Cannot Delete',
                message: "This deduction has already started being processed in a payroll run and cannot be deleted. You can write it off instead.",
                variant: 'info',
                onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
              });
              return;
            }
          }

          await deleteDoc(doc(db, 'deductions', ded.id));
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'deductions');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleWriteOff = (ded: Deduction) => {
    setConfirmModal({
      isOpen: true,
      title: 'Write Off Deduction',
      message: `Are you sure you want to write off the remaining ${formatCurrency(ded.remainingAmount)} for this deduction? This will forgive the balance.`,
      variant: 'warning',
      onConfirm: async () => {
        try {
          setLoading(true);
          if (isDemo) {
            setDeductions(prev => prev.map(d => d.id === ded.id ? { ...d, remainingAmount: 0, status: 'Completed' } : d));
          } else {
            await updateDoc(doc(db, 'deductions', ded.id), {
              remainingAmount: 0,
              status: 'Completed',
              writeOffDate: new Date().toISOString()
            });
          }
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, 'deductions');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text('Deductions Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 30);

    const tableData = deductions.map(ded => {
      const emp = employees.find(e => e.id === ded.employeeId);
      const paid = ded.totalAmount - ded.remainingAmount;
      return [
        emp ? `${emp.name} ${emp.surname}` : 'Unknown',
        ded.description,
        formatCurrency(ded.totalAmount),
        formatCurrency(paid),
        formatCurrency(ded.remainingAmount),
        ded.status
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: [['Employee', 'Description', 'Total Amount', 'Paid', 'Balance', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });

    const blobUrl = doc.output('bloburl') as unknown as string;
    setPdfPreview({
      isOpen: true,
      title: 'Deductions Report',
      blobUrl,
      filename: `deductions-report-${new Date().toISOString().split('T')[0]}.pdf`
    });
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
          <h1 className="text-3xl font-bold text-slate-900">Deductions Management</h1>
          <p className="text-slate-500 mt-1">Manage employee salary deductions and repayment intervals</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={exportPDF}
            className="flex items-center gap-2 bg-white text-slate-900 border border-slate-200 px-6 py-3 rounded-2xl font-bold hover:bg-slate-50 transition-all shadow-sm"
          >
            <Download size={20} />
            Export PDF
          </button>
          <button 
            onClick={() => setIsAddDeductionOpen(true)}
            className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
          >
            <Plus size={20} />
            Add New Deduction
          </button>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search by employee name..."
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Description</th>
                <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Total Amount</th>
                <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Paid</th>
                <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Balance</th>
                <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Intervals</th>
                <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Monthly Deduction</th>
                <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {deductions.filter(d => {
                const emp = employees.find(e => e.id === d.employeeId);
                return emp ? `${emp.name} ${emp.surname}`.toLowerCase().includes(searchTerm.toLowerCase()) : false;
              }).map(ded => {
                const emp = employees.find(e => e.id === ded.employeeId);
                return (
                  <tr key={ded.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold">
                          {emp ? emp.name[0] : '?'}
                        </div>
                        <p className="font-bold text-slate-900">{emp ? `${emp.name} ${emp.surname}` : 'Unknown'}</p>
                      </div>
                    </td>
                    <td className="p-6">
                      <span className="text-sm text-slate-600">{ded.description}</span>
                    </td>
                    <td className="p-6">
                      <span className="font-bold text-slate-900">{formatCurrency(ded.totalAmount)}</span>
                    </td>
                    <td className="p-6">
                      <span className="font-bold text-emerald-600">{formatCurrency(ded.totalAmount - ded.remainingAmount)}</span>
                    </td>
                    <td className="p-6">
                      <span className="font-bold text-rose-600">{formatCurrency(ded.remainingAmount)}</span>
                    </td>
                    <td className="p-6">
                      <span className="text-sm text-slate-600">{ded.intervals} months</span>
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
                    <td className="p-6">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setEditingDeduction(ded);
                            setIsEditDeductionOpen(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Deduction"
                        >
                          <FileText size={18} />
                        </button>
                        <button 
                          onClick={() => handleDeleteDeduction(ded)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete Deduction"
                        >
                          <Trash2 size={18} />
                        </button>
                        {ded.status === 'Active' && ded.remainingAmount > 0 && (
                          <button 
                            onClick={() => handleWriteOff(ded)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Write Off Deduction"
                          >
                            <CheckCircle size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {deductions.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    No deductions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Supporting Documents</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {newDeduction.attachments?.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full text-xs font-medium text-slate-600">
                      <Paperclip size={12} />
                      <span className="truncate max-w-[100px]">{file.name}</span>
                      <button 
                        type="button"
                        onClick={() => setNewDeduction({
                          ...newDeduction,
                          attachments: newDeduction.attachments?.filter((_, i) => i !== idx)
                        })}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <label className="flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
                  <Upload size={20} className="text-slate-400" />
                  <span className="text-sm font-bold text-slate-500">Upload Agreement</span>
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={(e) => handleFileUpload(e, false)}
                  />
                </label>
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
      {isEditDeductionOpen && editingDeduction && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-2xl font-bold text-slate-900">Edit Deduction</h2>
              <button onClick={() => setIsEditDeductionOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleEditDeduction} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Employee</label>
                <select 
                  required
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  value={editingDeduction.employeeId || ''}
                  onChange={e => setEditingDeduction({...editingDeduction, employeeId: e.target.value})}
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
                  value={editingDeduction.description || ''}
                  onChange={e => setEditingDeduction({...editingDeduction, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Total Amount</label>
                  <input 
                    required
                    type="number"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingDeduction.totalAmount || ''}
                    onChange={e => setEditingDeduction({...editingDeduction, totalAmount: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Intervals (Months)</label>
                  <input 
                    required
                    type="number"
                    min="1"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingDeduction.intervals || ''}
                    onChange={e => setEditingDeduction({...editingDeduction, intervals: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-sm text-blue-800">
                  Monthly Deduction: <strong>{formatCurrency(Number(editingDeduction.totalAmount || 0) / Number(editingDeduction.intervals || 1))}</strong>
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Supporting Documents</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {editingDeduction.attachments?.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full text-xs font-medium text-slate-600">
                      <Paperclip size={12} />
                      <span className="truncate max-w-[100px]">{file.name}</span>
                      <button 
                        type="button"
                        onClick={() => setEditingDeduction({
                          ...editingDeduction,
                          attachments: editingDeduction.attachments?.filter((_, i) => i !== idx)
                        })}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <label className="flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
                  <Upload size={20} className="text-slate-400" />
                  <span className="text-sm font-bold text-slate-500">Upload Agreement</span>
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={(e) => handleFileUpload(e, true)}
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsEditDeductionOpen(false)}
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

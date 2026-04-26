import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { Contact, BankDetails, Requisition } from '../types';
import { 
  Search, 
  Plus, 
  UserPlus, 
  Phone, 
  CreditCard, 
  Building2, 
  Smartphone, 
  Wallet,
  MoreVertical,
  Edit2,
  Trash2,
  X,
  Loader2,
  Camera,
  FileText,
  Users,
  Paperclip,
  CheckCircle2,
  Printer,
  FileDown,
  FileSpreadsheet,
  Upload,
  Download
} from 'lucide-react';
import { cn, handleFirestoreError, OperationType, exportToCSV } from '../lib/utils';
import Fuse from 'fuse.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import PDFPreview from './PDFPreview';

const BANK_BRANCH_CODES: Record<string, string> = {
  "Absa Bank": "632005",
  "Capitec Bank": "470010",
  "First National Bank (FNB)": "250655",
  "Nedbank": "198765",
  "Standard Bank": "051001",
  "Investec": "580105",
  "African Bank": "430000",
  "Discovery Bank": "679000",
  "TymeBank": "678910",
  "Bidvest Bank": "462005"
};

const SA_BANKS = Object.keys(BANK_BRANCH_CODES);

export default function Contacts() {
  const { organisation, profile, isDemo, showToast } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<{ name: string; type: string; data: string }[]>([]);
  const [pdfPreview, setPdfPreview] = useState<{ isOpen: boolean, title: string, blobUrl: string | null, filename: string }>({
    isOpen: false,
    title: '',
    blobUrl: null,
    filename: ''
  });

  const [formData, setFormData] = useState({
    name: '',
    contactNumber: '',
    bankType: 'Bank Account' as BankDetails['type'],
    bankName: '',
    accountNumber: '',
    branchCode: '',
    cellphoneNumber: '',
  });

  useEffect(() => {
    if (isDemo) {
      import('../lib/demoData').then(demo => {
        setContacts(demo.DEMO_CONTACTS);
        setRequisitions(demo.DEMO_REQUISITIONS);
      });
      return;
    }

    if (!organisation || !auth.currentUser) return;
    const q = query(collection(db, 'contacts'), where('organisationId', '==', organisation.id));
    const unsubContacts = onSnapshot(q, (snapshot) => {
      setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'contacts'));

    const qReq = query(collection(db, 'requisitions'), where('organisationId', '==', organisation.id));
    const unsubReq = onSnapshot(qReq, (snapshot) => {
      setRequisitions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Requisition)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'requisitions'));

    return () => {
      unsubContacts();
      unsubReq();
    };
  }, [organisation]);

  const isContactLinked = (contactId: string) => {
    return requisitions.some(req => req.contactId === contactId);
  };

  const handleDelete = async () => {
    if (!contactToDelete) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'contacts', contactToDelete.id));
      setIsDeleteConfirmOpen(false);
      setContactToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachments(prev => [...prev, {
          name: file.name,
          type: file.type,
          data: reader.result as string
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast('Actions are disabled in Demo Mode.', 'warning');
      return;
    }
    if (!organisation) return;
    setLoading(true);

    const contactData = {
      name: formData.name,
      contactNumber: formData.contactNumber,
      organisationId: organisation.id,
      bankDetails: {
        type: formData.bankType,
        ...(formData.bankType === 'Bank Account' && {
          bankName: formData.bankName,
          accountNumber: formData.accountNumber,
          branchCode: formData.branchCode,
        }),
        ...(formData.bankType === 'Cash Send' && {
          cellphoneNumber: formData.cellphoneNumber,
        }),
      },
      attachments: attachments,
    };

    try {
      if (editingContact) {
        await updateDoc(doc(db, 'contacts', editingContact.id), contactData);
      } else {
        await addDoc(collection(db, 'contacts'), contactData);
      }
      setIsModalOpen(false);
      setFormData({
        name: '',
        contactNumber: '',
        bankType: 'Bank Account',
        bankName: '',
        accountNumber: '',
        branchCode: '',
        cellphoneNumber: '',
      });
      setAttachments([]);
      setEditingContact(null);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, editingContact ? OperationType.UPDATE : OperationType.CREATE, 'contacts');
      showToast('Failed to save contact. Please check your permissions.', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`${organisation?.name || 'Organisation'} - Contacts Report`, 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    const tableData = filteredContacts.map(c => [
      c.name,
      c.contactNumber,
      c.bankDetails.type,
      c.bankDetails.type === 'Bank Account' ? c.bankDetails.bankName : (c.bankDetails.type === 'Cash Send' ? c.bankDetails.cellphoneNumber : 'Cash'),
      c.bankDetails.accountNumber || 'N/A'
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Name', 'Contact Number', 'Payment Type', 'Bank/Phone', 'Account Number']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [223, 223, 223], textColor: 20 },
    });

    const blobUrl = doc.output('bloburl') as unknown as string;
    setPdfPreview({
      isOpen: true,
      title: 'Contacts Report',
      blobUrl,
      filename: `${organisation?.name || 'Organisation'}_Contacts_${new Date().toISOString().split('T')[0]}.pdf`
    });
  };

  const handleExportCSV = () => {
    const data = filteredContacts.map(c => ({
      'Name': c.name,
      'Contact Number': c.contactNumber,
      'Payment Type': c.bankDetails.type,
      'Bank Name': c.bankDetails.bankName || '',
      'Account Number': c.bankDetails.accountNumber || '',
      'Branch Code': c.bankDetails.branchCode || '',
      'Cellphone Number': c.bankDetails.cellphoneNumber || ''
    }));
    exportToCSV(data, `${organisation?.name || 'Organisation'}_Contacts.csv`);
  };

  const handlePrint = () => {
    window.print();
  };
  
  const handleDownloadTemplate = () => {
    const headers = ['Name', 'Contact Number', 'Payment Type', 'Bank Name', 'Account Number', 'Branch Code', 'Cellphone Number'];
    const example = ['John Doe', '0123456789', 'Bank Account', 'Absa Bank', '123456789', '632005', ''];
    const csvContent = [headers, example].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'contacts_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (isDemo) {
      showToast('Actions are disabled in Demo Mode.', 'warning');
      return;
    }
    if (!file || !organisation) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      const contactsToImport = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        if (values.length < headers.length) return null;
        
        const data: any = {};
        headers.forEach((header, index) => {
          data[header] = values[index];
        });
        return data;
      }).filter(Boolean);

      if (contactsToImport.length === 0) {
        showToast('No valid contacts found in CSV.', 'warning');
        return;
      }

      setLoading(true);
      try {
        const promises = contactsToImport.map(async (c: any) => {
          const contactData = {
            name: c['Name'],
            contactNumber: c['Contact Number'],
            organisationId: organisation.id,
            bankDetails: {
              type: (c['Payment Type'] || 'Bank Account') as BankDetails['type'],
              ...(c['Payment Type'] === 'Bank Account' && {
                bankName: c['Bank Name'],
                accountNumber: c['Account Number'],
                branchCode: c['Branch Code'],
              }),
              ...(c['Payment Type'] === 'Cash Send' && {
                cellphoneNumber: c['Cellphone Number'],
              }),
            },
            attachments: [],
          };
          return addDoc(collection(db, 'contacts'), contactData);
        });

        await Promise.all(promises);
        showToast(`Successfully imported ${contactsToImport.length} contacts.`, 'success');
      } catch (err) {
        console.error(err);
        showToast('Failed to import contacts.', 'error');
      } finally {
        setLoading(false);
        if (importInputRef.current) importInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const fuse = new Fuse(contacts, {
    keys: ['name', 'contactNumber', 'bankDetails.bankName', 'bankDetails.accountNumber'],
    threshold: 0.3,
  });

  const filteredContacts = search 
    ? fuse.search(search).map(r => r.item)
    : contacts;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Contacts</h1>
          <p className="text-slate-500">Manage your vendors, clients and payees.</p>
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
          </div>
          <div className="flex bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
            <button 
              onClick={handleDownloadTemplate}
              className="p-2.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
              title="Download Template"
            >
              <Download size={20} />
            </button>
            <button 
              onClick={() => importInputRef.current?.click()}
              className="p-2.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
              title="Import CSV"
            >
              <Upload size={20} />
            </button>
            <input 
              type="file" 
              ref={importInputRef} 
              onChange={handleImportCSV} 
              accept=".csv" 
              className="hidden" 
            />
          </div>
          {['Super User', 'Financial Manager', 'CEO/CFO', 'Manager'].includes(profile?.role || '') && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <UserPlus size={20} />
              Add Contact
            </button>
          )}
        </div>
      </header>

      <div className="relative no-print">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Fuzzy search by name, number, or bank details..."
          className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 no-print">
        {filteredContacts.map((contact) => (
          <ContactCard 
            key={contact.id} 
            contact={contact} 
            canEdit={['Super User', 'Financial Manager', 'CEO/CFO', 'Manager'].includes(profile?.role || '')}
            onEdit={() => {
              setEditingContact(contact);
              setFormData({
                name: contact.name,
                contactNumber: contact.contactNumber,
                bankType: contact.bankDetails.type,
                bankName: contact.bankDetails.bankName || '',
                accountNumber: contact.bankDetails.accountNumber || '',
                branchCode: contact.bankDetails.branchCode || '',
                cellphoneNumber: contact.bankDetails.cellphoneNumber || '',
              });
              setAttachments(contact.attachments || []);
              setIsModalOpen(true);
            }}
            onDelete={() => {
              if (isContactLinked(contact.id)) {
                showToast('This contact is linked to requisitions and cannot be deleted.', 'warning');
                return;
              }
              setContactToDelete(contact);
              setIsDeleteConfirmOpen(true);
            }}
          />
        ))}
        {filteredContacts.length === 0 && (
          <div className="col-span-full py-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
            <Users size={48} className="mx-auto mb-4 opacity-20" />
            <p>No contacts found matching your search</p>
          </div>
        )}
      </div>

      {/* Print Only View */}
      <div className="hidden print:block space-y-8">
        <div className="border-b-2 border-slate-900 pb-4">
          <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight">{organisation?.name}</h1>
          <p className="text-slate-500 font-bold">CONTACTS REPORT - {new Date().toLocaleDateString()}</p>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200 text-left">
              <th className="py-4 font-black text-xs uppercase tracking-widest text-slate-400">Name</th>
              <th className="py-4 font-black text-xs uppercase tracking-widest text-slate-400">Contact</th>
              <th className="py-4 font-black text-xs uppercase tracking-widest text-slate-400">Payment Method</th>
              <th className="py-4 font-black text-xs uppercase tracking-widest text-slate-400">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredContacts.map(c => (
              <tr key={c.id}>
                <td className="py-4 font-bold text-slate-900">{c.name}</td>
                <td className="py-4 text-sm text-slate-600">{c.contactNumber}</td>
                <td className="py-4 text-sm text-slate-600">{c.bankDetails.type}</td>
                <td className="py-4 text-sm text-slate-600">
                  {c.bankDetails.type === 'Bank Account' ? `${c.bankDetails.bankName} (${c.bankDetails.accountNumber})` :
                   c.bankDetails.type === 'Cash Send' ? c.bankDetails.cellphoneNumber : 'Cash'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">{editingContact ? 'Edit' : 'Add New'} Contact</h2>
              <button onClick={() => { setIsModalOpen(false); setEditingContact(null); setAttachments([]); }} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Full Name / Company</label>
                  <input
                    required
                    type="text"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Contact Number</label>
                  <input
                    required
                    type="tel"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.contactNumber}
                    onChange={e => setFormData({ ...formData, contactNumber: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-medium text-slate-700 block">Payment Method</label>
                <div className="grid grid-cols-3 gap-4">
                  {(['Bank Account', 'Cash Send', 'Cash'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({ ...formData, bankType: type })}
                      className={cn(
                        "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all",
                        formData.bankType === type 
                          ? "border-blue-600 bg-blue-50 text-blue-600" 
                          : "border-slate-100 hover:border-slate-200 text-slate-500"
                      )}
                    >
                      {type === 'Bank Account' && <Building2 size={24} />}
                      {type === 'Cash Send' && <Smartphone size={24} />}
                      {type === 'Cash' && <Wallet size={24} />}
                      <span className="text-xs font-bold">{type}</span>
                    </button>
                  ))}
                </div>
              </div>

              {formData.bankType === 'Bank Account' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Bank Name</label>
                    <select
                      required
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.bankName}
                      onChange={e => {
                        const bank = e.target.value;
                        setFormData({ 
                          ...formData, 
                          bankName: bank,
                          branchCode: BANK_BRANCH_CODES[bank] || formData.branchCode
                        });
                      }}
                    >
                      <option value="">Select Bank</option>
                      {SA_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Account Number</label>
                    <input
                      required
                      type="text"
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.accountNumber}
                      onChange={e => setFormData({ ...formData, accountNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Branch Code</label>
                    <input
                      required
                      type="text"
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.branchCode}
                      onChange={e => setFormData({ ...formData, branchCode: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {formData.bankType === 'Cash Send' && (
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">SA Cellphone Number</label>
                    <input
                      required
                      type="tel"
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="082 123 4567"
                      value={formData.cellphoneNumber}
                      onChange={e => setFormData({ ...formData, cellphoneNumber: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <label className="text-sm font-medium text-slate-700 block">Attachments (Optional)</label>
                <input 
                  type="file" 
                  multiple 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*,application/pdf"
                />
                <div className="flex gap-4">
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:text-blue-500 hover:border-blue-200 transition-all"
                  >
                    <Camera size={20} />
                    <span>Scan / Upload</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:text-blue-500 hover:border-blue-200 transition-all"
                  >
                    <FileText size={20} />
                    <span>Upload PDF</span>
                  </button>
                </div>
                
                {attachments.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip size={14} className="text-slate-400 shrink-0" />
                          <span className="text-xs text-slate-600 truncate">{file.name}</span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-rose-500"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" /> : editingContact ? 'Update Contact' : 'Save Contact'}
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
                Are you sure you want to delete <strong>{contactToDelete?.name}</strong>? This action cannot be undone.
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

function ContactCard({ contact, onEdit, onDelete, canEdit }: { contact: Contact, onEdit: () => void, onDelete: () => void, canEdit: boolean }) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between mb-6">
        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600 font-bold text-xl">
          {contact.name.charAt(0)}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEdit} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
              <Edit2 size={16} />
            </button>
            <button onClick={onDelete} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="font-bold text-slate-900 text-lg">{contact.name}</h3>
          <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
            <Phone size={14} />
            {contact.contactNumber}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
              {contact.bankDetails.type === 'Bank Account' ? <Building2 size={16} /> :
               contact.bankDetails.type === 'Cash Send' ? <Smartphone size={16} /> :
               <Wallet size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{contact.bankDetails.type}</p>
              <p className="text-sm font-semibold text-slate-700 truncate">
                {contact.bankDetails.type === 'Bank Account' ? contact.bankDetails.bankName :
                 contact.bankDetails.type === 'Cash Send' ? contact.bankDetails.cellphoneNumber :
                 'Cash Payment'}
              </p>
            </div>
          </div>
        </div>
        
        {contact.attachments && contact.attachments.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
            <Paperclip size={10} />
            {contact.attachments.length} attachment(s)
          </div>
        )}
      </div>
    </div>
  );
}

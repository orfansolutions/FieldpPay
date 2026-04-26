import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { Department, ChartOfAccount, PaymentCycle, PublicHoliday, UserProfile } from '../types';
import { 
  Building2, 
  CreditCard,
  Plus, 
  Trash2, 
  Calendar, 
  Shield, 
  Users,
  Loader2,
  CheckCircle2,
  Clock,
  Palmtree,
  X,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Upload,
  Download,
  FileSpreadsheet,
  User as UserIcon,
  Camera,
  Save,
  Mail,
  Sparkles,
  Link as LinkIcon,
  Copy,
  FileText,
  FileDown,
  Archive,
  ArchiveRestore
} from 'lucide-react';
import { handleFirestoreError, OperationType, cn, formatCurrency, formatDate } from '../lib/utils';
import { generateInviteEmail } from '../services/geminiService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const OrgSectionCard = ({ title, icon, description, onClick, color }: { 
  title: string; 
  icon: React.ReactNode; 
  description: string; 
  onClick: () => void;
  color: 'blue' | 'amber' | 'indigo' | 'rose' | 'slate' | 'emerald';
}) => {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    indigo: "bg-indigo-50 text-indigo-600",
    rose: "bg-rose-50 text-rose-600",
    slate: "bg-slate-50 text-slate-600",
    emerald: "bg-emerald-50 text-emerald-600"
  };

  return (
    <button 
      onClick={onClick}
      className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-100 transition-all text-left group"
    >
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110", colorClasses[color])}>
        {icon}
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
    </button>
  );
};

export default function Settings() {
  const { organisation, profile, user, refreshProfile, isDemo, showInstallBtn, handleInstallClick, showToast } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
  const [paymentCycles, setPaymentCycles] = useState<PaymentCycle[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [orgUsers, setOrgUsers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'organisation'>(profile?.role === 'Manager' ? 'profile' : 'profile');

  useEffect(() => {
    if (profile?.role === 'Manager') {
      setActiveTab('profile');
    }
  }, [profile]);
  const [activeOrgSection, setActiveOrgSection] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  
  // Profile state
  const [profileForm, setProfileForm] = useState({
    displayName: profile?.displayName || '',
    surname: profile?.surname || '',
    position: profile?.position || '',
    photoURL: profile?.photoURL || ''
  });

  const [newDept, setNewDept] = useState('');
  const [newCC, setNewCC] = useState('');
  const [newUser, setNewUser] = useState({ email: '', displayName: '', role: 'Requester' as UserProfile['role'] });
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '' });
  const [editingHoliday, setEditingHoliday] = useState<PublicHoliday | null>(null);
  const [newCycle, setNewCycle] = useState({
    type: 'Weekly' as PaymentCycle['type'],
    startDate: new Date().toISOString().split('T')[0],
    customDates: [] as string[],
  });
  const [customDate, setCustomDate] = useState('');
  const [subscriptionTab, setSubscriptionTab] = useState<'overview' | 'billing'>('overview');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (isDemo) {
      import('../lib/demoData').then(demo => {
        setDepartments(demo.DEMO_DEPARTMENTS);
        setChartOfAccounts(demo.DEMO_CHART_OF_ACCOUNTS);
        setOrgUsers([demo.DEMO_PROFILE]);
        setLoading(false);
      });
      return;
    }

    if (!organisation?.id || !auth.currentUser) return;

    // Clear previous data to prevent 'flashing' old org data
    setDepartments([]);
    setChartOfAccounts([]);
    setPaymentCycles([]);
    setHolidays([]);
    setOrgUsers([]);
    setInvites([]);

    const unsubDept = onSnapshot(query(collection(db, 'departments'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setDepartments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'departments'));

    const unsubCC = onSnapshot(query(collection(db, 'chartOfAccounts'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setChartOfAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChartOfAccount)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'chartOfAccounts'));

    const unsubCycles = onSnapshot(query(collection(db, 'paymentCycles'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setPaymentCycles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentCycle)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'paymentCycles'));

    const unsubHolidays = onSnapshot(query(collection(db, 'publicHolidays'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setHolidays(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PublicHoliday)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'publicHolidays'));

    const unsubUsers = onSnapshot(query(collection(db, 'users'), where('organisationId', '==', organisation.id)), (snapshot) => {
      setOrgUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'users'));

    const unsubInvites = onSnapshot(query(collection(db, 'invites'), where('organisationId', '==', organisation.id), where('status', '==', 'Pending')), (snapshot) => {
      setInvites(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'invites'));

    return () => {
      unsubDept();
      unsubCC();
      unsubCycles();
      unsubHolidays();
      unsubUsers();
      unsubInvites();
    };
  }, [organisation?.id, isDemo]);

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const isHoliday = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return holidays.some(h => h.date === dateStr);
  };

  const getLastWorkingDay = (date: Date) => {
    let d = new Date(date);
    while (isWeekend(d) || isHoliday(d)) {
      d.setDate(d.getDate() - 1);
    }
    return d.toISOString().split('T')[0];
  };

  const calculatePaymentDates = (type: PaymentCycle['type'], startDate: string) => {
    if (type === 'Custom') return newCycle.customDates.sort();
    
    const dates: string[] = [];
    let current = new Date(startDate);
    
    // Use financial year end if available and in the future, otherwise default to 1 year from start date
    let endOfYear: Date;
    const financialYearEnd = organisation?.financialYear?.endDate ? new Date(organisation.financialYear.endDate) : null;
    
    if (financialYearEnd && financialYearEnd > current) {
      endOfYear = financialYearEnd;
    } else {
      endOfYear = new Date(current);
      endOfYear.setFullYear(endOfYear.getFullYear() + 1);
    }

    // Safety break to prevent infinite loops
    let iterations = 0;
    const maxIterations = 100;

    while (current <= endOfYear && iterations < maxIterations) {
      dates.push(getLastWorkingDay(current));
      
      if (type === 'Weekly') current.setDate(current.getDate() + 7);
      else if (type === 'Bi-weekly') current.setDate(current.getDate() + 14);
      else if (type === 'Monthly') current.setMonth(current.getMonth() + 1);
      else break;
      
      iterations++;
    }
    return dates;
  };

  const handleAddCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!organisation) return;
    if (newCycle.type === 'Custom' && newCycle.customDates.length === 0) {
      showToast('Please add at least one date for custom cycle', 'warning');
      return;
    }
    setLoading(true);
    try {
      const paymentDates = calculatePaymentDates(newCycle.type, newCycle.startDate);
      
      if (paymentDates.length === 0) {
        showToast('No payment dates could be calculated for this period. Please check your financial year settings and start date.', 'error');
        setLoading(false);
        return;
      }

      const endDate = paymentDates[paymentDates.length - 1];
      
      await addDoc(collection(db, 'paymentCycles'), {
        type: newCycle.type,
        startDate: newCycle.type === 'Custom' ? paymentDates[0] : newCycle.startDate,
        endDate,
        paymentDates,
        organisationId: organisation.id
      });
      setNewCycle({
        type: 'Weekly',
        startDate: new Date().toISOString().split('T')[0],
        customDates: [],
      });
      showToast('Payment cycle added successfully.', 'success');
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'paymentCycles');
    }
    finally { setLoading(false); }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!organisation || !newHoliday.name || !newHoliday.date) return;
    setLoading(true);
    try {
      if (editingHoliday) {
        await updateDoc(doc(db, 'publicHolidays', editingHoliday.id), {
          name: newHoliday.name,
          date: newHoliday.date
        });
        setEditingHoliday(null);
        showToast('Holiday updated successfully.', 'success');
      } else {
        await addDoc(collection(db, 'publicHolidays'), {
          ...newHoliday,
          organisationId: organisation.id
        });
        showToast('Holiday added successfully.', 'success');
      }
      setNewHoliday({ name: '', date: '' });
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'publicHolidays');
      showToast('Failed to save holiday. Please check your permissions.', 'error');
    }
    finally { setLoading(false); }
  };

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!organisation || !newDept) return;
    if (newDept.toLowerCase() === 'general') {
      showToast('"General" is reserved for the default project. Please use a specific department name.', 'warning');
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, 'departments'), { name: newDept, organisationId: organisation.id });
      
      setNewDept('');
      showToast('Department added successfully.', 'success');
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'departments');
      showToast('Failed to add department.', 'error');
    }
    finally { setLoading(false); }
  };

  const handleAddCC = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!organisation || !newCC) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'chartOfAccounts'), { 
        name: newCC, 
        organisationId: organisation.id,
        status: 'Active'
      });
      setNewCC('');
      showToast('Chart of account added successfully.', 'success');
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'chartOfAccounts');
      showToast('Failed to add account.', 'error');
    }
    finally { setLoading(false); }
  };

  const handleDownloadCCTemplate = () => {
    const csvContent = "Chart of Account Name\nMarketing\nOperations\nHuman Resources\nInformation Technology";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'chart_of_accounts_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCC = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!file || !organisation) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const names = lines
        .slice(1) // Skip header
        .map(line => line.trim())
        .filter(name => name.length > 0);

      if (names.length === 0) {
        showToast('No valid account names found in the file.', 'warning');
        return;
      }

      setLoading(true);
      try {
        const batch = names.map(name => 
          addDoc(collection(db, 'chartOfAccounts'), { 
            name, 
            organisationId: organisation.id,
            status: 'Active'
          })
        );
        await Promise.all(batch);
        showToast(`Successfully imported ${names.length} accounts.`, 'success');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'chartOfAccounts');
        showToast('Failed to import accounts.', 'error');
      } finally {
        setLoading(false);
        // Reset file input
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleToggleArchiveCC = async (cc: ChartOfAccount) => {
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!profile || !['Super User', 'Financial Manager'].includes(profile.role)) {
      showToast('You do not have permission to archive accounts.', 'error');
      return;
    }

    const newStatus = cc.status === 'Archived' ? 'Active' : 'Archived';
    const actionText = newStatus === 'Archived' ? 'archive' : 'unarchive';

    if (!confirm(`Are you sure you want to ${actionText} this account?`)) return;

    setLoading(true);
    try {
      await updateDoc(doc(db, 'chartOfAccounts', cc.id), {
        status: newStatus
      });
      showToast(`Account ${actionText}d successfully.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'chartOfAccounts');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast('Adding users is not available in demo mode.', 'warning');
      return;
    }
    if (!organisation || !newUser.email || !profile) return;
    setLoading(true);
    const emailLower = newUser.email.toLowerCase().trim();
    try {
      // 1. Check if user already exists
      const q = query(collection(db, 'users'), where('email', '==', emailLower));
      let snapshot;
      try {
        snapshot = await getDocs(q);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'users');
        return;
      }
      
          if (!snapshot.empty) {
            const userDoc = snapshot.docs[0];
            try {
              await updateDoc(doc(db, 'users', userDoc.id), {
                organisationId: organisation.id,
                role: newUser.role,
                displayName: newUser.displayName || userDoc.data().displayName,
                updatedAt: new Date().toISOString()
              });
              const link = `${window.location.origin}/signup`;
              setLastInviteLink(link);
              showToast('User added to organisation successfully. They can now log in to access the dashboard.', 'success');
            } catch (err) {
              handleFirestoreError(err, OperationType.UPDATE, 'users');
            }
          } else {
        // 2. Create an invitation
        // Check if an invite already exists
        const qInvite = query(collection(db, 'invites'), 
          where('email', '==', emailLower), 
          where('organisationId', '==', organisation.id),
          where('status', '==', 'Pending')
        );
        let inviteSnapshot;
        try {
          inviteSnapshot = await getDocs(qInvite);
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'invites');
          return;
        }
        
        if (!inviteSnapshot.empty) {
          showToast('An invitation for this email is already pending.', 'warning');
        } else {
          try {
            const inviteDoc = await addDoc(collection(db, 'invites'), {
              email: emailLower,
              role: newUser.role,
              organisationId: organisation.id,
              organisationName: organisation.name,
              invitedBy: profile.displayName || profile.email,
              status: 'Pending',
              createdAt: new Date().toISOString()
            });
            const link = `${window.location.origin}/signup?invite=${inviteDoc.id}`;
            setLastInviteLink(link);
            showToast(`Invitation created for ${emailLower}. Sending email...`, 'info');
            
            // Automatically trigger the email sending
            await handleSendInviteEmail({
              id: inviteDoc.id,
              email: emailLower,
              role: newUser.role
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, 'invites');
          }
        }
      }
      setNewUser({ email: '', displayName: '', role: 'Requester' });
    } catch (err) {
      console.error('Unexpected error in handleAddUser:', err);
      showToast('An unexpected error occurred.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!confirm('Cancel this invitation?')) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'invites', inviteId));
      showToast('Invitation cancelled.', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'invites');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInviteEmail = async (invite: any) => {
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!organisation || !profile) return;
    setLoading(true);
    try {
      const inviteLink = `${window.location.origin}/signup?invite=${invite.id}`;
      
      // Try server-side automatic sending first
      const response = await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: invite.email,
          inviteLink,
          organisationName: organisation.name,
          role: invite.role
        })
      });

      const result = await response.json();

      if (response.ok) {
        if (result.isMock) {
          // Fallback to mailto if SMTP not configured, but show a nicer message
          const { subject, body } = await generateInviteEmail(
            organisation.name,
            invite.role,
            profile.displayName || profile.email,
            inviteLink
          );
          const mailtoLink = `mailto:${invite.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          window.location.href = mailtoLink;
          showToast('SMTP Secrets missing. Please configure SMTP_HOST, SMTP_USER, and SMTP_PASS in the Secrets panel for automatic emails. Opening your mail client as fallback.', 'warning');
        } else {
          showToast('Invitation email sent automatically!', 'success');
        }
      } else {
        const errorMsg = result.details ? `Failed to send email: ${result.details}` : (result.error || 'Failed to send email');
        throw new Error(errorMsg);
      }
    } catch (err) {
      console.error('Error sending invite email:', err);
      showToast('Failed to send email automatically. Please copy the link manually or check your SMTP settings.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (userId === profile?.uid) {
      showToast('You cannot remove yourself.', 'warning');
      return;
    }
    if (!confirm('Are you sure you want to remove this user from the organisation?')) return;
    
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', userId), {
        organisationId: null,
        role: 'Requester'
      });
      showToast('User removed from organisation.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'users');
    } finally {
      setLoading(false);
    }
  };

  const [isRolloverConfirmOpen, setIsRolloverConfirmOpen] = useState(false);
  const [clearDataConfirmText, setClearDataConfirmText] = useState('');
  const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);
  const [vatRate, setVatRate] = useState(organisation?.vatRate || 15);

  useEffect(() => {
    if (organisation?.vatRate !== undefined) {
      setVatRate(organisation.vatRate);
    }
  }, [organisation]);

  const handleUpdateVatRate = async () => {
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!organisation) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'organisations', organisation.id), {
        vatRate: vatRate
      });
      showToast('VAT rate updated successfully.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'organisations');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!file || !organisation) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64.length > 500000) {
        showToast('Logo is too large. Please use an image smaller than 500KB.', 'error');
        return;
      }
      setLoading(true);
      try {
        await updateDoc(doc(db, 'organisations', organisation.id), {
          logoURL: base64
        });
        showToast('Logo updated successfully.', 'success');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'organisations');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClearTestData = async () => {
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!organisation || profile?.role !== 'Super User') return;
    if (clearDataConfirmText !== 'DELETE') {
      showToast('Please type DELETE to confirm.', 'warning');
      return;
    }
    
    const collections = ['requisitions', 'contacts', 'recurringCosts'];
    
    setLoading(true);
    try {
      for (const coll of collections) {
        const q = query(collection(db, coll), where('organisationId', '==', organisation.id));
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, coll, d.id)));
        await Promise.all(deletePromises);
      }
    } catch (err) {
      console.error('Error clearing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculateCycles = async () => {
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!organisation) return;
    setLoading(true);
    try {
      for (const cycle of paymentCycles) {
        const paymentDates = calculatePaymentDates(cycle.type, cycle.startDate);
        const endDate = paymentDates[paymentDates.length - 1];
        await updateDoc(doc(db, 'paymentCycles', cycle.id), { paymentDates, endDate });
      }
      showToast('All payment cycles recalculated based on current holidays.', 'success');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRollover = async () => {
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!organisation) return;
    setLoading(true);
    try {
      const start = new Date(organisation.financialYear.startDate);
      const end = new Date(organisation.financialYear.endDate);
      
      start.setFullYear(start.getFullYear() + 1);
      end.setFullYear(end.getFullYear() + 1);
      
      await updateDoc(doc(db, 'organisations', organisation.id), {
        financialYear: {
          startDate: start.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0]
        }
      });
      setIsRolloverConfirmOpen(false);
      showToast('Financial year rolled over successfully.', 'success');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportConfig = () => {
    if (!organisation) return;
    const config = {
      organisation,
      departments,
      chartOfAccounts,
      paymentCycles,
      holidays
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${organisation.name}_config.json`;
    link.click();
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!profile) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        ...profileForm,
        updatedAt: new Date().toISOString()
      });
      await refreshProfile();
      showToast('Profile updated successfully.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'users');
      showToast('Failed to update profile.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAnotherOrganisation = async () => {
    if (isDemo) {
      showToast('This action is not available in demo mode.', 'warning');
      return;
    }
    if (!profile || !user) return;
    
    if (!confirm('You are about to start setting up another organisation. You will be redirected to the setup page. You can switch back later from the login screen (if multiple organisations are supported for your email). Continue?')) return;

    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        organisationId: '',
        currentOrg: '',
        updatedAt: new Date().toISOString()
      });
      localStorage.removeItem('activeOrganisationId');
      await refreshProfile();
      // App.tsx handles the redirect to /setup if organisationId is missing
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'users');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      // Note: In a production app, we'd upload to Firebase Storage.
      // For now, we'll store as base64 if it's small, or just use a placeholder.
      if (base64.length > 500000) { // 0.5MB limit for Firestore document field
        showToast('Image is too large. Please use an image smaller than 500KB.', 'error');
        return;
      }
      setProfileForm({ ...profileForm, photoURL: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadManual = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    let y = 20;

    // Title
    doc.setFontSize(24);
    doc.setTextColor(15, 23, 42);
    doc.text('PaY Flow: User Manual', margin, y);
    y += 10;
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text('Operational Guide & System Documentation', margin, y);
    y += 15;

    // Introduction
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('1. Introduction', margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const intro = "PaY Flow is a professional, high-performance expense management and payroll platform designed to transform how organisations handle their financial workflows. By moving away from manual, paper-based systems, PaY Flow provides a fully digitised environment that streamlines the entire payment lifecycle—from initial requisition to final disbursement.";
    const splitIntro = doc.splitTextToSize(intro, pageWidth - (margin * 2));
    doc.text(splitIntro, margin, y);
    y += (splitIntro.length * 5) + 10;

    // Company Setup
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('2. Setting Up Your Company', margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const setupSteps = [
      "1. Organisation Profile: Go to Settings > Organisation. Enter your CIPC number, address, and contact details.",
      "2. Financial Year: Define your financial year start and end dates. This is critical for budget tracking.",
      "3. Departments: Create departments (e.g., Operations, Finance) to act as primary cost-allocation units.",
      "4. Chart of Accounts: Define specific accounts for granular tracking. You can import these via CSV.",
      "5. VAT Rate: Set your organisation's standard VAT rate (e.g., 15%) in the Organisation settings."
    ];
    setupSteps.forEach(line => {
      const splitLine = doc.splitTextToSize(line, pageWidth - (margin * 2));
      doc.text(splitLine, margin, y);
      y += (splitLine.length * 5) + 2;
    });
    y += 8;

    // Payment Requisitions
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('3. How to do Payment Requisitions', margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const reqSteps = [
      "1. Navigate to Requisitions: Click the 'Requisitions' link in the sidebar.",
      "2. Create New: Click 'New Requisition'. Select a Contact (Supplier/Contractor).",
      "3. Add Line Items: For each expense, enter the invoice number, date, and description.",
      "4. Link to Project: Select the relevant Project, Phase, and Chart of Account for each line item.",
      "5. VAT Selection: Choose 'Inclusive', 'Exclusive', or 'No VAT'. The system calculates totals automatically.",
      "6. Attachments: Upload a digital copy of the invoice (PDF or Image).",
      "7. Submit: Click 'Submit Requisition' to start the approval workflow."
    ];
    reqSteps.forEach(line => {
      const splitLine = doc.splitTextToSize(line, pageWidth - (margin * 2));
      doc.text(splitLine, margin, y);
      y += (splitLine.length * 5) + 2;
    });
    y += 8;

    // Adding Contacts
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('4. Managing Contacts (Suppliers/Contractors)', margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const contactSteps = [
      "1. Navigate to Contacts: Click the 'Contacts' link in the sidebar.",
      "2. Add Contact: Click 'Add Contact'. Enter the name, email, and contact number.",
      "3. Category: Select if they are a Supplier, Contractor, or Employee.",
      "4. Bank Details: Enter their banking information (Bank Name, Account Number, Branch Code).",
      "5. Attachments: Upload compliance documents (e.g., B-BBEE certificates, Tax Clearance)."
    ];
    contactSteps.forEach(line => {
      const splitLine = doc.splitTextToSize(line, pageWidth - (margin * 2));
      doc.text(splitLine, margin, y);
      y += (splitLine.length * 5) + 2;
    });
    y += 10;

    // Roles Table
    doc.addPage();
    y = 20;
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('5. User Roles & Permissions', margin, y);
    y += 5;
    
    autoTable(doc, {
      startY: y,
      head: [['Role', 'Permissions Overview']],
      body: [
        ['Super User', 'Full access to all settings, user management, and data clearing.'],
        ['CEO / CFO', 'High-level oversight. Can approve large requisitions and view all reports.'],
        ['Financial Manager', 'Manages day-to-day financial operations, processes payroll, and VAT.'],
        ['Manager', 'Manage own department, approve requisitions within budget.'],
        ['Requester', 'Standard user. Create requisitions, manage contacts.']
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] },
      margin: { left: margin, right: margin }
    });
    
    y = (doc as any).lastAutoTable.finalY + 15;

    // Core Workflows
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('6. Core Operational Workflows', margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const workflows = [
      "• Requisitions: Create digital forms, attach invoices, and link to projects/departments/accounts.",
      "• Approval Flow: Requests automatically move to relevant managers based on thresholds.",
      "• Project Tracking: Live 'Actual vs Budget' expenditure updates on the dashboard.",
      "• Payroll: Monthly processing with automatic SARS tax bracket calculations."
    ];
    workflows.forEach(line => {
      doc.text(line, margin, y);
      y += 6;
    });
    y += 10;

    // AI Features
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('7. Advanced AI Features', margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const aiText = "PaY Flow integrates Gemini AI to provide intelligent insights. Use the 'Analyse with AI' buttons on reports to get risk assessments, or use the PFAI assistant in the bottom right for drafting emails or explaining financial data.";
    const splitAi = doc.splitTextToSize(aiText, pageWidth - (margin * 2));
    doc.text(splitAi, margin, y);
    y += (splitAi.length * 5) + 15;

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Generated by PaY Flow System - Efficiency in Every Cent.', pageWidth / 2, 285, { align: 'center' });

    doc.save('PaY_Flow_User_Manual.pdf');
    showToast('User Manual downloaded as PDF.', 'success');
  };

  const handleManagePortal = async () => {
    if (isDemo) {
      showToast('Billing management is not available in demo mode.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/billing/manage-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: user?.email,
          subscriptionCode: organisation?.subscription?.code
        })
      });

      const data = await response.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error(data.error || 'Failed to generate portal link');
      }
    } catch (error: any) {
      console.error('Portal Error:', error);
      showToast(error.message || 'Failed to open billing portal', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (isDemo) {
      showToast('Subscription management is not available in demo mode.', 'warning');
      return;
    }

    if (!confirm('Are you sure you want to cancel your subscription? Your data will remain accessible until the end of the current period.')) {
      return;
    }

    setCancelling(true);
    try {
      const response = await fetch('/api/billing/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionCode: organisation?.subscription?.code,
          email: user?.email
        })
      });

      const data = await response.json();
      if (data.success) {
        if (organisation?.id) {
          await updateDoc(doc(db, 'organisations', organisation.id), {
            'subscription.status': 'cancelling',
            'subscription.cancelAt': data.expiryDate
          });
        }
        showToast('Subscription cancelled. It will remain active until ' + formatDate(data.expiryDate), 'info');
      } else {
        throw new Error(data.error || 'Failed to cancel subscription');
      }
    } catch (error: any) {
      console.error('Cancellation Error:', error);
      showToast(error.message || 'Failed to cancel subscription', 'error');
    } finally {
      setCancelling(false);
    }
  };

  if (!['Super User', 'Financial Manager', 'CEO/CFO'].includes(profile?.role || '') && activeTab === 'organisation') {
    setActiveTab('profile');
  }

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500">Manage your personal profile and organisation configuration.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleDownloadManual}
            className="p-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 font-medium"
          >
            <FileDown size={18} />
            User Manual (PDF)
          </button>
          {showInstallBtn && (
            <button 
              onClick={handleInstallClick}
              className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-2 font-bold shadow-lg shadow-emerald-100"
            >
              <Download size={18} />
              Download App
            </button>
          )}
          <button 
            onClick={() => {
              window.location.reload();
            }}
            className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-all flex items-center gap-2 font-medium"
          >
            <RefreshCw size={18} />
            Refresh App
          </button>
        </div>
      </header>

      <div className="flex bg-white p-1 rounded-2xl border border-slate-100 w-fit">
        <button 
          onClick={() => setActiveTab('profile')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
            activeTab === 'profile' ? "bg-slate-900 text-white shadow-lg shadow-slate-200" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          <UserIcon size={18} />
          My Profile
        </button>
        {['Super User', 'Financial Manager', 'CEO/CFO'].includes(profile?.role || '') && (
          <button 
            onClick={() => setActiveTab('organisation')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
              activeTab === 'organisation' ? "bg-slate-900 text-white shadow-lg shadow-slate-200" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <Building2 size={18} />
            Organisation Settings
          </button>
        )}
      </div>

      {activeTab === 'profile' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 text-center">
              <div className="relative w-32 h-32 mx-auto mb-6">
                <div className="w-full h-full bg-slate-100 rounded-full overflow-hidden flex items-center justify-center border-4 border-white shadow-md">
                  {profileForm.photoURL ? (
                    <img src={profileForm.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon size={48} className="text-slate-300" />
                  )}
                </div>
                <label className="absolute bottom-0 right-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-700 transition-all shadow-lg border-2 border-white">
                  <Camera size={18} />
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              </div>
              <h3 className="text-xl font-bold text-slate-900">{profileForm.displayName} {profileForm.surname}</h3>
              <p className="text-sm text-slate-500">{profileForm.position || profile?.role}</p>
              <div className="mt-6 pt-6 border-t border-slate-50 text-left">
                <div className="flex items-center gap-3 text-slate-500 mb-4">
                  <Shield size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">{profile?.role}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500">
                  <Building2 size={16} />
                  <span className="text-sm font-medium">{organisation?.name}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <UserIcon size={20} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Personal Information</h2>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">First Name</label>
                    <input 
                      type="text" 
                      required
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={profileForm.displayName}
                      onChange={e => setProfileForm({ ...profileForm, displayName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Surname</label>
                    <input 
                      type="text" 
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={profileForm.surname}
                      onChange={e => setProfileForm({ ...profileForm, surname: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Position / Job Title</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Operations Manager"
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={profileForm.position}
                      onChange={e => setProfileForm({ ...profileForm, position: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Email Address (Read-only)</label>
                    <input 
                      type="email" 
                      disabled
                      className="w-full p-4 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
                      value={profile?.email}
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                  <button 
                    type="submit"
                    disabled={loading}
                    className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                    Save Changes
                  </button>
                </div>
              </form>

              <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col items-center">
                <div className="bg-slate-50 p-6 rounded-3xl w-full text-center">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Manage Organisations</h3>
                  <p className="text-sm text-slate-500 mb-6">Want to create or join a different organisation?</p>
                  <button 
                    onClick={handleAddAnotherOrganisation}
                    disabled={loading}
                    className="flex items-center gap-2 bg-white text-slate-700 px-6 py-3 rounded-2xl font-bold border border-slate-200 hover:bg-slate-50 transition-all mx-auto shadow-sm"
                  >
                    <Plus size={20} />
                    Add Another Organisation
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {!activeOrgSection ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <OrgSectionCard 
                title="Team Management" 
                icon={<Users size={24} />} 
                description="Manage users, roles and invitations"
                onClick={() => setActiveOrgSection('team')}
                color="blue"
              />
              <OrgSectionCard 
                title="Departments" 
                icon={<Building2 size={24} />} 
                description="Configure organisational departments"
                onClick={() => setActiveOrgSection('departments')}
                color="blue"
              />
              <OrgSectionCard 
                title="Chart of Accounts" 
                icon={<Building2 size={24} />} 
                description="Manage budget allocation accounts"
                onClick={() => setActiveOrgSection('chart-of-accounts')}
                color="amber"
              />
              <OrgSectionCard 
                title="Payment Cycles" 
                icon={<Clock size={24} />} 
                description="Configure recurring payment dates"
                onClick={() => setActiveOrgSection('cycles')}
                color="indigo"
              />
              <OrgSectionCard 
                title="Public Holidays" 
                icon={<Palmtree size={24} />} 
                description="Manage non-working payment days"
                onClick={() => setActiveOrgSection('holidays')}
                color="rose"
              />
              <OrgSectionCard 
                title="Organisation Details" 
                icon={<Shield size={24} />} 
                description="Company info, logo and external links"
                onClick={() => setActiveOrgSection('details')}
                color="slate"
              />
              <OrgSectionCard 
                title="Financial Year" 
                icon={<Calendar size={24} />} 
                description="Manage periods and data rollover"
                onClick={() => setActiveOrgSection('financial')}
                color="emerald"
              />
              <OrgSectionCard 
                title="Subscription" 
                icon={<CreditCard size={24} />} 
                description="Manage your plan and billing"
                onClick={() => setActiveOrgSection('subscription')}
                color="indigo"
              />
            </div>
          ) : (
            <div className="space-y-6">
              <button 
                onClick={() => setActiveOrgSection(null)}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold text-sm transition-all mb-4"
              >
                <ArrowLeft size={16} />
                Back to Organisation Settings
              </button>

              {activeOrgSection === 'team' && (
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                      <Users size={20} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">Team Management</h2>
                  </div>
                  <p className="text-xs text-slate-500 mb-6">
                    Manage your organisation's team members and their roles. 
                    <span className="block mt-1 text-blue-600 font-medium">
                      Tip: Configure SMTP settings in the AI Studio Secrets panel for fully automatic invitation emails.
                    </span>
                  </p>

          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase">Email</label>
              <input 
                type="email" 
                required
                placeholder="user@example.com" 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase">Full Name</label>
              <input 
                type="text" 
                placeholder="Optional" 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                value={newUser.displayName}
                onChange={e => setNewUser({ ...newUser, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase">Role</label>
              <select 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value as any })}
              >
                <option value="Requester">Requester</option>
                <option value="Financial Manager">Financial Manager</option>
                <option value="CEO/CFO">CEO / CFO</option>
                <option value="Super User">Super User</option>
              </select>
            </div>
            <div className="flex items-end">
              <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                Add Member
              </button>
            </div>
          </form>

          {lastInviteLink && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-8 p-6 bg-blue-600 rounded-3xl text-white shadow-xl shadow-blue-200 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <Sparkles size={120} />
              </div>
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <LinkIcon size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">
                        {lastInviteLink.includes('invite=') ? 'Invitation Link Generated' : 'User Added Successfully'}
                      </h3>
                      <p className="text-blue-100 text-xs">
                        {lastInviteLink.includes('invite=') 
                          ? 'Copy and share this link with the new team member.' 
                          : 'This user already has an account. Share this login link with them.'}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setLastInviteLink(null)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-3 font-mono text-sm truncate">
                    {lastInviteLink}
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(lastInviteLink);
                      showToast('Link copied to clipboard!', 'success');
                    }}
                    className="bg-white text-blue-600 px-6 py-3 rounded-xl font-bold hover:bg-blue-50 transition-all flex items-center gap-2 whitespace-nowrap"
                  >
                    <Copy size={18} />
                    Copy Link
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          <div className="overflow-x-auto mb-8">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="pb-4">User</th>
                  <th className="pb-4">Role</th>
                  <th className="pb-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {orgUsers.map(u => (
                  <tr key={u.uid} className="group">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 overflow-hidden">
                          {u.photoURL ? (
                            <img src={u.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            u.displayName?.charAt(0) || u.email?.charAt(0)
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{u.displayName || 'Unnamed User'}</p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-lg text-[10px] font-bold uppercase",
                        u.role === 'Super User' ? "bg-purple-50 text-purple-600" :
                        u.role === 'CEO/CFO' ? "bg-blue-50 text-blue-600" :
                        u.role === 'Financial Manager' ? "bg-amber-50 text-amber-600" :
                        "bg-slate-50 text-slate-600"
                      )}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      {u.uid !== profile?.uid && (
                        <button 
                          onClick={() => handleRemoveUser(u.uid)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invites.length > 0 && (
            <div className="mt-8 border-t border-slate-50 pt-8">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Clock size={16} className="text-amber-500" />
                Pending Invitations
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      <th className="pb-4">Email</th>
                      <th className="pb-4">Role</th>
                      <th className="pb-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {invites.map(invite => (
                      <tr key={invite.id} className="group">
                        <td className="py-4">
                          <p className="text-sm font-medium text-slate-900">{invite.email}</p>
                          <p className="text-[10px] text-slate-400">Invited by {invite.invitedBy}</p>
                        </td>
                        <td className="py-4">
                          <span className="px-2 py-1 bg-slate-50 text-slate-600 rounded-lg text-[10px] font-bold uppercase">
                            {invite.role}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="flex flex-col items-end gap-1">
                              <button 
                                onClick={() => handleSendInviteEmail(invite)}
                                disabled={loading}
                                className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg flex items-center gap-2 text-xs font-bold hover:bg-blue-100 transition-all border border-blue-100"
                                title="Send Email Invitation via your local mail client"
                              >
                                <Mail size={14} />
                                <span className="hidden sm:inline">Send Email</span>
                                <Sparkles size={10} className="text-blue-400" />
                              </button>
                              <p className="text-[9px] text-slate-400 italic">Opens your mail client</p>
                            </div>
                            <button 
                              onClick={() => {
                                const link = `${window.location.origin}/signup?invite=${invite.id}`;
                                navigator.clipboard.writeText(link);
                                showToast('Invite link copied to clipboard!', 'success');
                              }}
                              className="px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg flex items-center gap-2 text-xs font-bold hover:bg-slate-100 transition-all border border-slate-100"
                              title="Copy Invite Link"
                            >
                              <Copy size={14} />
                              <span className="hidden sm:inline">Copy Link</span>
                            </button>
                            <button 
                              onClick={() => handleCancelInvite(invite.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Cancel Invite"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeOrgSection === 'departments' && (
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <Users size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Departments</h2>
          </div>
          
          <form onSubmit={handleAddDept} className="flex gap-2 mb-6">
            <input 
              type="text" 
              placeholder="New Department Name" 
              className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              value={newDept}
              onChange={e => setNewDept(e.target.value)}
            />
            <button disabled={loading} className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-all">
              <Plus size={24} />
            </button>
          </form>

          <div className="space-y-3">
            {departments.filter(d => d.name !== 'General').map(dept => (
              <div key={dept.id} className="p-4 bg-slate-50 rounded-2xl group border border-transparent hover:border-blue-100 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-slate-900">{dept.name}</span>
                  <button 
                    onClick={async () => { 
                      if (isDemo) {
                        showToast('This action is not available in demo mode.', 'warning');
                        return;
                      }
                      if(confirm('Delete department?')) {
                        try {
                          await deleteDoc(doc(db, 'departments', dept.id));
                          showToast('Department deleted.', 'info');
                        } catch (err) {
                          handleFirestoreError(err, OperationType.DELETE, 'departments');
                        }
                      }
                    }}
                    className="text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Yearly Budget (ZAR)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">R</span>
                      <input 
                        type="number"
                        className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        defaultValue={dept.yearlyBudget || 0}
                        onBlur={async (e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val !== dept.yearlyBudget) {
                            try {
                              await updateDoc(doc(db, 'departments', dept.id), { yearlyBudget: val });
                              showToast(`Updated budget for ${dept.name}`, 'success');
                            } catch (err) {
                              handleFirestoreError(err, OperationType.UPDATE, 'departments');
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeOrgSection === 'chart-of-accounts' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                  <Building2 size={20} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Chart of Accounts</h2>
              </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleDownloadCCTemplate}
                className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:underline"
                title="Download CSV Template"
              >
                <Download size={14} /> Template
              </button>
              <label className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer">
                <Upload size={14} /> Import
                <input 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={handleImportCC}
                  disabled={loading}
                />
              </label>
            </div>
          </div>
          
          <form onSubmit={handleAddCC} className="flex gap-2 mb-6">
            <input 
              type="text" 
              placeholder="New Account Name" 
              className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              value={newCC}
              onChange={e => setNewCC(e.target.value)}
            />
            <button disabled={loading} className="bg-amber-600 text-white p-3 rounded-xl hover:bg-amber-700 transition-all">
              <Plus size={24} />
            </button>
          </form>

          <div className="space-y-2">
            {[...chartOfAccounts].sort((a, b) => {
              if (a.status === 'Archived' && b.status !== 'Archived') return 1;
              if (a.status !== 'Archived' && b.status === 'Archived') return -1;
              return a.name.localeCompare(b.name);
            }).map(cc => (
              <div key={cc.id} className={cn(
                "flex items-center justify-between p-4 rounded-2xl group transition-all",
                cc.status === 'Archived' ? "bg-slate-100 opacity-60" : "bg-slate-50"
              )}>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "font-medium",
                    cc.status === 'Archived' ? "text-slate-400 line-through" : "text-slate-700"
                  )}>
                    {cc.name}
                  </span>
                  {cc.status === 'Archived' && (
                    <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase">Archived</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {['Super User', 'Financial Manager'].includes(profile?.role || '') && (
                    <button 
                      onClick={() => handleToggleArchiveCC(cc)}
                      className="text-slate-400 hover:text-amber-600 opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-white rounded-lg"
                      title={cc.status === 'Archived' ? "Unarchive" : "Archive"}
                    >
                      {cc.status === 'Archived' ? <ArchiveRestore size={18} /> : <Archive size={18} />}
                    </button>
                  )}
                  <button 
                    onClick={async () => { 
                      if (isDemo) {
                        showToast('This action is not available in demo mode.', 'warning');
                        return;
                      }
                      if(confirm('Delete account?')) {
                        try {
                          await deleteDoc(doc(db, 'chartOfAccounts', cc.id));
                          showToast('Account deleted.', 'info');
                        } catch (err) {
                          handleFirestoreError(err, OperationType.DELETE, 'chartOfAccounts');
                        }
                      }
                    }}
                    className="text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-white rounded-lg"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeOrgSection === 'cycles' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <Clock size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Payment Cycles</h2>
            </div>
          
          <form onSubmit={handleAddCycle} className="space-y-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Cycle Type</label>
                <select 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newCycle.type}
                  onChange={e => setNewCycle({ ...newCycle, type: e.target.value as any })}
                >
                  <option value="Weekly">Weekly</option>
                  <option value="Bi-weekly">Bi-weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
              <div className="space-y-1">
                {newCycle.type === 'Custom' ? (
                  <>
                    <label className="text-xs font-bold text-slate-400 uppercase">Add Date</label>
                    <div className="flex gap-2">
                      <input 
                        type="date" 
                        className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={customDate}
                        onChange={e => setCustomDate(e.target.value)}
                      />
                      <button 
                        type="button"
                        onClick={() => {
                          if (customDate && !newCycle.customDates.includes(customDate)) {
                            setNewCycle({ ...newCycle, customDates: [...newCycle.customDates, customDate] });
                            setCustomDate('');
                          }
                        }}
                        className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="text-xs font-bold text-slate-400 uppercase">Start Date</label>
                    <input 
                      type="date" 
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newCycle.startDate}
                      onChange={e => setNewCycle({ ...newCycle, startDate: e.target.value })}
                    />
                  </>
                )}
              </div>
            </div>

            {newCycle.type === 'Custom' && newCycle.customDates.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                {newCycle.customDates.sort().map(date => (
                  <span key={date} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600">
                    {date}
                    <button 
                      type="button"
                      onClick={() => setNewCycle({ ...newCycle, customDates: newCycle.customDates.filter(d => d !== date) })}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <button 
              type="submit"
              disabled={loading} 
              className="w-full bg-indigo-600 text-white p-3 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
              {loading ? 'Processing...' : 'Add Payment Cycle'}
            </button>
          </form>

          <div className="space-y-2">
            {paymentCycles.map(cycle => (
              <div key={cycle.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-900">{cycle.type} Cycle</span>
                  <button 
                    onClick={async () => { 
                      if (isDemo) {
                        showToast('This action is not available in demo mode.', 'warning');
                        return;
                      }
                      if(confirm('Delete cycle?')) {
                        try {
                          await deleteDoc(doc(db, 'paymentCycles', cycle.id));
                          showToast('Payment cycle deleted.', 'info');
                        } catch (err) {
                          handleFirestoreError(err, OperationType.DELETE, 'paymentCycles');
                        }
                      }
                    }}
                    className="text-slate-400 hover:text-rose-600 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <p className="text-xs text-slate-500">Next 3 dates:</p>
                <div className="flex gap-2 mt-1">
                  {cycle.paymentDates.slice(0, 3).map((d, i) => (
                    <span key={i} className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {paymentCycles.length > 0 && (
              <button 
                onClick={handleRecalculateCycles}
                disabled={loading}
                className="w-full mt-4 text-indigo-600 text-xs font-bold hover:underline flex items-center justify-center gap-1"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                Recalculate all cycles for holidays
              </button>
            )}
          </div>
        </div>
      )}

      {activeOrgSection === 'holidays' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                <Palmtree size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Public Holidays</h2>
            </div>
          
          <form onSubmit={handleAddHoliday} className="space-y-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Holiday Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Christmas" 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500"
                  value={newHoliday.name}
                  onChange={e => setNewHoliday({ ...newHoliday, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Date</label>
                <input 
                  type="date" 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500"
                  value={newHoliday.date}
                  onChange={e => setNewHoliday({ ...newHoliday, date: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button disabled={loading} className="flex-1 bg-rose-600 text-white p-3 rounded-xl font-bold hover:bg-rose-700 transition-all flex items-center justify-center gap-2">
                {editingHoliday ? <RefreshCw size={20} /> : <Plus size={20} />}
                {editingHoliday ? 'Update Holiday' : 'Add Holiday'}
              </button>
              {editingHoliday && (
                <button 
                  type="button"
                  onClick={() => {
                    setEditingHoliday(null);
                    setNewHoliday({ name: '', date: '' });
                  }}
                  className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {holidays.sort((a, b) => a.date.localeCompare(b.date)).map(h => (
              <div key={h.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl group border border-transparent hover:border-rose-100 transition-all">
                <div>
                  <p className="font-bold text-slate-900 text-sm">{h.name}</p>
                  <p className="text-xs text-slate-500">{h.date}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => {
                      setEditingHoliday(h);
                      setNewHoliday({ name: h.name, date: h.date });
                    }}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button 
                    onClick={async () => { 
                      if (isDemo) {
                        showToast('This action is not available in demo mode.', 'warning');
                        return;
                      }
                      if(confirm('Delete holiday?')) {
                        try {
                          await deleteDoc(doc(db, 'publicHolidays', h.id));
                          showToast('Holiday deleted.', 'info');
                        } catch (err) {
                          handleFirestoreError(err, OperationType.DELETE, 'publicHolidays');
                        }
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeOrgSection === 'details' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center">
                  <Shield size={20} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Organisation Details & External Links</h2>
              </div>
            <button 
              onClick={handleExportConfig}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
            >
              <RefreshCw size={12} /> Export Configuration (JSON)
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 relative group">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Company Logo</p>
              <div className="flex items-center gap-4">
                {organisation?.logoURL ? (
                  <img src={organisation.logoURL} alt="Logo" className="w-16 h-16 object-contain rounded-lg bg-white p-1 border border-slate-200" />
                ) : (
                  <div className="w-16 h-16 bg-white border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-300">
                    <Building2 size={24} />
                  </div>
                )}
                {['Super User', 'Financial Manager'].includes(profile?.role || '') && (
                  <label className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer transition-all">
                    Upload Logo
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </label>
                )}
              </div>
            </div>
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">CIPC Number</p>
              <p className="text-lg font-bold text-slate-900">{organisation?.cipcNumber}</p>
              <a 
                href={`https://www.bizportal.gov.za/`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline mt-2 inline-block"
              >
                Verify on BizPortal →
              </a>
            </div>
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Address</p>
              <p className="text-sm font-medium text-slate-900 line-clamp-2">{organisation?.address}</p>
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(organisation?.address || '')}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline mt-2 inline-block"
              >
                Open in Google Maps →
              </a>
            </div>
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Telephone</p>
              <p className="text-lg font-bold text-slate-900">{organisation?.telephone}</p>
              <a 
                href={`tel:${organisation?.telephone}`}
                className="text-xs text-blue-600 hover:underline mt-2 inline-block"
              >
                Call Organisation →
              </a>
            </div>
          </div>
        </div>
      )}

      {activeOrgSection === 'financial' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 lg:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <Calendar size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Financial Year</h2>
            </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Current Period</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Starts</p>
                  <p className="text-lg font-bold text-slate-900">{organisation?.financialYear.startDate}</p>
                </div>
                <ArrowRight className="text-slate-300" />
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-500">Ends</p>
                  <p className="text-lg font-bold text-slate-900">{organisation?.financialYear.endDate}</p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-center justify-center gap-4">
              {profile?.role === 'Super User' && (
                <div className="w-full p-6 bg-blue-50 rounded-3xl border border-blue-100 mb-4">
                  <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <Shield size={18} />
                    Tax Settings
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-blue-400 uppercase tracking-widest">VAT Rate (%)</label>
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          step="0.01"
                          className="flex-1 p-3 bg-white border border-blue-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                          value={vatRate}
                          onChange={e => setVatRate(Number(e.target.value))}
                        />
                        <button 
                          onClick={handleUpdateVatRate}
                          disabled={loading}
                          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="animate-spin" size={18} /> : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <button 
                onClick={() => setIsRolloverConfirmOpen(true)}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                Rollover Financial Year
              </button>
              
              {profile?.role === 'Super User' && (
                <button 
                  onClick={() => setIsClearDataModalOpen(true)}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-rose-50 text-rose-600 px-8 py-4 rounded-2xl font-bold hover:bg-rose-100 transition-all border border-rose-100"
                >
                  <AlertTriangle size={20} />
                  Clear All Organisation Data
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeOrgSection === 'subscription' && (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <CreditCard size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Subscription & Billing</h2>
            </div>
            <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
              <button 
                onClick={() => setSubscriptionTab('overview')}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  subscriptionTab === 'overview' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:bg-slate-100"
                )}
              >
                Overview
              </button>
              <button 
                onClick={() => setSubscriptionTab('billing')}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  subscriptionTab === 'billing' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:bg-slate-100"
                )}
              >
                Billing Settings
              </button>
            </div>
          </div>

          {subscriptionTab === 'overview' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Current Plan</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900">{organisation?.subscription?.plan || 'Standard'}</h3>
                      <p className="text-sm text-slate-500">Monthly Subscription</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-indigo-600">{formatCurrency(organisation?.subscription?.price || 450)}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Excl. VAT</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                      <Clock size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-indigo-900">Subscription Status</p>
                      <span className={cn(
                        "text-[10px] uppercase font-black px-2 py-0.5 rounded-md",
                        organisation?.subscription?.status === 'trial' ? "bg-amber-100 text-amber-700" :
                        organisation?.subscription?.status === 'active' ? "bg-emerald-100 text-emerald-700" :
                        organisation?.subscription?.status === 'cancelling' ? "bg-rose-100 text-rose-700" :
                        "bg-slate-100 text-slate-700"
                      )}>
                        {organisation?.subscription?.status || 'Active'}
                      </span>
                    </div>
                  </div>
                  {organisation?.subscription?.status === 'trial' && (
                    <p className="text-sm text-indigo-800">
                      Your free trial ends on <strong>{formatDate(organisation.subscription.trialEndDate)}</strong>.
                    </p>
                  )}
                  {organisation?.subscription?.status === 'cancelling' && (
                    <div className="mt-2 p-3 bg-white/50 rounded-xl border border-indigo-200">
                      <p className="text-sm text-indigo-900 font-medium">Cancellation Pending</p>
                      <p className="text-xs text-indigo-700">
                        Your subscription will remain active until <strong>{formatDate(organisation.subscription.cancelAt)}</strong>.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-900 p-8 rounded-3xl text-white shadow-xl shadow-slate-200 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-bold mb-2">Plan Benefits</h3>
                  <ul className="space-y-3 mb-6">
                    {['Unlimited Requisitions', 'Automated Payroll', 'AI-Powered Insights', 'SARS Tax Compliance'].map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-400">
                        <CheckCircle2 size={16} className="text-emerald-500" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <button className="w-full bg-white text-slate-900 p-4 rounded-2xl font-bold hover:bg-slate-100 transition-all flex items-center justify-center gap-2">
                  <Mail size={20} />
                  Contact Support
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-400 border border-slate-200">
                    <CreditCard size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Payment Methods</h3>
                    <p className="text-sm text-slate-500 max-w-md">
                      Securely add, remove, or update your credit/debit cards via our payment partner, Paystack.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={handleManagePortal}
                  disabled={loading}
                  className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Shield size={20} />}
                  Manage Payment Methods
                </button>
              </div>

              <div className="p-8 bg-white border border-rose-100 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="text-lg font-bold text-rose-600">Cancel Subscription</h3>
                  <p className="text-sm text-slate-500 max-w-md">
                    Looking to pause or stop your subscription? Your data will remain accessible until the end of your billing cycle.
                  </p>
                </div>
                <button 
                  onClick={handleCancelSubscription}
                  disabled={cancelling || organisation?.subscription?.status === 'cancelling' || organisation?.subscription?.status === 'trial'}
                  className="bg-white text-rose-600 border border-rose-200 px-8 py-4 rounded-2xl font-bold hover:bg-rose-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {cancelling ? <Loader2 className="animate-spin" size={20} /> : 'Cancel Subscription'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )}
</div>
)}

    {isRolloverConfirmOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Confirm Rollover</h2>
                <button onClick={() => setIsRolloverConfirmOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <p className="text-sm text-amber-800 leading-relaxed">
                    <strong>Warning:</strong> This action will advance the financial year dates by one year. 
                    This is typically done at the end of a financial period. 
                    Current Period: {organisation?.financialYear.startDate} to {organisation?.financialYear.endDate}
                  </p>
                </div>
                <button
                  onClick={handleRollover}
                  className="w-full bg-slate-900 text-white p-4 rounded-2xl font-bold hover:bg-slate-800 transition-all"
                >
                  Confirm Rollover
                </button>
              </div>
            </div>
          </div>
        )}

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
                  This will permanently delete all requisitions, contacts, and recurring costs for this organisation. 
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
                  Clear All Data
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}


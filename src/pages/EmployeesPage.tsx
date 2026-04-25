import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, updateDoc, doc, deleteDoc, where, getDocs, getDocFromServer } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { Employee, Department } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import { UserPlus, CheckCircle, Folder, Trash2, ShieldCheck, AlertCircle, Upload, Scan, FileText, Users, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { handleFirestoreError, OperationType } from '../lib/error-handling';

const SA_BANKS = [
  { name: 'Absa Bank', code: '632005' },
  { name: 'Capitec Bank', code: '470010' },
  { name: 'First National Bank (FNB)', code: '250655' },
  { name: 'Nedbank', code: '198765' },
  { name: 'Standard Bank', code: '051001' },
  { name: 'Investec Bank', code: '580105' },
  { name: 'African Bank', code: '430000' },
  { name: 'TymeBank', code: '678910' },
  { name: 'Discovery Bank', code: '679000' },
];

const NETWORKS = ['Vodacom', 'MTN', 'Cell C', 'Telkom', 'Other'];

import { useTenantQuery } from '../hooks/useTenantQuery';
import { useDemoData } from '../hooks/useDemoData';
import { useLeaveCalculations } from '../hooks/useLeaveCalculations';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { addYears, parseISO, format } from 'date-fns';

export const EmployeesPage: React.FC = () => {
  const { organisation, profile, user: authUser, can } = useAuth();
  const { demoEmployees, IS_DEMO_MODE } = useDemoData(organisation?.id);
  const { refreshSickLeaveCycle } = useLeaveCalculations();

  const { data: realEmployees } = useTenantQuery<Employee>('employees');
  const { data: realDepartments } = useTenantQuery<Department>('departments');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<string | null>(null);

  // Table Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // New Employee State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [surname, setSurname] = useState('');
  const [idType, setIdType] = useState<'ID' | 'Passport' | 'Asylum'>('ID');
  const [idValue, setIdValue] = useState('');
  const [deptId, setDeptId] = useState('');
  const [employmentCategory, setEmploymentCategory] = useState<('Field Operations' | 'Support Operations')[]>(['Field Operations']);
  const [gender, setGender] = useState<'Male' | 'Female'>('Male');
  const [dob, setDob] = useState('');
  const [commencementDate, setCommencementDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'EFT' | 'PayShap'>('Cash');
  
  // Payment Details State
  const [bankName, setBankName] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [accType, setAccType] = useState('Savings');
  const [ownAccount, setOwnAccount] = useState(true);
  const [branchCode, setBranchCode] = useState('');
  const [cellphone, setCellphone] = useState('');
  const [network, setNetwork] = useState('');

  useEffect(() => {
    if (!organisation) return;
    
    if (organisation.id.startsWith('demo_')) {
      setEmployees(demoEmployees);
      setDepartments([{ id: 'dept_1', name: 'Field Operations', orgId: organisation.id } as Department]);
      return;
    }

    setEmployees(IS_DEMO_MODE ? [...demoEmployees, ...realEmployees] : realEmployees);
    setDepartments(realDepartments);

    // Auto-refresh sick leave cycles for real employees
    if (!IS_DEMO_MODE && organisation && realEmployees.length > 0) {
      realEmployees.forEach(emp => refreshSickLeaveCycle(emp, organisation.id));
    }
  }, [organisation?.id, realEmployees, realDepartments, demoEmployees, IS_DEMO_MODE]);

  const checkDuplicate = async () => {
    if (!organisation) return false;
    
    // Check across all ID fields
    const qId = query(collection(db, `organisations/${organisation.id}/employees`), where('idNumber', '==', idValue));
    const qPassport = query(collection(db, `organisations/${organisation.id}/employees`), where('passportNumber', '==', idValue));
    const qAsylum = query(collection(db, `organisations/${organisation.id}/employees`), where('asylumNumber', '==', idValue));
    
    const [snapId, snapPassport, snapAsylum] = await Promise.all([
      getDocs(qId),
      getDocs(qPassport),
      getDocs(qAsylum)
    ]);
    
    return !snapId.empty || !snapPassport.empty || !snapAsylum.empty;
  };

  const addEmployee = async () => {
    if (!firstName || !lastName || !surname || !organisation || !deptId || !idValue) {
      toast.error('Please fill in all mandatory fields');
      return;
    }

    if (!can('canCreateEmployees')) {
      toast.error('You do not have permission to onboard employees');
      return;
    }

    // Payment validation
    if (paymentMethod === 'EFT' && (!bankName || !accNumber)) {
      toast.error('Bank Name and Account Number are mandatory for EFT');
      return;
    }
    if (paymentMethod === 'PayShap' && (!bankName || !cellphone)) {
      toast.error('Bank Name and Linked Cellphone are mandatory for PayShap');
      return;
    }

    const isDuplicate = await checkDuplicate();
    if (isDuplicate) {
      toast.error('Employee already exists with this ID/Passport/Asylum number');
      return;
    }

    try {
      const dept = departments.find(d => d.id === deptId);
      const newEmployee: Partial<Employee> = {
        firstName,
        lastName,
        surname,
        id_type: idType,
        id_number: idValue,
        departmentId: deptId,
        department_name: dept?.name,
        employment_category: employmentCategory,
        date_of_birth: dob,
        gender,
        commencement_date: commencementDate,
        cell_no: cellphone,
        paymentMethod,
        bank_name: (paymentMethod === 'EFT' || paymentMethod === 'PayShap') ? bankName : undefined,
        account_no: paymentMethod === 'EFT' ? accNumber : undefined,
        branch_code: (paymentMethod === 'EFT' || paymentMethod === 'PayShap') ? (SA_BANKS.find(b => b.name === bankName)?.code || branchCode) : undefined,
        linked_cell_no: paymentMethod === 'PayShap' ? cellphone : undefined,
        verification_status: 'Draft',
        status: 'active',
        accrued_leave_hours: 0,
        accrued_leave_days: 0,
        sick_leave_balance: 30,
        sick_leave_cycle_start: new Date().toISOString(),
        orgId: organisation.id,
        createdAt: new Date().toISOString(),
        // Legacy
        idNumber: idType === 'ID' ? idValue : undefined,
        passportNumber: idType === 'Passport' ? idValue : undefined,
        asylumNumber: idType === 'Asylum' ? idValue : undefined,
      };

      const path = `organisations/${organisation.id}/employees`;
      await addDoc(collection(db, path), newEmployee);
      setIsAddOpen(false);
      resetForm();
      toast.success('Employee onboarded successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `organisations/${organisation.id}/employees`, { currentUser: authUser });
    }
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setSurname('');
    setIdValue('');
    setDeptId('');
    setPaymentMethod('Cash');
    setBankName('');
    setAccNumber('');
    setCellphone('');
    setDob('');
    setGender('Male');
  };

  const verifyEmployee = async (empId: string, status: Employee['verification_status']) => {
    if (!organisation || !can('canVerifyEmployees')) {
      toast.error('Only QA or Admin can verify employees');
      return;
    }
    try {
      const path = `organisations/${organisation.id}/employees/${empId}`;
      await updateDoc(doc(db, path), {
        verification_status: status,
        verified_by: profile?.displayName,
        verified_date: new Date().toISOString()
      });
      toast.success(`Employee status updated to ${status}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `organisations/${organisation.id}/employees/${empId}`, { currentUser: authUser });
    }
  };

  const handleDelete = async () => {
    if (!organisation || !employeeToDelete) return;
    const emp = employees.find(e => e.id === employeeToDelete);
    if (!emp) return;

    const isFullyUnverified = Object.values(emp.verificationStatus).every(v => v === 'unverified');
    const canDelete = profile?.role === 'admin' || profile?.role === 'qa' || (profile?.role === 'supervisor' && isFullyUnverified);

    if (!canDelete) {
      toast.error('You do not have permission to delete this record');
      return;
    }

    try {
      const path = `organisations/${organisation.id}/employees/${employeeToDelete}`;
      await deleteDoc(doc(db, path));
      toast.success('Employee record deleted');
      setIsDeleteConfirmOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `organisations/${organisation.id}/employees/${employeeToDelete}`, { currentUser: authUser });
    }
  };

  const stats = {
    total: employees.length,
    verifiedBank: employees.filter(e => e.verificationStatus?.bankingDetails === 'verified').length,
    unverifiedBank: employees.filter(e => e.verificationStatus?.bankingDetails === 'unverified').length,
  };

  const filteredEmployees = employees.filter(emp => {
    const fullName = `${emp.firstName} ${emp.lastName} ${emp.surname}`.toLowerCase();
    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || (emp.idNumber || '').includes(searchTerm);
    const matchesDept = filterDept === 'all' || emp.departmentId === filterDept;
    const matchesStatus = filterStatus === 'all' || emp.verificationStatus?.personalInfo === filterStatus;
    return matchesSearch && matchesDept && matchesStatus;
  });

  return (
    <ErrorBoundary>
      <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white border-[var(--color-border)]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-muted-foreground)]">Total Workforce</p>
                <h3 className="text-2xl font-bold">{stats.total}</h3>
              </div>
              <Users className="w-8 h-8 text-[var(--color-primary)] opacity-20" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-[var(--color-border)]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-muted-foreground)]">Verified Banking</p>
                <h3 className="text-2xl font-bold text-green-600">{stats.verifiedBank}</h3>
              </div>
              <ShieldCheck className="w-8 h-8 text-green-600 opacity-20" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-[var(--color-border)]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-muted-foreground)]">Pending Verification</p>
                <h3 className="text-2xl font-bold text-orange-600">{stats.unverifiedBank}</h3>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-600 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight text-[var(--color-primary)]">Workforce Management</h2>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={
            <Button className="bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-bold rounded-xl shadow-lg shadow-[var(--color-primary)]/20">
              <UserPlus className="w-4 h-4 mr-2" />
              Onboard Employee
            </Button>
          } />
          <DialogContent className="max-w-2xl w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] md:max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-[1.5rem] sm:rounded-[2rem] border-none shadow-2xl">
            <DialogHeader className="p-6 border-b">
              <DialogTitle className="text-2xl font-bold text-[var(--color-primary)]">Employee Onboarding</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-8">
                {/* Personal Info */}
                <section className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-[var(--color-primary)]">
                    <div className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-xs">1</div>
                    Personal Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">First Name</label>
                      <Input value={firstName} onChange={e => setFirstName(e.target.value)} className="rounded-lg" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">Surname</label>
                      <Input value={surname} onChange={e => setSurname(e.target.value)} className="rounded-lg" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">Gender</label>
                      <Select value={gender} onValueChange={(v: any) => setGender(v)}>
                        <SelectTrigger className="rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">Date of Birth</label>
                      <Input type="date" value={dob} onChange={e => setDob(e.target.value)} className="rounded-lg" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">Commencement Date</label>
                      <Input type="date" value={commencementDate} onChange={e => setCommencementDate(e.target.value)} className="rounded-lg" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">ID Type</label>
                      <Select value={idType} onValueChange={(v: any) => setIdType(v)}>
                        <SelectTrigger className="rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ID">SA ID Number</SelectItem>
                          <SelectItem value="Passport">Passport Number</SelectItem>
                          <SelectItem value="Asylum">Asylum Number</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">ID Number</label>
                      <Input value={idValue} onChange={e => setIdValue(e.target.value)} className="rounded-lg" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">Department</label>
                      <Select value={deptId} onValueChange={setDeptId}>
                        <SelectTrigger className="rounded-lg">
                          <SelectValue placeholder="Select Department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </section>

                {/* Payment Details */}
                <section className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-[var(--color-primary)]">
                    <div className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-xs">2</div>
                    Payment Details
                  </h4>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">Payment Method</label>
                    <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                      <SelectTrigger className="rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="EFT">EFT (Bank Transfer)</SelectItem>
                        <SelectItem value="Cash Send">Cash Send</SelectItem>
                        <SelectItem value="PayShap">PayShap</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {paymentMethod === 'EFT' && (
                    <div className="space-y-4 p-4 bg-[var(--color-background)] rounded-xl border border-[var(--color-border)]">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold">Bank Name</label>
                          <Select value={bankName} onValueChange={setBankName}>
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="Select Bank" />
                            </SelectTrigger>
                            <SelectContent>
                              {SA_BANKS.map(b => (
                                <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold">Branch Code</label>
                          <Input value={SA_BANKS.find(b => b.name === bankName)?.code || ''} readOnly className="bg-gray-50" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold">Account Number</label>
                        <Input value={accNumber} onChange={e => setAccNumber(e.target.value)} className="bg-white" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold">Account Type</label>
                          <Select value={accType} onValueChange={setAccType}>
                            <SelectTrigger className="bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Savings">Savings</SelectItem>
                              <SelectItem value="Current">Current / Cheque</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2 pt-8">
                          <input type="checkbox" checked={ownAccount} onChange={e => setOwnAccount(e.target.checked)} />
                          <label className="text-xs font-bold">Own Account</label>
                        </div>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'Cash' && (
                    <div className="space-y-4 p-4 bg-[var(--color-background)] rounded-xl border border-[var(--color-border)]">
                      <div className="space-y-2">
                        <label className="text-xs font-bold">Cellphone Number (+27)</label>
                        <Input value={cellphone} onChange={e => setCellphone(e.target.value)} placeholder="082 123 4567" className="bg-white" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold">Network</label>
                        <Select value={network} onValueChange={setNetwork}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select Network" />
                          </SelectTrigger>
                          <SelectContent>
                            {NETWORKS.map(n => (
                              <SelectItem key={n} value={n}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'PayShap' && (
                    <div className="space-y-4 p-4 bg-[var(--color-background)] rounded-xl border border-[var(--color-border)]">
                      <div className="space-y-2">
                        <label className="text-xs font-bold">Bank Name</label>
                        <Select value={bankName} onValueChange={setBankName}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select Bank" />
                          </SelectTrigger>
                          <SelectContent>
                            {SA_BANKS.map(b => (
                              <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold">Linked Cellphone (+27)</label>
                        <Input value={cellphone} onChange={e => setCellphone(e.target.value)} placeholder="082 123 4567" className="bg-white" />
                      </div>
                    </div>
                  )}
                </section>

                {/* Attachments Section */}
                <section className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-[var(--color-primary)]">
                    <div className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-xs">3</div>
                    Verification Documents
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="p-4 border-2 border-dashed border-[var(--color-border)] rounded-xl flex items-center justify-between hover:bg-[var(--color-background)] transition-colors cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-[var(--color-primary)]/10 rounded-lg text-[var(--color-primary)]">
                          <Scan className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">ID / Passport / Asylum</p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">Scan or upload multiple pages</p>
                        </div>
                      </div>
                      <Upload className="w-5 h-5 text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)]" />
                    </div>
                    <div className="p-4 border-2 border-dashed border-[var(--color-border)] rounded-xl flex items-center justify-between hover:bg-[var(--color-background)] transition-colors cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-[var(--color-primary)]/10 rounded-lg text-[var(--color-primary)]">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">Signed Work Agreement</p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">Scan or upload multiple pages</p>
                        </div>
                      </div>
                      <Upload className="w-5 h-5 text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)]" />
                    </div>
                  </div>
                </section>
              </div>
            </ScrollArea>
            <div className="p-6 border-t bg-white/95 backdrop-blur-sm sticky bottom-0 z-50">
              <Button className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-bold py-6 rounded-xl" onClick={addEmployee}>
                Complete Onboarding
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-6 rounded-[2rem] border-2 shadow-sm">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Search Employees</label>
          <Input 
            placeholder="Name or ID Number..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="rounded-xl border-2"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Department</label>
          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className="rounded-xl border-2">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="rounded-xl border-2">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-[var(--color-border)] shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[var(--color-background)]">
              <TableRow className="hover:bg-transparent border-b-[var(--color-border)]">
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Employee</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Department</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Payment Details</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Verification Status</TableHead>
                <TableHead className="text-right font-bold text-[var(--color-muted-foreground)]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map(emp => {
                const dept = departments.find(d => d.id === emp.departmentId);
                const isQA = profile?.role === 'qa' || profile?.role === 'admin';
                
                return (
                  <TableRow key={emp.id} className="border-b-[var(--color-border)] hover:bg-[var(--color-background)]/50 transition-colors">
                    <TableCell>
                      <div className="font-bold text-[var(--color-primary)]">{emp.firstName} {emp.surname}</div>
                      <div className="text-[10px] text-[var(--color-muted-foreground)] font-bold uppercase tracking-tighter">
                        {emp.id_number || 'No ID'} • {emp.gender}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-white border-[var(--color-border)] text-[var(--color-primary)] font-bold">
                        {emp.department_name || 'Unassigned'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-bold">{emp.paymentMethod}</div>
                      {emp.paymentMethod === 'EFT' && (
                        <div className="text-[10px] text-[var(--color-muted-foreground)] font-medium">
                          {emp.bank_name} • {emp.account_no}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge 
                          className={cn(
                            "text-[9px] font-black px-2 py-0.5 border-none cursor-pointer uppercase tracking-widest",
                            emp.verification_status === 'Verified' ? "bg-green-100 text-green-700" : 
                            emp.verification_status === 'Rejected' ? "bg-red-100 text-red-700" :
                            emp.verification_status === 'Flagged' ? "bg-purple-100 text-purple-700" :
                            "bg-orange-100 text-orange-700"
                          )}
                          onClick={() => can('canVerifyEmployees') && verifyEmployee(emp.id, 'Verified')}
                        >
                          {emp.verification_status || 'Draft'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Popover>
                          <PopoverTrigger render={
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-[var(--color-background)]">
                              <Calendar className="w-4 h-4 text-blue-500" />
                            </Button>
                          } />
                          <PopoverContent className="w-80 p-6 rounded-2xl shadow-2xl border-2">
                            <div className="space-y-4">
                              <h4 className="font-black text-lg text-[var(--color-primary)] uppercase tracking-tighter">Leave Status</h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-blue-50 rounded-xl border-2 border-blue-100">
                                  <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Annual (Hrs)</p>
                                  <p className="text-xl font-black text-blue-700">{emp.accrued_leave_hours?.toFixed(2) || 0}</p>
                                </div>
                                <div className="p-3 bg-green-50 rounded-xl border-2 border-green-100">
                                  <p className="text-[9px] font-black text-green-600 uppercase tracking-widest">Annual (Days)</p>
                                  <p className="text-xl font-black text-green-700">{emp.accrued_leave_days?.toFixed(2) || 0}</p>
                                </div>
                                <div className="p-3 bg-purple-50 rounded-xl border-2 border-purple-100 col-span-2">
                                  <p className="text-[9px] font-black text-purple-600 uppercase tracking-widest">Sick Leave Bucket (3yr)</p>
                                  <div className="flex justify-between items-end">
                                    <p className="text-xl font-black text-purple-700">{emp.sick_leave_balance || 0} / 30 Days</p>
                                    <p className="text-[8px] font-bold text-purple-400">Ends: {emp.sick_leave_cycle_start ? format(addYears(parseISO(emp.sick_leave_cycle_start), 3), 'MMM yyyy') : 'N/A'}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-[var(--color-background)]">
                          <Folder className="w-4 h-4 text-[var(--color-secondary)]" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => {
                            setEmployeeToDelete(emp.id);
                            setIsDeleteConfirmOpen(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Are you sure you want to delete this employee record? This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete Permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ErrorBoundary>
  );
};

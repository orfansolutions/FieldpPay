import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, updateDoc, doc, where, getDocs, orderBy } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { Employee, JobCard, PayrollPeriod, Deduction, Department } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { Calculator, FileText, Download, Play, CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';

import { useTenantQuery } from '../hooks/useTenantQuery';
import { useDemoData } from '../hooks/useDemoData';

export const PayrollPage: React.FC = () => {
  const { organisation, profile, can } = useAuth();
  const { demoEmployees, IS_DEMO_MODE } = useDemoData(organisation?.id);
  const { data: realPeriods } = useTenantQuery<PayrollPeriod>('payrollPeriods', [orderBy('startDate', 'desc')]);
  const { data: realDepartments } = useTenantQuery<Department>('departments');
  const { data: realEmployees } = useTenantQuery<Employee>('employees');
  const { data: realPayrollRecords } = useTenantQuery<any>('payroll');

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
  const [isNewPeriodOpen, setIsNewPeriodOpen] = useState(false);
  
  // New Period State
  const [selectedDept, setSelectedDept] = useState('');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  // Table Filter State
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  useEffect(() => {
    if (!organisation) return;

    if (organisation.id.startsWith('demo_')) {
      setEmployees(demoEmployees);
      return;
    }

    setPeriods(realPeriods);
    setDepartments(realDepartments);
    setEmployees(IS_DEMO_MODE ? [...demoEmployees, ...realEmployees] : realEmployees);
    setPayrollRecords(realPayrollRecords);
  }, [organisation?.id, realPeriods, realDepartments, realEmployees, realPayrollRecords, demoEmployees, IS_DEMO_MODE]);

  const createPeriod = async () => {
    if (!organisation || !selectedDept) return;
    try {
      await addDoc(collection(db, `organisations/${organisation.id}/payrollPeriods`), {
        department_id: selectedDept,
        startDate,
        endDate,
        status: 'open',
        orgId: organisation.id,
        processed_at: null,
        processed_by: null,
        createdAt: new Date().toISOString()
      });
      setIsNewPeriodOpen(false);
      toast.success('Payroll period opened');
    } catch (e) {
      toast.error('Failed to open period');
    }
  };

  const processPayroll = async (period: PayrollPeriod) => {
    if (!organisation || !profile) return;
    if (!can('canProcessPayroll')) {
      toast.error('You do not have permission to process payroll');
      return;
    }

    try {
      // 1. Fetch all job cards for this period and department
      const qJC = query(
        collection(db, `organisations/${organisation.id}/jobcards`),
        where('status', '==', 'Approved'),
        where('date', '>=', period.startDate),
        where('date', '<=', period.endDate)
      );
      const jcSnap = await getDocs(qJC);
      const jobCards = jcSnap.docs.map(d => ({ id: d.id, ...d.data() } as JobCard));

      // 2. Filter employees by department
      const deptEmployees = employees.filter(e => e.departmentId === period.department_id);

      // 3. Calculate earnings for each employee (simplified logic)
      // In a real app, we'd iterate through job cards and sum up wages
      
      await updateDoc(doc(db, `organisations/${organisation.id}/payrollPeriods`, period.id), {
        status: 'processed',
        processed_at: new Date().toISOString(),
        processed_by: profile.displayName
      });

      toast.success('Payroll processed successfully');
    } catch (e) {
      toast.error('Processing failed');
    }
  };

  const downloadReport = (period: PayrollPeriod) => {
    const doc = new jsPDF();
    const dept = departments.find(d => d.id === period.department_id);
    
    doc.setFontSize(20);
    doc.text('Payroll Summary Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Organisation: ${organisation?.name}`, 14, 32);
    doc.text(`Department: ${dept?.name}`, 14, 38);
    const periodLeavePay = payrollRecords.filter(r => r.period_id === period.id && r.type === 'Leave Pay');
    const totalPeriodLeavePay = periodLeavePay.reduce((acc, curr) => acc + (curr.amount || 0), 0);

    doc.text(`Period: ${period.startDate} to ${period.endDate}`, 14, 44);
    doc.text(`Status: ${period.status.toUpperCase()}`, 14, 50);
    doc.text(`Total Leave Payouts: R ${totalPeriodLeavePay.toLocaleString()}`, 14, 56);

    const tableData = employees
      .filter(e => e.departmentId === period.department_id)
      .map(e => {
        const empLeavePay = periodLeavePay.filter(r => r.employee_id === e.id).reduce((acc, curr) => acc + (curr.amount || 0), 0);
        return [
          `${e.firstName} ${e.surname}`,
          e.id_number || 'N/A',
          e.paymentMethod,
          `R ${(4500 + empLeavePay).toLocaleString()}`, // Mock gross + leave pay
          'R 45.00',    // Mock UIF
          `R ${(4455 + empLeavePay).toLocaleString()}`  // Mock Net + leave pay
        ];
      });

    autoTable(doc, {
      startY: 60,
      head: [['Employee', 'ID/Passport', 'Method', 'Gross Pay', 'UIF (1%)', 'Net Pay']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [26, 54, 93] }
    });

    doc.save(`Payroll_${dept?.name}_${period.startDate}.pdf`);
  };

  const filteredPeriods = periods.filter(p => {
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchesStartDate = !filterStartDate || p.startDate >= filterStartDate;
    const matchesEndDate = !filterEndDate || p.endDate <= filterEndDate;
    return matchesStatus && matchesStartDate && matchesEndDate;
  });

  const totalWageCost = payrollRecords.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const totalLeavePay = payrollRecords.filter(r => r.type === 'Leave Pay').reduce((acc, curr) => acc + (curr.amount || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight text-[var(--color-primary)]">Payroll Processing</h2>
        <Dialog open={isNewPeriodOpen} onOpenChange={setIsNewPeriodOpen}>
          <DialogTrigger render={
            <Button className="bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-bold rounded-xl shadow-lg shadow-[var(--color-primary)]/20">
              <Play className="w-4 h-4 mr-2" />
              Open New Pay Cycle
            </Button>
          } />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Open Payroll Period</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-bold">Department</label>
                <Select value={selectedDept} onValueChange={setSelectedDept}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold">Start Date</label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold">End Date</label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
              <Button className="w-full bg-[var(--color-primary)] text-white font-bold" onClick={createPeriod}>Open Period</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-6 rounded-[2rem] border-2 shadow-sm">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="rounded-xl border-2">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Start Date</label>
          <Input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="rounded-xl border-2" />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">End Date</label>
          <Input type="date" value={filterEndDate} onChange={e => setEndDate(e.target.value)} className="rounded-xl border-2" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white border-[var(--color-border)]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[var(--color-muted-foreground)] uppercase">Total Wage Cost</p>
                <h3 className="text-2xl font-bold text-green-600">R {totalWageCost.toLocaleString()}</h3>
                <p className="text-[9px] font-bold text-gray-400">Incl. R {totalLeavePay.toLocaleString()} Leave Pay</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[var(--color-border)] shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[var(--color-background)]">
              <TableRow className="hover:bg-transparent border-b-[var(--color-border)]">
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Department</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Period Range</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Status</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Processed By</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Total Cost</TableHead>
                <TableHead className="text-right font-bold text-[var(--color-muted-foreground)]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPeriods.map(period => {
                const dept = departments.find(d => d.id === period.department_id);
                return (
                  <TableRow key={period.id} className="border-b-[var(--color-border)] hover:bg-[var(--color-background)]/50 transition-colors">
                    <TableCell className="font-bold text-[var(--color-primary)]">{dept?.name || 'Unknown'}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{period.startDate} to {period.endDate}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(
                        "border-none font-bold px-3 py-1",
                        period.status === 'processed' ? "bg-green-100 text-green-700" : 
                        "bg-blue-100 text-blue-700"
                      )}>
                        {period.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        {period.processed_by || '-'}
                        {period.processed_at && <div className="text-[10px] text-[var(--color-muted-foreground)]">{format(new Date(period.processed_at), 'MMM d, HH:mm')}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-bold">
                        R {payrollRecords.filter(r => r.period_id === period.id).reduce((acc, curr) => acc + (curr.amount || 0), 0).toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {period.status === 'open' && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="border-green-200 text-green-700 hover:bg-green-50"
                            onClick={() => processPayroll(period)}
                          >
                            <Calculator className="w-4 h-4 mr-2" />
                            Process
                          </Button>
                        )}
                        {period.status === 'processed' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-blue-600 hover:bg-blue-50"
                            onClick={() => downloadReport(period)}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Report
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {periods.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-[var(--color-muted-foreground)] italic">
                    No payroll periods found. Open a new cycle to begin.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, where, doc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { Employee, PayrollPeriod } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Search, Calendar, User, CheckCircle, XCircle, Clock } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/error-handling';
import { useDemoData } from '../hooks/useDemoData';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: 'Annual' | 'Sick' | 'Family Responsibility' | 'Maternity' | 'Unpaid';
  startDate: string;
  endDate: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reason: string;
  orgId: string;
}

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useLeaveCalculations } from '../hooks/useLeaveCalculations';
import { Checkbox } from '../components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';

export const LeavePage: React.FC = () => {
  const { organisation, user: authUser, can } = useAuth();
  const { demoEmployees } = useDemoData(organisation?.id);
  const { autoProcessPassedLeave } = useLeaveCalculations();
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  // Pay Leave State
  const [selectedPayEmployees, setSelectedPayEmployees] = useState<string[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [payoutType, setPayoutType] = useState<'Full Balance' | 'Custom'>('Full Balance');
  const [customAmount, setCustomAmount] = useState('0');
  const [isPayPopoverOpen, setIsPayPopoverOpen] = useState(false);

  // Form State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveRequest['type']>('Annual');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reason, setReason] = useState('');

  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Approved' | 'Rejected'>('all');

  useEffect(() => {
    if (!organisation) return;

    if (organisation.id.startsWith('demo_')) {
      setEmployees(demoEmployees);
      setLeaveRequests([
        { id: 'l1', employeeId: 'emp_0', employeeName: 'John Smith', type: 'Annual', startDate: '2026-04-20', endDate: '2026-04-25', status: 'Approved', reason: 'Family vacation', orgId: organisation.id },
        { id: 'l2', employeeId: 'emp_1', employeeName: 'Jane Doe', type: 'Sick', startDate: '2026-04-15', endDate: '2026-04-16', status: 'Pending', reason: 'Flu', orgId: organisation.id }
      ]);
      return;
    }

    const empPath = `organisations/${organisation.id}/employees`;
    const qEmp = query(collection(db, empPath));
    const unsubEmp = onSnapshot(qEmp, (snap) => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
    }, (error) => handleFirestoreError(error, OperationType.GET, empPath, { currentUser: authUser }));

    const leavePath = `organisations/${organisation.id}/leave`;
    const qLeave = query(collection(db, leavePath));
    const unsubLeave = onSnapshot(qLeave, (snap) => {
      setLeaveRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
    }, (error) => handleFirestoreError(error, OperationType.GET, leavePath, { currentUser: authUser }));

    const periodPath = `organisations/${organisation.id}/payrollPeriods`;
    const qPeriods = query(collection(db, periodPath), where('status', '==', 'open'));
    const unsubPeriods = onSnapshot(qPeriods, (snap) => {
      setPayrollPeriods(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollPeriod)));
    }, (error) => handleFirestoreError(error, OperationType.GET, periodPath, { currentUser: authUser }));

    return () => {
      unsubEmp();
      unsubLeave();
      unsubPeriods();
    };
  }, [organisation, authUser]);

  useEffect(() => {
    if (organisation && !organisation.id.startsWith('demo_')) {
      autoProcessPassedLeave(organisation.id);
    }
  }, [organisation]);

  const addLeaveRequest = async () => {
    if (!selectedEmployeeId || !organisation) return;
    const emp = employees.find(e => e.id === selectedEmployeeId);
    try {
      await addDoc(collection(db, `organisations/${organisation.id}/leave`), {
        employeeId: selectedEmployeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
        type: leaveType,
        startDate,
        endDate,
        status: 'Pending',
        reason,
        orgId: organisation.id,
        createdAt: new Date().toISOString()
      });
      setIsAddOpen(false);
      setReason('');
      toast.success('Leave request submitted');
    } catch (error) {
      toast.error('Failed to submit leave request');
    }
  };

  const updateStatus = async (id: string, status: LeaveRequest['status']) => {
    if (!organisation) return;
    try {
      await updateDoc(doc(db, `organisations/${organisation.id}/leave`, id), { status });
      toast.success(`Leave ${status.toLowerCase()}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const processLeavePayout = async () => {
    if (!organisation || selectedPayEmployees.length === 0 || !selectedPeriodId) {
      if (!selectedPeriodId) toast.error('Please select a payroll period');
      return;
    }
    
    const period = payrollPeriods.find(p => p.id === selectedPeriodId);
    if (!period) return;

    try {
      const batch = writeBatch(db);
      const payrollPath = `organisations/${organisation.id}/payroll`;
      
      for (const empId of selectedPayEmployees) {
        const emp = employees.find(e => e.id === empId);
        if (!emp) continue;

        const amount = payoutType === 'Full Balance' 
          ? (emp.accrued_leave_days * 8 * 100) // Mock calculation: 8 hours per day * R100/hr
          : parseFloat(customAmount);

        const payrollRef = doc(collection(db, payrollPath));
        batch.set(payrollRef, {
          employee_id: empId,
          employee_name: `${emp.firstName} ${emp.lastName}`,
          type: 'Leave Pay',
          amount,
          period_id: selectedPeriodId,
          pay_date: period.endDate,
          status: 'Pending',
          orgId: organisation.id,
          createdAt: new Date().toISOString()
        });

        // If full payout, reset balance
        if (payoutType === 'Full Balance') {
          const empRef = doc(db, `organisations/${organisation.id}/employees`, empId);
          batch.update(empRef, {
            accrued_leave_days: 0,
            accrued_leave_hours: 0
          });
        }
      }

      await batch.commit();
      
      toast.success('Leave payout processed and added to payroll');
      setSelectedPayEmployees([]);
      setCustomAmount('0');
      setSelectedPeriodId('');
    } catch (error) {
      toast.error('Failed to process payout');
    }
  };

  const filteredRequests = leaveRequests.filter(r => {
    const matchesSearch = r.employeeName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-[var(--color-secondary)] uppercase">Leave Management</h2>
          <p className="text-[var(--color-muted-foreground)] font-bold uppercase text-[10px] tracking-widest">Track and approve employee leave requests</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={
            <Button className="bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-black rounded-xl shadow-lg shadow-[var(--color-primary)]/20">
              <Plus className="w-4 h-4 mr-2" /> Request Leave
            </Button>
          } />
          <DialogContent className="rounded-[2rem]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black text-[var(--color-primary)]">New Leave Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Employee</label>
                <select 
                  value={selectedEmployeeId} 
                  onChange={e => setSelectedEmployeeId(e.target.value)}
                  className="w-full h-12 rounded-xl border-2 px-3 bg-white font-bold"
                >
                  <option value="">Select employee...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Leave Type</label>
                <select 
                  value={leaveType} 
                  onChange={e => setLeaveType(e.target.value as any)}
                  className="w-full h-12 rounded-xl border-2 px-3 bg-white font-bold"
                >
                  <option value="Annual">Annual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Family Responsibility">Family Responsibility</option>
                  <option value="Maternity">Maternity Leave</option>
                  <option value="Unpaid">Unpaid Leave</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Start Date</label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="rounded-xl py-6 border-2" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">End Date</label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="rounded-xl py-6 border-2" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Reason</label>
                <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional details..." className="rounded-xl py-6 border-2" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addLeaveRequest} className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-black py-6 rounded-xl">Submit Request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="requests" className="w-full">
        <TabsList className="bg-gray-100 p-1 rounded-2xl mb-6">
          <TabsTrigger value="requests" className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8">Leave Requests</TabsTrigger>
          <TabsTrigger value="payout" className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8">Pay Leave</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <Card className="border-2 shadow-sm rounded-[2rem] overflow-hidden">
            <CardHeader className="border-b bg-gray-50/50 p-6">
              <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input 
                    placeholder="Search by employee..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="rounded-xl py-6 pl-12 border-2 bg-white"
                  />
                </div>
                <div className="flex gap-2">
                  {['all', 'Pending', 'Approved', 'Rejected'].map(s => (
                    <Button 
                      key={s}
                      variant={statusFilter === s ? 'default' : 'outline'}
                      onClick={() => setStatusFilter(s as any)}
                      className={cn(
                        "rounded-xl font-bold text-[10px] uppercase tracking-widest h-10 px-4",
                        statusFilter === s ? "bg-[var(--color-primary)] text-white" : "border-2"
                      )}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow className="hover:bg-transparent border-b-2">
                    <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Employee</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Type</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Dates</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Status</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map(r => (
                    <TableRow key={r.id} className="hover:bg-gray-50/50 transition-colors border-b-2 last:border-0">
                      <TableCell className="py-6 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center">
                            <User className="w-5 h-5" />
                          </div>
                          <span className="font-black text-[var(--color-secondary)]">{r.employeeName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-6 px-6">
                        <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-blue-100 text-blue-700 rounded-lg">
                          {r.type}
                        </span>
                      </TableCell>
                      <TableCell className="py-6 px-6">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {r.startDate} to {r.endDate}
                        </div>
                      </TableCell>
                      <TableCell className="py-6 px-6">
                        <div className={cn(
                          "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2",
                          r.status === 'Approved' ? "bg-green-100 text-green-700" :
                          r.status === 'Rejected' ? "bg-red-100 text-red-700" :
                          "bg-amber-100 text-amber-700"
                        )}>
                          {r.status === 'Approved' && <CheckCircle className="w-3 h-3" />}
                          {r.status === 'Rejected' && <XCircle className="w-3 h-3" />}
                          {r.status === 'Pending' && <Clock className="w-3 h-3" />}
                          {r.status}
                        </div>
                      </TableCell>
                      <TableCell className="py-6 px-6">
                        {r.status === 'Pending' && (
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" onClick={() => updateStatus(r.id, 'Approved')} className="text-green-500 hover:bg-green-50 rounded-xl">
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => updateStatus(r.id, 'Rejected')} className="text-red-500 hover:bg-red-50 rounded-xl">
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-48 text-center text-[var(--color-muted-foreground)] font-bold uppercase tracking-widest text-xs">
                        No leave requests found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payout">
          <Card className="border-2 shadow-sm rounded-[2rem] overflow-hidden">
            <CardHeader className="p-8 border-b bg-gray-50/50">
              <div className="flex flex-col md:flex-row gap-6 justify-between items-end">
                <div className="space-y-4 flex-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Select Employees for Payout</label>
                  <Popover open={isPayPopoverOpen} onOpenChange={setIsPayPopoverOpen}>
                    <PopoverTrigger render={
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={isPayPopoverOpen}
                        className="w-full justify-between rounded-xl py-6 border-2 font-bold"
                      >
                        {selectedPayEmployees.length > 0
                          ? `${selectedPayEmployees.length} employees selected`
                          : "Search and select employees..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    } />
                    <PopoverContent className="w-[400px] p-0 rounded-2xl">
                      <Command>
                        <CommandInput placeholder="Search employee..." className="h-12" />
                        <CommandList>
                          <CommandEmpty>No employee found.</CommandEmpty>
                          <CommandGroup>
                            {employees.map((emp) => (
                              <CommandItem
                                key={emp.id}
                                onSelect={() => {
                                  setSelectedPayEmployees(prev => 
                                    prev.includes(emp.id) ? prev.filter(i => i !== emp.id) : [...prev, emp.id]
                                  );
                                }}
                                className="flex items-center gap-2 py-3 px-4 cursor-pointer"
                              >
                                <Checkbox 
                                  checked={selectedPayEmployees.includes(emp.id)}
                                  className="rounded-md"
                                />
                                <div className="flex flex-col">
                                  <span className="font-black text-sm">{emp.firstName} {emp.lastName}</span>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                    Bal: {emp.accrued_leave_days?.toFixed(2) || 0}d / {emp.accrued_leave_hours?.toFixed(2) || 0}h
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-4 flex-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Payroll Period</label>
                  <select 
                    value={selectedPeriodId} 
                    onChange={e => setSelectedPeriodId(e.target.value)}
                    className="w-full h-12 rounded-xl border-2 px-4 bg-white font-black text-xs uppercase tracking-widest"
                  >
                    <option value="">Select Period</option>
                    {payrollPeriods.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.startDate} to {p.endDate}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-4 items-end">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Payout Type</label>
                    <select 
                      value={payoutType} 
                      onChange={e => setPayoutType(e.target.value as any)}
                      className="h-12 rounded-xl border-2 px-4 bg-white font-black text-xs uppercase tracking-widest"
                    >
                      <option value="Full Balance">Full Balance Payout</option>
                      <option value="Custom">Custom Amount</option>
                    </select>
                  </div>
                  {payoutType === 'Custom' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Amount (ZAR)</label>
                      <Input 
                        type="number" 
                        value={customAmount} 
                        onChange={e => setCustomAmount(e.target.value)}
                        className="rounded-xl h-12 border-2 w-32 font-black"
                      />
                    </div>
                  )}
                  <Button 
                    onClick={processLeavePayout}
                    disabled={selectedPayEmployees.length === 0}
                    className="bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-black py-6 px-8 rounded-xl shadow-lg shadow-[var(--color-primary)]/20"
                  >
                    Process Payout
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedPayEmployees.map(id => {
                  const emp = employees.find(e => e.id === id);
                  if (!emp) return null;
                  return (
                    <div key={id} className="p-4 border-2 rounded-2xl flex items-center justify-between bg-white shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-[var(--color-primary)]">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-black text-sm">{emp.firstName} {emp.lastName}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {emp.accrued_leave_days?.toFixed(2) || 0} Days Accrued
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setSelectedPayEmployees(prev => prev.filter(i => i !== id))}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
                {selectedPayEmployees.length === 0 && (
                  <div className="col-span-full py-12 text-center border-2 border-dashed rounded-[2rem] text-gray-400 font-bold uppercase tracking-widest text-xs">
                    No employees selected for payout
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

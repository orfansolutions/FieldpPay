import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, where, doc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { Employee } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Search, Filter, Wallet, User } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/error-handling';
import { useDemoData } from '../hooks/useDemoData';

interface Deduction {
  id: string;
  employeeId: string;
  employeeName: string;
  type: string;
  amount: number;
  date: string;
  description: string;
  orgId: string;
}

export const DeductionsPage: React.FC = () => {
  const { organisation, user: authUser } = useAuth();
  const { demoEmployees } = useDemoData(organisation?.id);
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  // Form State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [deductionType, setDeductionType] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  // Filter State
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!organisation) return;

    if (organisation.id.startsWith('demo_')) {
      setEmployees(demoEmployees);
      // Mock deductions for demo
      setDeductions([
        { id: 'd1', employeeId: 'emp_0', employeeName: 'John Smith', type: 'Uniform', amount: 150, date: '2026-04-10', description: 'New overall', orgId: organisation.id },
        { id: 'd2', employeeId: 'emp_1', employeeName: 'Jane Doe', type: 'Advance', amount: 500, date: '2026-04-12', description: 'Cash advance', orgId: organisation.id }
      ]);
      return;
    }

    const empPath = `organisations/${organisation.id}/employees`;
    const qEmp = query(collection(db, empPath));
    const unsubEmp = onSnapshot(qEmp, (snap) => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
    }, (error) => handleFirestoreError(error, OperationType.GET, empPath, { currentUser: authUser }));

    const dedPath = `organisations/${organisation.id}/deductions`;
    const qDed = query(collection(db, dedPath));
    const unsubDed = onSnapshot(qDed, (snap) => {
      setDeductions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Deduction)));
    }, (error) => handleFirestoreError(error, OperationType.GET, dedPath, { currentUser: authUser }));

    return () => {
      unsubEmp();
      unsubDed();
    };
  }, [organisation, authUser]);

  const addDeduction = async () => {
    if (!selectedEmployeeId || !amount || !organisation) return;
    const emp = employees.find(e => e.id === selectedEmployeeId);
    try {
      await addDoc(collection(db, `organisations/${organisation.id}/deductions`), {
        employeeId: selectedEmployeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
        type: deductionType,
        amount: parseFloat(amount),
        date,
        description,
        orgId: organisation.id,
        createdAt: new Date().toISOString()
      });
      setIsAddOpen(false);
      setAmount('');
      setDeductionType('');
      setDescription('');
      toast.success('Deduction added successfully');
    } catch (error) {
      toast.error('Failed to add deduction');
    }
  };

  const deleteDeduction = async (id: string) => {
    if (!organisation) return;
    try {
      await deleteDoc(doc(db, `organisations/${organisation.id}/deductions`, id));
      toast.success('Deduction deleted');
    } catch (error) {
      toast.error('Failed to delete deduction');
    }
  };

  const filteredDeductions = deductions.filter(d => 
    d.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-[var(--color-secondary)] uppercase">Deductions</h2>
          <p className="text-[var(--color-muted-foreground)] font-bold uppercase text-[10px] tracking-widest">Manage employee advances, uniform costs, and other deductions</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={
            <Button className="bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-black rounded-xl shadow-lg shadow-[var(--color-primary)]/20">
              <Plus className="w-4 h-4 mr-2" /> Add Deduction
            </Button>
          } />
          <DialogContent className="rounded-[2rem]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black text-[var(--color-primary)]">New Deduction</DialogTitle>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Type</label>
                  <Input value={deductionType} onChange={e => setDeductionType(e.target.value)} placeholder="e.g. Uniform" className="rounded-xl py-6 border-2" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Amount (ZAR)</label>
                  <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="rounded-xl py-6 border-2" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Date</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl py-6 border-2" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Description</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details..." className="rounded-xl py-6 border-2" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addDeduction} className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-black py-6 rounded-xl">Save Deduction</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-2 shadow-sm rounded-[2rem] overflow-hidden">
        <CardHeader className="border-b bg-gray-50/50 p-6">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Search by employee or type..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="rounded-xl py-6 pl-12 border-2 bg-white"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Employee</TableHead>
                <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Type</TableHead>
                <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Date</TableHead>
                <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6 text-right">Amount</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDeductions.map(d => (
                <TableRow key={d.id} className="hover:bg-gray-50/50 transition-colors border-b-2 last:border-0">
                  <TableCell className="py-6 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center">
                        <User className="w-5 h-5" />
                      </div>
                      <span className="font-black text-[var(--color-secondary)]">{d.employeeName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-6 px-6">
                    <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-amber-100 text-amber-700 rounded-lg">
                      {d.type}
                    </span>
                  </TableCell>
                  <TableCell className="py-6 px-6 font-bold text-gray-500">
                    {d.date}
                  </TableCell>
                  <TableCell className="py-6 px-6 text-right font-black text-red-500">
                    -R{d.amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-6 px-6">
                    <Button variant="ghost" size="icon" onClick={() => deleteDeduction(d.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredDeductions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center text-[var(--color-muted-foreground)] font-bold uppercase tracking-widest text-xs">
                    No deductions found
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

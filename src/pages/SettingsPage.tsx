import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, where, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { Department, Activity } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, FileDown, CreditCard } from 'lucide-react';
import { jsPDF } from 'jspdf';

export const SettingsPage: React.FC = () => {
  const { organisation } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  
  // New Dept State
  const [deptName, setDeptName] = useState('');
  const [payCycle, setPayCycle] = useState<'weekly' | 'bi-weekly' | 'monthly' | 'custom'>('weekly');

  // New Activity State
  const [actName, setActName] = useState('');
  const [wageRate, setWageRate] = useState('');
  const [billingRate, setBillingRate] = useState('');

  useEffect(() => {
    if (!organisation) return;

    if (organisation.id.startsWith('demo_')) {
      return;
    }

    const qDepts = query(collection(db, `organisations/${organisation.id}/departments`));
    const unsubDepts = onSnapshot(qDepts, (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    });

    const qActs = query(collection(db, `organisations/${organisation.id}/activities`));
    const unsubActs = onSnapshot(qActs, (snap) => {
      setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() } as Activity)));
    });

    return () => {
      unsubDepts();
      unsubActs();
    };
  }, [organisation]);

  const [monthlyOption, setMonthlyOption] = useState<'last_day' | 'specific_day'>('last_day');
  const [specificDay, setSpecificDay] = useState('25');
  const [weeklyStartDate, setWeeklyStartDate] = useState(new Date().toISOString().split('T')[0]);

  const addDepartment = async () => {
    if (!deptName || !organisation) return;
    try {
      await addDoc(collection(db, `organisations/${organisation.id}/departments`), {
        name: deptName,
        description: '',
        payCycle,
        monthlyOption: payCycle === 'monthly' ? monthlyOption : undefined,
        specificDay: (payCycle === 'monthly' && monthlyOption === 'specific_day') ? parseInt(specificDay) : undefined,
        weeklyStartDate: payCycle === 'weekly' ? weeklyStartDate : undefined,
        orgId: organisation.id
      });
      setDeptName('');
      toast.success('Department added');
    } catch (e) {
      toast.error('Failed to add department');
    }
  };

  const addActivity = async () => {
    if (!actName || !wageRate || !billingRate || !organisation) return;
    try {
      await addDoc(collection(db, `organisations/${organisation.id}/activities`), {
        name: actName,
        wageRate: parseFloat(wageRate),
        billingRate: parseFloat(billingRate),
        subActivities: [],
        orgId: organisation.id
      });
      setActName('');
      setWageRate('');
      setBillingRate('');
      toast.success('Activity added');
    } catch (e) {
      toast.error('Failed to add activity');
    }
  };

  const deleteItem = async (col: string, id: string) => {
    if (!organisation) return;
    try {
      await deleteDoc(doc(db, `organisations/${organisation.id}/${col}`, id));
      toast.success('Deleted');
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const generateManual = () => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text('FieldPay User Manual', 20, 20);
    doc.setFontSize(12);
    doc.text('Introduction', 20, 35);
    doc.text('FieldPay is a comprehensive workforce management solution designed for farms and field operations.', 20, 45);
    doc.text('1. Organisation Setup: Configure your departments and activities in Settings.', 20, 60);
    doc.text('2. Employee Management: Onboard and verify your workforce.', 20, 70);
    doc.text('3. Job Cards: Record daily work, teams, and outputs.', 20, 80);
    doc.text('4. Invoicing: Generate invoices from verified job cards.', 20, 90);
    doc.save('FieldPay_Manual.pdf');
    toast.success('Manual downloaded');
  };

  const handleManageBilling = async () => {
    if (!organisation?.paystackCustomerCode) {
      toast.error('No billing account found. Please subscribe first.');
      return;
    }

    // Paystack doesn't have a direct portal like Stripe, so we redirect to dashboard
    window.open('https://dashboard.paystack.com', '_blank');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">Settings & Master Data</h2>
        <div className="flex gap-4">
          <Button 
            variant="outline"
            onClick={handleManageBilling}
            className="border-2 font-bold rounded-xl"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Manage Billing
          </Button>
          <Button 
            onClick={generateManual} 
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-bold rounded-xl shadow-lg shadow-[var(--color-primary)]/20"
          >
            <FileDown className="w-4 h-4 mr-2" />
            Download User Manual
          </Button>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Departments */}
        <Card className="border-[var(--color-border)] shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-[var(--color-primary)]">Departments & Pay Cycles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col gap-4 p-4 bg-[var(--color-background)] rounded-xl border border-[var(--color-border)]">
              <Input 
                placeholder="Dept Name" 
                value={deptName} 
                onChange={e => setDeptName(e.target.value)} 
                className="bg-white border-[var(--color-border)]"
              />
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Select value={payCycle} onValueChange={(v: any) => setPayCycle(v)}>
                    <SelectTrigger className="flex-1 bg-white border-[var(--color-border)]">
                      <SelectValue placeholder="Pay Cycle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {payCycle === 'monthly' && (
                  <div className="space-y-2 p-3 bg-white rounded-lg border border-[var(--color-border)]">
                    <label className="text-xs font-bold uppercase">Monthly Option</label>
                    <Select value={monthlyOption} onValueChange={(v: any) => setMonthlyOption(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="last_day">Last working day of month</SelectItem>
                        <SelectItem value="specific_day">Specific day of month</SelectItem>
                      </SelectContent>
                    </Select>
                    {monthlyOption === 'specific_day' && (
                      <Input 
                        type="number" 
                        min="1" 
                        max="31" 
                        value={specificDay} 
                        onChange={e => setSpecificDay(e.target.value)} 
                        placeholder="Day (e.g. 25)"
                      />
                    )}
                  </div>
                )}

                {payCycle === 'weekly' && (
                  <div className="space-y-2 p-3 bg-white rounded-lg border border-[var(--color-border)]">
                    <label className="text-xs font-bold uppercase">Start Date (to calculate future dates)</label>
                    <Input 
                      type="date" 
                      value={weeklyStartDate} 
                      onChange={e => setWeeklyStartDate(e.target.value)} 
                    />
                  </div>
                )}

                <Button onClick={addDepartment} className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-bold">
                  Add Department
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader className="bg-[var(--color-background)]">
                <TableRow className="hover:bg-transparent border-b-[var(--color-border)]">
                  <TableHead className="font-bold text-[var(--color-muted-foreground)]">Name</TableHead>
                  <TableHead className="font-bold text-[var(--color-muted-foreground)]">Cycle</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map(d => (
                  <TableRow key={d.id} className="border-b-[var(--color-border)] hover:bg-[var(--color-background)]/50 transition-colors">
                    <TableCell className="font-bold text-[var(--color-primary)]">{d.name}</TableCell>
                    <TableCell className="capitalize">{d.payCycle}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => deleteItem('departments', d.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Activities */}
        <Card className="border-[var(--color-border)] shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-[var(--color-primary)]">Activities & Rates (ZAR)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 p-4 bg-[var(--color-background)] rounded-xl border border-[var(--color-border)]">
              <Input 
                placeholder="Activity Name" 
                value={actName} 
                onChange={e => setActName(e.target.value)} 
                className="col-span-2 bg-white border-[var(--color-border)]" 
              />
              <Input 
                type="number" 
                placeholder="Wage Rate" 
                value={wageRate} 
                onChange={e => setWageRate(e.target.value)} 
                className="bg-white border-[var(--color-border)]"
              />
              <Input 
                type="number" 
                placeholder="Billing Rate" 
                value={billingRate} 
                onChange={e => setBillingRate(e.target.value)} 
                className="bg-white border-[var(--color-border)]"
              />
              <Button onClick={addActivity} className="col-span-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-bold">
                Add Activity
              </Button>
            </div>
            <Table>
              <TableHeader className="bg-[var(--color-background)]">
                <TableRow className="hover:bg-transparent border-b-[var(--color-border)]">
                  <TableHead className="font-bold text-[var(--color-muted-foreground)]">Name</TableHead>
                  <TableHead className="font-bold text-[var(--color-muted-foreground)]">Wage</TableHead>
                  <TableHead className="font-bold text-[var(--color-muted-foreground)]">Bill</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map(a => (
                  <TableRow key={a.id} className="border-b-[var(--color-border)] hover:bg-[var(--color-background)]/50 transition-colors">
                    <TableCell className="font-bold text-[var(--color-primary)]">{a.name}</TableCell>
                    <TableCell>R{a.wageRate}</TableCell>
                    <TableCell>R{a.billingRate}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => deleteItem('activities', a.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

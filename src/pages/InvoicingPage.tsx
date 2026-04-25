import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, addDoc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { JobCard, Invoice } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Receipt, FileCheck, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

import { useDemoData } from '../hooks/useDemoData';

export const InvoicingPage: React.FC = () => {
  const { organisation, can } = useAuth();
  const { demoJobCards, IS_DEMO_MODE } = useDemoData(organisation?.id);
  const [pendingJobCards, setPendingJobCards] = useState<JobCard[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  // Table Filter State
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterClient, setFilterClient] = useState('all');

  useEffect(() => {
    if (!organisation) return;

    if (organisation.id.startsWith('demo_')) {
      setPendingJobCards(demoJobCards.filter(jc => jc.status === 'Submitted'));
      return;
    }

    const qPending = query(collection(db, `organisations/${organisation.id}/jobcards`), where('status', '==', 'Approved'));
    const unsubPending = onSnapshot(qPending, (snap) => {
      const realCards = snap.docs.map(d => ({ id: d.id, ...d.data() } as JobCard));
      const allCards = IS_DEMO_MODE ? [...demoJobCards.filter(jc => jc.status === 'Submitted'), ...realCards] : realCards;
      setPendingJobCards(allCards);
    });

    const qInv = query(collection(db, `organisations/${organisation.id}/invoices`));
    const unsubInv = onSnapshot(qInv, (snap) => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
    });

    return () => {
      unsubPending();
      unsubInv();
    };
  }, [organisation]);

  const generateInvoice = async () => {
    if (pendingJobCards.length === 0 || !organisation) return;

    if (!can('canGenerateInvoices')) {
      toast.error('You do not have permission to generate invoices');
      return;
    }
    
    try {
      const invId = `INV-${Date.now()}`;
      const total = pendingJobCards.length * 500; // Mock calculation
      
      await addDoc(collection(db, `organisations/${organisation.id}/invoices`), {
        invoiceNumber: invId,
        jobCardIds: pendingJobCards.map(jc => jc.id),
        totalAmount: total,
        status: 'pending',
        orgId: organisation.id,
        createdAt: new Date().toISOString()
      });

      // Update Job Cards status
      for (const jc of pendingJobCards) {
        await updateDoc(doc(db, `organisations/${organisation.id}/jobcards`, jc.id), {
          status: 'Invoiced'
        });
      }

      toast.success(`Invoice ${invId} generated!`);
    } catch (e) {
      toast.error('Failed to generate invoice');
    }
  };

  const analyticsData = [
    { name: 'Invoiced', value: invoices.reduce((acc, curr) => acc + curr.totalAmount, 0) },
    { name: 'Pending', value: pendingJobCards.length * 500 },
  ];

  const filteredPending = pendingJobCards.filter(jc => {
    const matchesClient = filterClient === 'all' || jc.clientId === filterClient;
    const matchesStartDate = !filterStartDate || jc.date >= filterStartDate;
    const matchesEndDate = !filterEndDate || jc.date <= filterEndDate;
    return matchesClient && matchesStartDate && matchesEndDate;
  });

  const filteredInvoices = invoices.filter(inv => {
    const invDate = format(new Date(inv.createdAt), 'yyyy-MM-dd');
    const matchesStartDate = !filterStartDate || invDate >= filterStartDate;
    const matchesEndDate = !filterEndDate || invDate <= filterEndDate;
    return matchesStartDate && matchesEndDate;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <h2 className="text-3xl font-bold tracking-tight">Invoicing Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-6 rounded-[2rem] border-2 shadow-sm">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Start Date</label>
          <Input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="rounded-xl border-2" />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">End Date</label>
          <Input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="rounded-xl border-2" />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Client</label>
          <Input 
            placeholder="Search by client..." 
            value={filterClient === 'all' ? '' : filterClient} 
            onChange={e => setFilterClient(e.target.value || 'all')} 
            className="rounded-xl border-2" 
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-[var(--color-border)] shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Invoiced vs Pending (ZAR)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analyticsData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E0E4D9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6E756E', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6E756E', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E0E4D9', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                />
                <Bar dataKey="value" fill="#718355" radius={[6, 6, 0, 0]} barSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-[var(--color-border)] shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-6 bg-[var(--trial-bg)] rounded-2xl border border-black/5">
              <p className="text-xs text-[var(--trial-text)] font-bold uppercase tracking-widest opacity-70">Verified Job Cards</p>
              <p className="text-4xl font-extrabold text-[var(--trial-text)] mt-1">{pendingJobCards.length}</p>
            </div>
            <Button 
              className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-bold py-6 rounded-xl shadow-lg shadow-[var(--color-primary)]/20" 
              onClick={generateInvoice} 
              disabled={pendingJobCards.length === 0}
            >
              <Receipt className="w-5 h-5 mr-3" />
              Generate Batch Invoice
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="bg-white/50 border border-[var(--color-border)] p-1 rounded-xl">
          <TabsTrigger value="pending" className="rounded-lg data-[state=active]:bg-[var(--color-primary)] data-[state=active]:text-white">Pending Invoicing</TabsTrigger>
          <TabsTrigger value="invoiced" className="rounded-lg data-[state=active]:bg-[var(--color-primary)] data-[state=active]:text-white">Invoiced History</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-6">
          <Card className="border-[var(--color-border)] shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-[var(--color-background)]">
                  <TableRow className="hover:bg-transparent border-b-[var(--color-border)]">
                    <TableHead className="font-bold text-[var(--color-muted-foreground)]">Date</TableHead>
                    <TableHead className="font-bold text-[var(--color-muted-foreground)]">Client</TableHead>
                    <TableHead className="font-bold text-[var(--color-muted-foreground)]">Site</TableHead>
                    <TableHead className="font-bold text-[var(--color-muted-foreground)]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPending.map(jc => (
                    <TableRow key={jc.id} className="border-b-[var(--color-border)] hover:bg-[var(--color-background)]/50 transition-colors">
                      <TableCell className="font-medium">{jc.date}</TableCell>
                      <TableCell className="font-bold text-[var(--color-primary)]">{jc.client_name || jc.clientId}</TableCell>
                      <TableCell>{jc.site_name || jc.siteId}</TableCell>
                      <TableCell>
                        <Badge className="bg-[#E6F4EA] text-[#1E7E34] border-none font-bold px-3 py-1">Approved</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pendingJobCards.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-[var(--color-muted-foreground)] italic">
                        No verified job cards ready for invoicing.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="invoiced" className="mt-6">
          <Card className="border-[var(--color-border)] shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-[var(--color-background)]">
                  <TableRow className="hover:bg-transparent border-b-[var(--color-border)]">
                    <TableHead className="font-bold text-[var(--color-muted-foreground)]">Invoice #</TableHead>
                    <TableHead className="font-bold text-[var(--color-muted-foreground)]">Date</TableHead>
                    <TableHead className="font-bold text-[var(--color-muted-foreground)]">Amount</TableHead>
                    <TableHead className="font-bold text-[var(--color-muted-foreground)]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map(inv => (
                    <TableRow key={inv.id} className="border-b-[var(--color-border)] hover:bg-[var(--color-background)]/50 transition-colors">
                      <TableCell className="font-bold text-[var(--color-primary)]">{inv.invoiceNumber}</TableCell>
                      <TableCell>{format(new Date(inv.createdAt), 'yyyy-MM-dd')}</TableCell>
                      <TableCell className="font-bold">R{inv.totalAmount.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className="bg-[var(--color-accent)] text-[var(--color-accent-foreground)] border-none font-bold px-3 py-1">
                          {inv.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

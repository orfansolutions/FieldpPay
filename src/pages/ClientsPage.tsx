import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, where, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { Client, Site } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Building2, MapPin, Search, Filter } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/error-handling';
import { useDemoData } from '../hooks/useDemoData';

export const ClientsPage: React.FC = () => {
  const { organisation, user: authUser, can } = useAuth();
  const { demoClients, demoSites, IS_DEMO_MODE } = useDemoData(organisation?.id);
  
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [isAddSiteOpen, setIsAddSiteOpen] = useState(false);
  
  // Form State
  const [clientName, setClientName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [siteName, setSiteName] = useState('');
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    if (!organisation) return;

    if (organisation.id.startsWith('demo_')) {
      setClients(demoClients);
      setSites(demoSites);
      return;
    }

    const clientsPath = `organisations/${organisation.id}/clients`;
    const qClients = query(collection(db, clientsPath));
    const unsubClients = onSnapshot(qClients, (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    }, (error) => handleFirestoreError(error, OperationType.GET, clientsPath, { currentUser: authUser }));

    const sitesPath = `organisations/${organisation.id}/sites`;
    const qSites = query(collection(db, sitesPath));
    const unsubSites = onSnapshot(qSites, (snap) => {
      setSites(snap.docs.map(d => ({ id: d.id, ...d.data() } as Site)));
    }, (error) => handleFirestoreError(error, OperationType.GET, sitesPath, { currentUser: authUser }));

    return () => {
      unsubClients();
      unsubSites();
    };
  }, [organisation, authUser]);

  const addClient = async () => {
    if (!clientName || !organisation) return;
    try {
      await addDoc(collection(db, `organisations/${organisation.id}/clients`), {
        name: clientName,
        status: 'active',
        orgId: organisation.id,
        createdAt: new Date().toISOString()
      });
      setClientName('');
      setIsAddClientOpen(false);
      toast.success('Client added successfully');
    } catch (error) {
      toast.error('Failed to add client');
    }
  };

  const addSite = async () => {
    if (!siteName || !selectedClientId || !organisation) return;
    try {
      await addDoc(collection(db, `organisations/${organisation.id}/sites`), {
        name: siteName,
        clientId: selectedClientId,
        status: 'active',
        orgId: organisation.id,
        createdAt: new Date().toISOString()
      });
      setSiteName('');
      setIsAddSiteOpen(false);
      toast.success('Site added successfully');
    } catch (error) {
      toast.error('Failed to add site');
    }
  };

  const deleteClient = async (id: string) => {
    if (!organisation) return;
    try {
      await deleteDoc(doc(db, `organisations/${organisation.id}/clients`, id));
      toast.success('Client deleted');
    } catch (error) {
      toast.error('Failed to delete client');
    }
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-[var(--color-secondary)] uppercase">Clients & Sites</h2>
          <p className="text-[var(--color-muted-foreground)] font-bold uppercase text-[10px] tracking-widest">Manage your customer base and operational locations</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isAddClientOpen} onOpenChange={setIsAddClientOpen}>
            <DialogTrigger render={
              <Button className="bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-black rounded-xl shadow-lg shadow-[var(--color-primary)]/20">
                <Plus className="w-4 h-4 mr-2" /> Add Client
              </Button>
            } />
            <DialogContent className="rounded-[2rem]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black text-[var(--color-primary)]">Add New Client</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Client Name</label>
                  <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Golden Harvest Farms" className="rounded-xl py-6 border-2" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={addClient} className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-black py-6 rounded-xl">Save Client</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddSiteOpen} onOpenChange={setIsAddSiteOpen}>
            <DialogTrigger render={
              <Button variant="outline" className="border-2 border-[var(--color-primary)] text-[var(--color-primary)] font-black rounded-xl hover:bg-[var(--color-primary)]/5">
                <MapPin className="w-4 h-4 mr-2" /> Add Site
              </Button>
            } />
            <DialogContent className="rounded-[2rem]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black text-[var(--color-primary)]">Add New Site</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Select Client</label>
                  <select 
                    value={selectedClientId} 
                    onChange={e => setSelectedClientId(e.target.value)}
                    className="w-full h-12 rounded-xl border-2 px-3 bg-white font-bold"
                  >
                    <option value="">Select a client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Site Name</label>
                  <Input value={siteName} onChange={e => setSiteName(e.target.value)} placeholder="e.g. Block A - Orchards" className="rounded-xl py-6 border-2" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={addSite} className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-black py-6 rounded-xl">Save Site</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-2 shadow-sm rounded-[2rem] overflow-hidden">
        <CardHeader className="border-b bg-gray-50/50 p-6">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Search clients..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="rounded-xl py-6 pl-12 border-2 bg-white"
              />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <Button variant="outline" className="rounded-xl border-2 font-bold">
                <Filter className="w-4 h-4 mr-2" /> Filter
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Client Name</TableHead>
                <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Sites</TableHead>
                <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map(client => (
                <TableRow key={client.id} className="hover:bg-gray-50/50 transition-colors border-b-2 last:border-0">
                  <TableCell className="py-6 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <span className="font-black text-[var(--color-secondary)]">{client.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-6 px-6">
                    <div className="flex flex-wrap gap-2">
                      {sites.filter(s => s.clientId === client.id).map(site => (
                        <div key={site.id} className="px-3 py-1 bg-gray-100 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 flex items-center gap-2">
                          <MapPin className="w-3 h-3" />
                          {site.name}
                        </div>
                      ))}
                      {sites.filter(s => s.clientId === client.id).length === 0 && (
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">No sites added</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-6 px-6">
                    <div className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-[10px] font-black uppercase tracking-widest inline-block">
                      {client.status}
                    </div>
                  </TableCell>
                  <TableCell className="py-6 px-6">
                    <Button variant="ghost" size="icon" onClick={() => deleteClient(client.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredClients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-48 text-center text-[var(--color-muted-foreground)] font-bold uppercase tracking-widest text-xs">
                    No clients found matching your search
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

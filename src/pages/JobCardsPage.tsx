import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, where, doc, updateDoc, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { JobCard, Employee, Activity, Client, Site, Department } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import { Plus, Save, Send, UserPlus, CheckCircle, Users, FileUp, MapPin, Fuel, Package, Clock, History, Search, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { handleFirestoreError, OperationType } from '../lib/error-handling';
import { useSearchParams } from 'react-router-dom';

import { useTenantQuery } from '../hooks/useTenantQuery';
import { useDemoData } from '../hooks/useDemoData';
import { useLeaveCalculations } from '../hooks/useLeaveCalculations';

export const JobCardsPage: React.FC = () => {
  const { organisation, profile, user: authUser, can } = useAuth();
  const { demoEmployees, demoClients, demoSites, demoJobCards, demoActivities, IS_DEMO_MODE } = useDemoData(organisation?.id);
  const { accrueLeaveFromJobCard } = useLeaveCalculations();

  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [currentJobCardId, setCurrentJobCardId] = useState<string | null>(null);

  // Form State
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [jobCardType, setJobCardType] = useState<'Field Operations' | 'Distribution' | 'Maintenance' | 'Other'>('Field Operations');
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [product, setProduct] = useState('');
  const [productVariation, setProductVariation] = useState('');
  const [wageMethod, setWageMethod] = useState<'Hours' | 'Team Output' | 'Individual Output'>('Hours');
  const [billingMethod, setBillingMethod] = useState<'Hours' | 'Quantity'>('Hours');
  const [remunerationType, setRemunerationType] = useState<'Wage' | 'Invoice' | 'Both'>('Both');
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [individualOutputs, setIndividualOutputs] = useState<Record<string, number>>({});
  const [teamSearch, setTeamSearch] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [lunchStart, setLunchStart] = useState('');
  const [lunchFinish, setLunchFinish] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [hoursWorked, setHoursWorked] = useState('0');
  
  // Distribution specific
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [primaryVehicleReg, setPrimaryVehicleReg] = useState('');
  const [openingMileage, setOpeningMileage] = useState('0');
  const [closingMileage, setClosingMileage] = useState('0');
  const [fuelEntries, setFuelEntries] = useState<{ date: string; liters: number; cost: number; odometer: number }[]>([]);
  const [loads, setLoads] = useState('0');
  
  // Supporting Docs
  const [supportingDocs, setSupportingDocs] = useState<string[]>([]);

  // Quick Add State
  const [newClientName, setNewClientName] = useState('');
  const [newSiteName, setNewSiteName] = useState('');

  // Table Filter State
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const status = searchParams.get('status');
    if (status) {
      // Map display names if necessary, dashboard uses 'Pending' but state might use 'submitted'
      if (status === 'Pending') setFilterStatus('submitted');
      else setFilterStatus(status);
    }
  }, [searchParams]);

  const { data: realJobCards } = useTenantQuery<JobCard>('jobcards');
  const { data: realEmployees } = useTenantQuery<Employee>('employees', [where('verificationStatus.personalInfo', '==', 'verified')]);
  const { data: realActivities } = useTenantQuery<Activity>('activities');
  const { data: realClients } = useTenantQuery<Client>('clients');
  const { data: realSites } = useTenantQuery<Site>('sites');
  const { data: realDepartments } = useTenantQuery<Department>('departments');

  useEffect(() => {
    if (!organisation) return;

    if (organisation.id.startsWith('demo_')) {
      setJobCards(demoJobCards);
      setEmployees(demoEmployees);
      setActivities(demoActivities);
      setClients(demoClients);
      setSites(demoSites);
      return;
    }

    setJobCards(IS_DEMO_MODE ? [...demoJobCards, ...realJobCards] : realJobCards);
    setEmployees(IS_DEMO_MODE ? [...demoEmployees, ...realEmployees] : realEmployees);
    setActivities(IS_DEMO_MODE ? [...demoActivities, ...realActivities] : realActivities);
    setClients(IS_DEMO_MODE ? [...demoClients, ...realClients] : realClients);
    setSites(IS_DEMO_MODE ? [...demoSites, ...realSites] : realSites);
    setDepartments(realDepartments);
  }, [organisation?.id, realJobCards, realEmployees, realActivities, realClients, realSites, realDepartments, demoEmployees, demoClients, demoSites, demoJobCards, demoActivities, IS_DEMO_MODE]);

  // Auto-save logic
  useEffect(() => {
    if (!isAddOpen || !currentJobCardId || !organisation || !profile) return;

    const timer = setTimeout(async () => {
      try {
        const client = clients.find(c => c.id === clientId);
        const site = sites.find(s => s.id === siteId);
        const act = activities.find(a => a.id === activityId);
        
        const jcPath = `organisations/${organisation.id}/jobcards/${currentJobCardId}`;
        const jcRef = doc(db, jcPath);
        await updateDoc(jcRef, {
          date,
          job_card_type: jobCardType,
          clientId,
          client_name: client?.name,
          siteId,
          site_name: site?.name,
          activityId,
          activity: act?.name,
          product,
          product_variation: productVariation,
          team_employee_ids: selectedTeam,
          wage_method: wageMethod,
          billing_method: billingMethod,
          remuneration_type: remunerationType,
          startTime,
          endTime,
          lunch_start: lunchStart,
          lunch_finish: lunchFinish,
          hoursWorked: parseFloat(hoursWorked),
          quantity: parseFloat(quantity),
          individualOutputs,
          pickupLocation,
          dropoffLocation,
          primary_vehicle_reg: primaryVehicleReg,
          opening_mileage: parseFloat(openingMileage),
          closing_mileage: parseFloat(closingMileage),
          fueling_entries: fuelEntries.map(f => ({
            fuel_litres: f.liters,
            fuel_cost: f.cost,
            datetime: f.date,
            odometer: f.odometer
          })),
          loads: parseInt(loads),
          attachments: supportingDocs,
          last_updated_by: profile.displayName,
          last_updated_at: new Date().toISOString()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `organisations/${organisation.id}/jobcards/${currentJobCardId}`, { currentUser: authUser });
      }
    }, 2000); // 2 second debounce

    return () => clearTimeout(timer);
  }, [date, jobCardType, clientId, siteId, activityId, product, productVariation, selectedTeam, wageMethod, billingMethod, remunerationType, startTime, endTime, lunchStart, lunchFinish, hoursWorked, quantity, individualOutputs, pickupLocation, dropoffLocation, primaryVehicleReg, openingMileage, closingMileage, fuelEntries, loads, supportingDocs, isAddOpen, currentJobCardId, organisation, profile]);

  const startNewJobCard = async () => {
    if (!organisation || !profile) return;

    if (!can('canCreateJobCards')) {
      toast.error('You do not have permission to create job cards');
      return;
    }
    
    // Reset form
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setJobCardType('Field Operations');
    setClientId('');
    setSiteId('');
    setActivityId('');
    setProduct('');
    setProductVariation('');
    setWageMethod('Hours');
    setBillingMethod('Hours');
    setRemunerationType('Both');
    setSelectedTeam([]);
    setIndividualOutputs({});
    setStartTime('');
    setEndTime('');
    setLunchStart('');
    setLunchFinish('');
    setQuantity('0');
    setHoursWorked('0');
    setPickupLocation('');
    setDropoffLocation('');
    setPrimaryVehicleReg('');
    setOpeningMileage('0');
    setClosingMileage('0');
    setFuelEntries([]);
    setLoads('0');
    setSupportingDocs([]);

    const ref = `JC-${Date.now().toString().slice(-6)}`;
    try {
      const docRef = await addDoc(collection(db, `organisations/${organisation.id}/jobcards`), {
        ref_no: ref,
        date: format(new Date(), 'yyyy-MM-dd'),
        job_card_type: 'Field Operations',
        clientId: '',
        siteId: '',
        activityId: '',
        team_employee_ids: [],
        wage_method: 'Hours',
        status: 'Draft',
        supervisor_employee_id: profile.uid,
        supervisor_name: profile.displayName,
        orgId: organisation.id,
        last_updated_by: profile.displayName,
        last_updated_at: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        // Legacy
        reference: ref,
        category: 'Field Operations',
        team: []
      });
      setCurrentJobCardId(docRef.id);
      setIsAddOpen(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `organisations/${organisation.id}/jobcards`, { currentUser: authUser });
    }
  };

  const submitJobCard = async () => {
    if (!organisation || !currentJobCardId) return;
    
    if (supportingDocs.length === 0) {
      toast.error('Supporting documents are required before submission');
      return;
    }

    try {
      const jcPath = `organisations/${organisation.id}/jobcards/${currentJobCardId}`;
      const jcRef = doc(db, jcPath);
      await updateDoc(jcRef, {
        status: 'Submitted',
        lastUpdatedAt: new Date().toISOString()
      });
      setIsAddOpen(false);
      toast.success('Job Card submitted for verification');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `organisations/${organisation.id}/jobcards/${currentJobCardId}`, { currentUser: authUser });
    }
  };

  const verifyJobCard = async (jc: JobCard) => {
    if (!organisation || !profile) return;
    
    if (!can('canApproveJobCards')) {
      toast.error('You do not have permission to verify job cards');
      return;
    }

    try {
      const jcRef = doc(db, `organisations/${organisation.id}/jobcards`, jc.id);
      await updateDoc(jcRef, {
        status: 'Verified',
        verified_by: profile.displayName,
        verified_date: new Date().toISOString()
      });

      // Accrue leave for each team member
      const teamIds = jc.team_employee_ids || jc.team || [];
      for (const empId of teamIds) {
        const emp = employees.find(e => e.id === empId);
        if (emp) {
          const dept = departments.find(d => d.id === emp.departmentId);
          await accrueLeaveFromJobCard(jc, emp, dept);
        }
      }

      toast.success('Job Card verified and leave accrued');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `organisations/${organisation.id}/jobcards/${jc.id}`, { currentUser: authUser });
    }
  };

  const quickAddClient = async () => {
    if (!organisation || !newClientName) return;
    try {
      const path = `organisations/${organisation.id}/clients`;
      const docRef = await addDoc(collection(db, path), {
        name: newClientName,
        orgId: organisation.id,
        createdAt: new Date().toISOString()
      });
      setClientId(docRef.id);
      setNewClientName('');
      toast.success('Client added');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `organisations/${organisation.id}/clients`, { currentUser: authUser });
    }
  };

  const quickAddSite = async () => {
    if (!organisation || !clientId || !newSiteName) return;
    try {
      const path = `organisations/${organisation.id}/sites`;
      const docRef = await addDoc(collection(db, path), {
        clientId,
        name: newSiteName,
        orgId: organisation.id,
        createdAt: new Date().toISOString()
      });
      setSiteId(docRef.id);
      setNewSiteName('');
      toast.success('Site added');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `organisations/${organisation.id}/sites`, { currentUser: authUser });
    }
  };

  const addFuelEntry = () => {
    setFuelEntries([...fuelEntries, { date: format(new Date(), 'yyyy-MM-dd'), liters: 0, cost: 0, odometer: 0 }]);
  };

  const updateFuelEntry = (index: number, field: keyof typeof fuelEntries[0], value: any) => {
    const newEntries = [...fuelEntries];
    newEntries[index] = { ...newEntries[index], [field]: value };
    setFuelEntries(newEntries);
  };

  const removeFuelEntry = (index: number) => {
    setFuelEntries(fuelEntries.filter((_, i) => i !== index));
  };

  const toggleTeamMember = (id: string) => {
    setSelectedTeam(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectedActivity = activities.find(a => a.id === activityId);
  const filteredEmployees = employees.filter(e => 
    `${e.firstName} ${e.lastName}`.toLowerCase().includes(teamSearch.toLowerCase())
  );

  const filteredJobCards = jobCards.filter(jc => {
    const matchesStatus = filterStatus === 'all' || jc.status === filterStatus;
    const matchesClient = filterClient === 'all' || jc.clientId === filterClient;
    const matchesStartDate = !filterStartDate || jc.date >= filterStartDate;
    const matchesEndDate = !filterEndDate || jc.date <= filterEndDate;
    return matchesStatus && matchesClient && matchesStartDate && matchesEndDate;
  });

  return (
    <ErrorBoundary>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight text-[var(--color-primary)]">Job Cards</h2>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={
            <Button onClick={startNewJobCard} className="bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white font-bold rounded-xl shadow-lg shadow-[var(--color-primary)]/20">
              <Plus className="w-4 h-4 mr-2" />
              Open New Job Card
            </Button>
          } />
          <DialogContent className="max-w-4xl sm:max-w-4xl w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] md:max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-[1.5rem] sm:rounded-[2rem] gap-0 border-none shadow-2xl">
            <DialogHeader className="p-4 sm:p-8 border-b bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
              <div className="flex justify-between items-center">
                <div>
                  <DialogTitle className="text-3xl font-black text-[var(--color-primary)] tracking-tighter">NEW JOB CARD</DialogTitle>
                  <p className="text-xs text-[var(--color-muted-foreground)] font-bold uppercase tracking-widest mt-1 flex items-center gap-2">
                    <History className="w-3 h-3" /> Auto-saving to drafts...
                  </p>
                </div>
                <Badge variant="outline" className="text-xs font-bold px-4 py-1.5 rounded-full border-2 border-[var(--color-primary)]/20 text-[var(--color-primary)] bg-white">
                  DRAFT MODE
                </Badge>
              </div>
            </DialogHeader>
            
            <ScrollArea className="flex-1 min-h-0 w-full">
              <div className="p-4 sm:p-8 pb-20 space-y-10 sm:space-y-12">
                {/* Step 1: General Info */}
                <section className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary)] text-white flex items-center justify-center font-black shadow-lg shadow-[var(--color-primary)]/20">1</div>
                    <h3 className="text-xl font-black tracking-tight text-[var(--color-primary)]">General Information</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-0 sm:pl-14">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Job Date</label>
                      <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl py-6 border-2 focus:border-[var(--color-primary)] transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Operation Category</label>
                      <Select value={jobCardType} onValueChange={(v: any) => setJobCardType(v)}>
                        <SelectTrigger className="rounded-xl py-6 border-2 border-[var(--color-primary)]/10 bg-[var(--color-primary)]/5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Field Operations">Field Operations</SelectItem>
                          <SelectItem value="Distribution">Distribution</SelectItem>
                          <SelectItem value="Maintenance">Maintenance</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Client Name</label>
                      <div className="flex gap-2">
                        <Select value={clientId} onValueChange={(v) => {
                          setClientId(v);
                          setSiteId(''); // Fix ghost state: clear site when client changes
                        }}>
                          <SelectTrigger className="rounded-xl py-6 border-2 flex-1">
                            <SelectValue placeholder="Select Client" />
                          </SelectTrigger>
                          <SelectContent className="z-[100]">
                            {clients.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Dialog>
                          <DialogTrigger render={
                            <Button variant="outline" className="rounded-xl px-3 border-2"><Plus className="w-4 h-4" /></Button>
                          } />
                          <DialogContent>
                            <DialogHeader><DialogTitle>Quick Add Client</DialogTitle></DialogHeader>
                            <div className="space-y-4 py-4">
                              <Input placeholder="Client Name" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
                              <Button onClick={quickAddClient} className="w-full">Add Client</Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Site / Block</label>
                      <div className="flex gap-2">
                        <Select value={siteId} onValueChange={setSiteId} disabled={!clientId}>
                          <SelectTrigger className="rounded-xl py-6 border-2 flex-1">
                            <SelectValue placeholder="Select Site" />
                          </SelectTrigger>
                          <SelectContent className="z-[100]">
                            {sites.filter(s => s.clientId === clientId).map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Dialog>
                          <DialogTrigger render={
                            <Button variant="outline" className="rounded-xl px-3 border-2" disabled={!clientId}><Plus className="w-4 h-4" /></Button>
                          } />
                          <DialogContent>
                            <DialogHeader><DialogTitle>Quick Add Site</DialogTitle></DialogHeader>
                            <div className="space-y-4 py-4">
                              <Input placeholder="Site Name" value={newSiteName} onChange={e => setNewSiteName(e.target.value)} />
                              <Button onClick={quickAddSite} className="w-full">Add Site</Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Step 2: Activity & Wage */}
                <section className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary)] text-white flex items-center justify-center font-black shadow-lg shadow-[var(--color-primary)]/20">2</div>
                    <h3 className="text-xl font-black tracking-tight text-[var(--color-primary)]">Activity & Wage Method</h3>
                  </div>
                  
                  <div className="space-y-6 pl-0 sm:pl-14">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Primary Activity</label>
                        <Select value={activityId} onValueChange={setActivityId}>
                          <SelectTrigger className="rounded-xl py-6 border-2">
                            <SelectValue placeholder="Select Activity" />
                          </SelectTrigger>
                          <SelectContent>
                            {activities.map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedActivity && selectedActivity.subActivities.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Product / Sub-Activity</label>
                          <Select value={product} onValueChange={setProduct}>
                            <SelectTrigger className="rounded-xl py-6 border-2">
                              <SelectValue placeholder="Select Component" />
                            </SelectTrigger>
                            <SelectContent>
                              {selectedActivity.subActivities.map(s => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Wage Method</label>
                        <Select value={wageMethod} onValueChange={(v: any) => setWageMethod(v)}>
                          <SelectTrigger className="rounded-xl py-6 border-2 bg-orange-50 border-orange-200 text-orange-900">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Hours">Hours Worked</SelectItem>
                            <SelectItem value="Team Output">Team Output</SelectItem>
                            <SelectItem value="Individual Output">Individual Output</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Billing Method</label>
                        <Select value={billingMethod} onValueChange={(v: any) => setBillingMethod(v)}>
                          <SelectTrigger className="rounded-xl py-6 border-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Hours">Hours</SelectItem>
                            <SelectItem value="Quantity">Quantity</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Remuneration</label>
                        <Select value={remunerationType} onValueChange={(v: any) => setRemunerationType(v)}>
                          <SelectTrigger className="rounded-xl py-6 border-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Wage">Wage Only</SelectItem>
                            <SelectItem value="Invoice">Invoice Only</SelectItem>
                            <SelectItem value="Both">Both</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {wageMethod === 'Hours' && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Total Team Hours</label>
                          <Input type="number" value={hoursWorked} onChange={e => setHoursWorked(e.target.value)} className="rounded-xl py-6 border-2" />
                        </div>
                      )}

                      {wageMethod === 'Team Output' && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Total Team Quantity</label>
                          <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="rounded-xl py-6 border-2" />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Start Time</label>
                        <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="rounded-xl py-6 border-2" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Lunch Start</label>
                        <Input type="time" value={lunchStart} onChange={e => setLunchStart(e.target.value)} className="rounded-xl py-6 border-2" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Lunch Finish</label>
                        <Input type="time" value={lunchFinish} onChange={e => setLunchFinish(e.target.value)} className="rounded-xl py-6 border-2" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">End Time</label>
                        <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="rounded-xl py-6 border-2" />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Step 3: Team Selection */}
                <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary)] text-white flex items-center justify-center font-black shadow-lg shadow-[var(--color-primary)]/20">3</div>
                      <h3 className="text-xl font-black tracking-tight text-[var(--color-primary)]">Team Selection</h3>
                    </div>
                    <Button variant="ghost" size="sm" className="text-[var(--color-primary)] font-bold hover:bg-[var(--color-primary)]/5 rounded-lg">
                      <UserPlus className="w-4 h-4 mr-2" /> Add New Employee
                    </Button>
                  </div>
                  
                  <div className="space-y-4 pl-0 sm:pl-14">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input 
                        placeholder="Search verified employees..." 
                        value={teamSearch} 
                        onChange={e => setTeamSearch(e.target.value)}
                        className="rounded-xl py-6 pl-12 border-2 bg-gray-50/50"
                      />
                    </div>
                    
                    <div className="border-2 border-dashed border-gray-200 rounded-[2rem] p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto bg-white/50">
                      {filteredEmployees.map(emp => (
                        <div 
                          key={emp.id} 
                          className={cn(
                            "p-4 rounded-2xl border-2 cursor-pointer transition-all group relative",
                            selectedTeam.includes(emp.id) 
                              ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20" 
                              : "bg-white border-gray-100 hover:border-[var(--color-primary)]/30 hover:bg-gray-50"
                          )}
                          onClick={() => toggleTeamMember(emp.id)}
                        >
                          <div className="flex flex-col">
                            <span className="font-black text-sm">{emp.firstName} {emp.lastName}</span>
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-widest",
                              selectedTeam.includes(emp.id) ? "text-white/70" : "text-[var(--color-muted-foreground)]"
                            )}>
                              {emp.idNumber || 'PASSPORT/ASYLUM'}
                            </span>
                          </div>
                          {selectedTeam.includes(emp.id) && (
                            <CheckCircle className="absolute top-4 right-4 w-4 h-4 text-white" />
                          )}
                          
                          {wageMethod === 'Individual Output' && selectedTeam.includes(emp.id) && (
                            <div className="mt-3 pt-3 border-t border-white/20" onClick={e => e.stopPropagation()}>
                              <label className="text-[9px] font-black uppercase tracking-widest text-white/70 block mb-1">Quantity</label>
                              <Input 
                                type="number" 
                                value={individualOutputs[emp.id] || 0} 
                                onChange={e => setIndividualOutputs({ ...individualOutputs, [emp.id]: parseFloat(e.target.value) })}
                                className="h-8 rounded-lg bg-white/20 border-none text-white font-bold placeholder:text-white/50"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {/* Step 4: Distribution Specific (Conditional) */}
                {jobCardType === 'Distribution' && (
                  <section className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-[var(--color-secondary)] text-white flex items-center justify-center font-black shadow-lg shadow-[var(--color-secondary)]/20">4</div>
                      <h3 className="text-xl font-black tracking-tight text-[var(--color-secondary)]">Distribution Details</h3>
                    </div>
                    
                    <div className="space-y-6 pl-0 sm:pl-14">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Pickup Location</label>
                          <div className="relative">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input placeholder="Search or pin location..." value={pickupLocation} onChange={e => setPickupLocation(e.target.value)} className="rounded-xl py-6 pl-12 border-2" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Drop-off Location</label>
                          <div className="relative">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input placeholder="Search or pin location..." value={dropoffLocation} onChange={e => setDropoffLocation(e.target.value)} className="rounded-xl py-6 pl-12 border-2" />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Fueling Entries</label>
                          <Button variant="outline" size="sm" onClick={addFuelEntry} className="rounded-lg h-8 border-2">
                            <Fuel className="w-3 h-3 mr-2" /> Add Fueling
                          </Button>
                        </div>
                        {fuelEntries.map((entry, idx) => (
                          <div key={idx} className="grid grid-cols-4 gap-3 p-4 bg-gray-50 rounded-2xl border-2 border-gray-100 relative group">
                            <Input type="date" value={entry.date} onChange={e => updateFuelEntry(idx, 'date', e.target.value)} className="h-10 rounded-lg" />
                            <Input type="number" placeholder="Liters" value={entry.liters} onChange={e => updateFuelEntry(idx, 'liters', parseFloat(e.target.value))} className="h-10 rounded-lg" />
                            <Input type="number" placeholder="Cost" value={entry.cost} onChange={e => updateFuelEntry(idx, 'cost', parseFloat(e.target.value))} className="h-10 rounded-lg" />
                            <Input type="number" placeholder="Odometer" value={entry.odometer} onChange={e => updateFuelEntry(idx, 'odometer', parseFloat(e.target.value))} className="h-10 rounded-lg" />
                            <Button variant="ghost" size="icon" onClick={() => removeFuelEntry(idx)} className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-white border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Total Loads</label>
                        <div className="relative">
                          <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <Input type="number" value={loads} onChange={e => setLoads(e.target.value)} className="rounded-xl py-6 pl-12 border-2" />
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Step 5: Supporting Docs */}
                <section className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--color-accent)] text-[var(--color-accent-foreground)] flex items-center justify-center font-black shadow-lg shadow-[var(--color-accent)]/20">5</div>
                    <h3 className="text-xl font-black tracking-tight text-[var(--color-primary)]">Supporting Documents</h3>
                  </div>
                  
                  <div className="pl-0 sm:pl-14">
                    <div className="border-4 border-dashed border-gray-100 rounded-[2rem] p-12 text-center space-y-4 bg-gray-50/30 hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => setSupportingDocs([...supportingDocs, 'https://picsum.photos/seed/doc/400/600'])}>
                      <div className="w-16 h-16 rounded-3xl bg-white border-2 border-gray-100 flex items-center justify-center mx-auto shadow-sm group-hover:scale-110 transition-transform">
                        <FileUp className="w-8 h-8 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-black text-[var(--color-primary)]">Upload Photos, Scans, or Signatures</p>
                        <p className="text-xs text-[var(--color-muted-foreground)] font-bold uppercase tracking-widest">Mandatory for submission</p>
                      </div>
                    </div>
                    
                    {supportingDocs.length > 0 && (
                      <div className="grid grid-cols-4 gap-4 mt-6">
                        {supportingDocs.map((doc, idx) => (
                          <div key={idx} className="aspect-[3/4] rounded-2xl border-2 border-gray-100 overflow-hidden relative group">
                            <img src={doc} alt="doc" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Button variant="ghost" size="icon" className="text-white hover:text-red-400" onClick={() => setSupportingDocs(supportingDocs.filter((_, i) => i !== idx))}>
                                <Trash2 className="w-5 h-5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </ScrollArea>

            <DialogFooter className="p-4 sm:p-8 border-t bg-white/95 backdrop-blur-sm sticky bottom-0 z-50 flex-shrink-0 flex flex-row gap-4 m-0 sm:justify-between">
              <Button variant="outline" className="flex-1 py-8 rounded-2xl font-black border-2 hover:bg-gray-50 transition-all" onClick={() => setIsAddOpen(false)}>
                KEEP AS DRAFT
              </Button>
              <Button className="flex-1 py-8 rounded-2xl font-black bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white shadow-xl shadow-[var(--color-primary)]/20 transition-all active:scale-95" onClick={submitJobCard}>
                SUBMIT JOB CARD
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-6 rounded-[2rem] border-2 shadow-sm">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="rounded-xl border-2">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Submitted">Submitted</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Invoiced">Invoiced</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Client</label>
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="rounded-xl border-2">
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">Start Date</label>
          <Input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="rounded-xl border-2" />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-muted-foreground)]">End Date</label>
          <Input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="rounded-xl border-2" />
        </div>
      </div>

      <Card className="border-[var(--color-border)] shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[var(--color-background)]">
              <TableRow className="hover:bg-transparent border-b-[var(--color-border)]">
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Ref</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Date</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Client / Site</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Category</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Activity</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Team Size</TableHead>
                <TableHead className="font-bold text-[var(--color-muted-foreground)]">Status</TableHead>
                <TableHead className="text-right font-bold text-[var(--color-muted-foreground)]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobCards.map(jc => {
                const act = activities.find(a => a.id === jc.activityId);
                const clientObj = clients.find(c => c.id === jc.clientId);
                const siteObj = sites.find(s => s.id === jc.siteId);
                return (
                  <TableRow key={jc.id} className="border-b-[var(--color-border)] hover:bg-[var(--color-background)]/50 transition-colors group">
                    <TableCell className="font-black text-[var(--color-primary)] tracking-tighter">{jc.ref_no || jc.reference}</TableCell>
                    <TableCell className="font-bold text-xs">{jc.date}</TableCell>
                    <TableCell>
                      <div className="font-black text-sm tracking-tight">{jc.client_name || 'Unknown'}</div>
                      <div className="text-xs font-medium text-[var(--color-muted-foreground)]">{jc.site_name || 'Unknown'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-2">
                        {jc.job_card_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-sm">{jc.activity || 'Unknown'}</div>
                      <div className="text-[10px] text-[var(--color-muted-foreground)] uppercase font-bold tracking-widest">{jc.product || jc.subActivity}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="w-3 h-3 text-gray-400" />
                        <span className="font-bold text-sm">{(jc.team_employee_ids || jc.team || []).length}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(
                        "border-none font-black text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full",
                        jc.status === 'Approved' || jc.status === 'Verified' ? "bg-green-100 text-green-700" : 
                        jc.status === 'Submitted' ? "bg-blue-100 text-blue-700" :
                        jc.status === 'Invoiced' ? "bg-purple-100 text-purple-700" :
                        "bg-orange-100 text-orange-700"
                      )}>
                        {jc.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex gap-2">
                          {jc.status === 'Submitted' && can('canApproveJobCards') && (
                            <Button 
                              onClick={() => verifyJobCard(jc)} 
                              variant="outline" 
                              size="sm" 
                              className="border-2 border-green-500 text-green-500 hover:bg-green-50 font-black text-[10px] rounded-xl h-8 px-3"
                            >
                              VERIFY
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] font-black text-xs rounded-lg">VIEW</Button>
                        </div>
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Updated by {jc.last_updated_by || jc.lastUpdatedBy}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </ErrorBoundary>
  );
};

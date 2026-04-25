import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { Organisation } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Building2, Plus, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export const OrganisationPage: React.FC = () => {
  const { user, profile, organisation: currentOrg, userOrganisations, switchOrganisation } = useAuth();
  const [newOrgName, setNewOrgName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  const customOrganisations = userOrganisations.filter(org => {
    const isDemo = org.isDemo || org.id.startsWith('demo_');
    const isAdminOwned = org.owner_email === 'orfansolutions@gmail.com';
    return !isDemo && !isAdminOwned;
  });
  
  const canCreateMore = customOrganisations.length < 2 || 
                        currentOrg?.subscriptionPlan === 'unlimited' || 
                        currentOrg?.subscriptionPlan === 'pro' || 
                        currentOrg?.subscriptionPlan === 'enterprise';

  const createOrganisation = async () => {
    if (!user || !newOrgName || !canCreateMore) return;

    setIsCreating(true);
    try {
      const trialStartDate = new Date();
      const trialEndDate = new Date();
      trialEndDate.setDate(trialStartDate.getDate() + 14);

      const orgRef = await addDoc(collection(db, 'organisations'), {
        registered_name: newOrgName,
        name: newOrgName,
        owner_email: user.email,
        email: user.email, // Required by blueprint
        registration_number: 'PENDING',
        income_tax_no: 'PENDING',
        industry: 'Other',
        business_address: 'PENDING',
        tel_work: 'PENDING',
        status: 'active',
        createdAt: serverTimestamp(),
        trialStartDate: trialStartDate.toISOString(),
        trialEndDate: trialEndDate.toISOString(),
        subscriptionStatus: 'trialing',
        subscriptionPlan: 'basic',
        uifPercentage: 1,
      });

      // Add as first member
      await setDoc(doc(db, `organisations/${orgRef.id}/members`, user.uid), {
        uid: user.uid,
        email: user.email,
        role: 'admin',
        joinedAt: new Date().toISOString()
      });

      // Prepare org object for immediate context update
      const newOrgData = {
        id: orgRef.id,
        registered_name: newOrgName,
        name: newOrgName,
        owner_email: user.email,
        status: 'active',
        createdAt: new Date().toISOString(),
        trialStartDate: trialStartDate.toISOString(),
        trialEndDate: trialEndDate.toISOString(),
        subscriptionStatus: 'trialing',
        subscriptionPlan: 'basic',
        uifPercentage: 1,
      } as Organisation;

      setNewOrgName('');
      toast.success('Organisation created successfully');
      
      // Immediate switch and redirect
      await switchOrganisation(orgRef.id, newOrgData);
      navigate(`/dashboard/${orgRef.id}`);
    } catch (error: any) {
      console.error('Organisation creation error:', error);
      toast.error(`Failed to create organisation: ${error.message || 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black tracking-tighter text-[var(--color-primary)]">MY ORGANISATIONS</h1>
        <p className="text-[var(--color-muted-foreground)] font-medium">Manage your business entities and subscriptions.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {userOrganisations.map((org) => (
          <Card key={org.id} className={`group relative overflow-hidden border-2 transition-all hover:shadow-xl ${org.id === currentOrg?.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-gray-100 hover:border-[var(--color-primary)]/30'}`}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div className="p-3 rounded-2xl bg-white shadow-sm border border-gray-100 group-hover:scale-110 transition-transform">
                  <Building2 className="w-6 h-6 text-[var(--color-primary)]" />
                </div>
                <Badge variant={org.subscriptionPlan === 'basic' ? 'outline' : 'default'} className="font-black uppercase tracking-widest text-[10px]">
                  {org.subscriptionPlan}
                </Badge>
              </div>
              <CardTitle className="text-xl font-black tracking-tight mt-4">{org.name || org.registered_name}</CardTitle>
              <CardDescription className="text-xs font-bold uppercase tracking-widest">{org.status}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-muted-foreground)]">
                <ShieldCheck className="w-4 h-4" />
                Owner: {org.owner_email}
              </div>
              <Button 
                variant={org.id === currentOrg?.id ? 'default' : 'outline'} 
                className="w-full rounded-xl font-black group"
                onClick={async () => {
                  if (org.id !== currentOrg?.id) {
                    await switchOrganisation(org.id);
                    navigate(`/dashboard/${org.id}`);
                  }
                }}
              >
                {org.id === currentOrg?.id ? 'CURRENTLY ACTIVE' : 'SWITCH TO THIS'}
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </CardContent>
          </Card>
        ))}

        {/* Create New Card */}
        <Card className={`border-2 border-dashed flex flex-col items-center justify-center p-8 text-center space-y-4 transition-all ${canCreateMore ? 'border-gray-200 hover:border-[var(--color-primary)]/50 hover:bg-gray-50/50' : 'border-red-100 bg-red-50/30'}`}>
          {!canCreateMore ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg font-black text-red-900">LIMIT REACHED</CardTitle>
                <p className="text-xs font-bold text-red-700 uppercase tracking-widest mt-1">Upgrade to Unlimited for more</p>
              </div>
              <Button variant="destructive" className="w-full rounded-xl font-black" onClick={() => navigate('/subscription')}>
                UPGRADE NOW
              </Button>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
                <Plus className="w-6 h-6" />
              </div>
              <div className="space-y-4 w-full">
                <div>
                  <CardTitle className="text-lg font-black">ADD NEW ENTITY</CardTitle>
                  <p className="text-xs font-bold text-[var(--color-muted-foreground)] uppercase tracking-widest mt-1">
                    {customOrganisations.length} / 2 Used
                  </p>
                </div>
                <Input 
                  placeholder="Organisation Name" 
                  value={newOrgName} 
                  onChange={e => setNewOrgName(e.target.value)}
                  className="rounded-xl border-2 focus:border-[var(--color-primary)]"
                />
                <Button 
                  className="w-full rounded-xl font-black bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white"
                  onClick={createOrganisation}
                  disabled={isCreating || !newOrgName}
                >
                  {isCreating ? 'CREATING...' : 'CREATE ORGANISATION'}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

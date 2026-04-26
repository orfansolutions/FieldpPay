import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, setDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../App';
import { Building2, ArrowRight, Loader2, CheckCircle2, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';

export default function OrganisationSetup() {
  const { user, profile, organisation, allOrganisations, switchOrganisation, refreshProfile, showToast } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = searchParams.get('new') === 'true';
  
  const [loading, setLoading] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<any>(null);
  const [step, setStep] = useState(profile ? 2 : 1);

  React.useEffect(() => {
    // Only redirect if NOT explicitly adding a new organization
    if (profile?.organisationId && organisation && !isNew) {
      navigate('/');
    }
  }, [profile, organisation, navigate, isNew]);

  React.useEffect(() => {
    const checkPendingInvites = async () => {
      if (!user?.email) return;
      try {
        const q = query(collection(db, 'invites'), where('email', '==', user.email.toLowerCase().trim()), where('status', '==', 'Pending'));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setPendingInvite({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
        }
      } catch (err) {
        console.error('Error checking pending invites:', err);
      }
    };
    checkPendingInvites();
  }, [user]);
  
  const [formData, setFormData] = useState({
    companyName: '',
    cipcNumber: '',
    address: '',
    telephone: '',
    role: 'Super User' as any,
    financialYearStart: '2026-03-01',
    financialYearEnd: '2027-02-28',
    vatRate: 15,
  });

  const isSubmitting = React.useRef(false);

  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) {
      showToast('User email not found. Please try logging in again.', 'error');
      return;
    }

    if (isSubmitting.current || loading) {
      console.warn('Submission already in progress, ignoring duplicate click.');
      return;
    }

    isSubmitting.current = true;
    setLoading(true);
    
    try {
      console.log('Starting profile setup for user:', user.uid);
      
      let orgId: string;
      
      // 1. Create Organisation
      console.log('Creating new organisation...');
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 60); // 60-day trial

        const orgRef = await addDoc(collection(db, 'organisations'), {
          name: formData.companyName.trim(),
          cipcNumber: formData.cipcNumber.trim(),
          address: formData.address.trim(),
          telephone: formData.telephone.trim(),
          financialYear: {
            startDate: formData.financialYearStart,
            endDate: formData.financialYearEnd,
          },
          vatRate: formData.vatRate,
          ownerUid: user.uid,
          subscription: {
            status: 'trial',
            trialEndDate: trialEndDate.toISOString(),
            plan: 'monthly',
            planCode: import.meta.env.VITE_PAYSTACK_PAYFLOW_PLAN_CODE || 'PLN_DEFAULT',
            amount: 517.50, // R450 + 15% VAT
            currency: 'ZAR'
          },
          createdAt: new Date().toISOString(),
        });
        orgId = orgRef.id;
        console.log('Created new organisation with ID:', orgId);

      // 2. Create/Update User Profile (Step 1.5 - to establish rules identity)
      console.log('Establishing user identity...');
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email.toLowerCase().trim(),
        role: formData.role,
        organisationId: orgId,
        currentOrg: orgId,
        displayName: user.displayName || user.email.split('@')[0],
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      // 3. Create Default Chart of Account
      await addDoc(collection(db, 'chartOfAccounts'), {
        name: 'Operations',
        organisationId: orgId,
        status: 'Active'
      });

      // 4. Create Default Project
      await addDoc(collection(db, 'projects'), {
        name: `${formData.companyName.trim()} General`,
        organisationId: orgId,
        departmentIds: [],
        startDate: new Date().toISOString().split('T')[0],
        status: 'Open',
        totalBudget: 0,
        phases: [],
        createdBy: user.uid,
        isGeneral: true
      });

      // Store in LocalStorage for immediate use in global state if needed
      localStorage.setItem('activeOrganisationId', orgId);

      console.log('Profile setup complete. Refreshing...');
      await refreshProfile();
      
      // Force a full window reload to ensure all contexts are clean and pointing to new org
      window.location.href = '/';
    } catch (err: any) {
      console.error('Error in handleProfileSetup:', err);
      showToast(err.message || 'Failed to complete setup. Please try again.', 'error');
    } finally {
      isSubmitting.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pt-8 pb-20">
      <div className="flex justify-end mb-4">
        <button 
          onClick={() => signOut(auth)}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-medium text-sm transition-colors bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100"
        >
          <LogOut size={16} />
          Sign Out / Switch Account
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 md:p-12">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Setup Organisation</h1>
            <p className="text-slate-500">Let's get your company configured</p>
          </div>
        </div>

        {pendingInvite && (
          <div className="mb-8 p-6 bg-blue-50 border border-blue-100 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                <CheckCircle2 size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-blue-900">Invitation Found!</h3>
                <p className="text-blue-700 mt-1">
                  You have been invited to join <strong>{pendingInvite.organisationName}</strong> as a <strong>{pendingInvite.role}</strong>.
                </p>
                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await refreshProfile(); // This will trigger checkInvites in App.tsx
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-200"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : 'Accept & Join Organisation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {allOrganisations.length > 0 && !pendingInvite && (
          <div className="mb-8 p-6 bg-emerald-50 border border-emerald-100 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                <Building2 size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-emerald-900">Existing Organisations Found</h3>
                <p className="text-emerald-700 mt-1 mb-4">
                  You are already an owner of <strong>{allOrganisations.length}</strong> organisation(s). 
                  Would you like to continue with one of them instead of creating a new one?
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {allOrganisations.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => switchOrganisation(org.id)}
                      className="flex items-center gap-3 p-3 bg-white border border-emerald-200 rounded-xl hover:border-emerald-400 hover:shadow-md transition-all text-left group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                        {org.name.charAt(0)}
                      </div>
                      <span className="text-sm font-bold text-slate-700 truncate group-hover:text-emerald-700">{org.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-100"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-4 text-slate-400 font-medium">Or Create New Organisation</span>
          </div>
        </div>

        <form onSubmit={handleProfileSetup} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Company Name</label>
              <input
                required
                type="text"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="e.g. Acme Corp SA"
                value={formData.companyName}
                onChange={e => setFormData({ ...formData, companyName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">CIPC Reg Number</label>
              <input
                required
                type="text"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="2024/123456/07"
                value={formData.cipcNumber}
                onChange={e => setFormData({ ...formData, cipcNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Physical Address</label>
              <textarea
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all h-24"
                placeholder="123 Sandton Drive, Johannesburg"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Telephone</label>
              <input
                required
                type="tel"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="+27 11 123 4567"
                value={formData.telephone}
                onChange={e => setFormData({ ...formData, telephone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Your Role</label>
              <select
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value as any })}
              >
                <option value="Super User">Super User (Owner)</option>
                <option value="CEO/CFO">CEO / CFO</option>
                <option value="Financial Manager">Financial Manager</option>
                <option value="Requester">Requester</option>
              </select>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <h3 className="font-semibold text-slate-900 mb-4">Financial Year</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Start Date</label>
                <input
                  required
                  type="date"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={formData.financialYearStart}
                  onChange={e => setFormData({ ...formData, financialYearStart: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">End Date</label>
                <input
                  required
                  type="date"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={formData.financialYearEnd}
                  onChange={e => setFormData({ ...formData, financialYearEnd: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <h3 className="font-semibold text-slate-900 mb-4">Tax Settings</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">VAT Rate (%)</label>
              <input
                required
                type="number"
                step="0.01"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.vatRate}
                onChange={e => setFormData({ ...formData, vatRate: Number(e.target.value) })}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" /> : <>Complete Setup <ArrowRight size={20} /></>}
          </button>
        </form>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useAuth } from '../App';
import { Building2, CreditCard, Loader2, CheckCircle2, LogOut, ArrowRight, ShieldCheck, AlertCircle, ChevronDown, Clock } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { cn, formatCurrency } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

export default function Billing() {
  const { organisation, profile, user, allOrganisations, switchOrganisation, refreshProfile, showToast } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const navigate = useNavigate();

  // Paystack Plan Details (Hardcoded based on requirements)
  const baseAmount = 450;
  const vatRate = 0.15;
  const totalAmount = baseAmount * (1 + vatRate);
  
  const trialEnd = organisation?.subscription?.trialEndDate;
  const isTrialExpired = trialEnd ? new Date(trialEnd) < new Date() : false;

  const daysRemaining = trialEnd 
    ? Math.max(0, Math.ceil((new Date(trialEnd).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const handlePaystackPayment = () => {
    setLoading(true);
    
    // In a real implementation, we would typically call our backend to initialize the transaction
    // Or use the Paystack Pop service directly if it's a client-side only demo.
    // For this applet, we'll implement a Mock Paystack Checkout flow to simulate the process.
    
    console.log('Initializing Paystack payment...');
    
    // Simulate API delay
    setTimeout(async () => {
      try {
        if (!organisation?.id) return;

        // Simulate successful subscription upgrade
        await updateDoc(doc(db, 'organisations', organisation.id), {
          'subscription.status': 'active',
          'subscription.updatedAt': new Date().toISOString(),
          'subscription.lastPayment': new Date().toISOString()
        });

        showToast('Subscription active! Welcome to Pay Flow Pro.', 'success');
        await refreshProfile();
        navigate('/');
      } catch (err: any) {
        console.error('Payment Error:', err);
        showToast('Payment failed. Please try again.', 'error');
      } finally {
        setLoading(false);
      }
    }, 2000);
  };

  if (!organisation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 md:p-12">
        <div className="flex justify-between items-start mb-10">
          <div className="flex items-center gap-4">
            <div className="relative">
              <button 
                onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 hover:scale-105 transition-transform"
              >
                <Building2 size={28} />
                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-slate-100">
                  <ChevronDown size={12} className="text-slate-600" />
                </div>
              </button>

              {isSwitcherOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsSwitcherOpen(false)} />
                  <div className="absolute top-full left-0 mt-3 w-64 bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-200/50 p-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                    <p className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Switch Organisation</p>
                    <div className="max-h-60 overflow-y-auto">
                      {allOrganisations.map((org) => (
                        <button
                          key={org.id}
                          onClick={() => switchOrganisation(org.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                            organisation.id === org.id ? "bg-blue-50 text-blue-700 pointer-events-none" : "hover:bg-slate-50"
                          )}
                        >
                          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center font-bold", organisation.id === org.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400")}>
                            {org.name.charAt(0)}
                          </div>
                          <p className="text-sm font-bold truncate">{org.name}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{organisation.name}</h1>
              <p className="text-slate-500">Billing & Subscription</p>
            </div>
          </div>
          <button 
            onClick={() => signOut(auth)}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Log Out</span>
          </button>
        </div>

        {isTrialExpired && organisation.subscription?.status !== 'active' ? (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 mb-8 flex items-start gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-amber-900">Trial Period Ended</h3>
              <p className="text-amber-700 mt-1 leading-relaxed">
                Your 60-day free trial expired on <strong>{new Date(trialEnd!).toLocaleDateString('en-ZA')}</strong>. 
                Please subscribe to continue managing your expenses.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-8 flex items-start gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
              <Clock size={24} className="animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-bold text-blue-900">Active Trial</h3>
                <div className="bg-white px-3 py-1 rounded-full border border-blue-200">
                  <span className="text-blue-600 font-bold text-sm tracking-tight">{daysRemaining} Days Left</span>
                </div>
              </div>
              <p className="text-blue-700 mt-1 leading-relaxed">
                You are currently on a 60-day free trial. Your trial ends on <strong>{new Date(trialEnd!).toLocaleDateString('en-ZA')}</strong>.
              </p>
            </div>
          </div>
        )}

        <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-slate-900">Standard Plan</h2>
            <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Recommended</span>
          </div>
          
          <div className="flex flex-col mb-8">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-slate-900">{formatCurrency(baseAmount)}</span>
              <span className="text-slate-400 font-medium">/ month</span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              ({formatCurrency(totalAmount)} Inc. 15% VAT)
            </p>
          </div>

          <ul className="space-y-4 mb-8">
            {[
              'Unlimited Requisitions',
              'Advanced Project Reporting',
              'Multi-Department Support',
              'Payroll & Deductions Tracking',
              'Automated PFAI Assistant',
              'Strict Multi-Tenant Isolation'
            ].map((feature, i) => (
              <li key={i} className="flex items-center gap-3 text-slate-600">
                <CheckCircle2 size={18} className="text-emerald-500" />
                <span className="font-medium">{feature}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={handlePaystackPayment}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white p-5 rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-slate-200"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                <CreditCard size={20} />
                Activate Monthly Subscription
                <ArrowRight size={20} className="ml-auto" />
              </>
            )}
          </button>
          
          <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-2">
            Secure processing by <img src="https://paystack.com/favicon.ico" className="w-3 h-3 grayscale" alt="Paystack" /> Paystack
          </p>
        </div>

        <div className="text-center">
          <p className="text-sm text-slate-500">
            Need a custom enterprise solution? <button className="text-blue-600 font-bold hover:underline">Contact Sales</button>
          </p>
        </div>
      </div>
    </div>
  );
}

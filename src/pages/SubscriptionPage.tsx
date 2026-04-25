import React from 'react';
import { useAuth } from '../AuthContext';
import { usePaystack } from '../components/PaystackProvider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { CheckCircle2, CreditCard, Zap, Shield, Crown, AlertTriangle } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'sonner';

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 0,
    description: 'Essential tools for growing businesses.',
    features: [
      'Up to 2 Custom Organisations',
      'Up to 10 Employees/Subscribers',
      'SARS-Compliant Leave & UIF Reporting',
      'Standard Job Cards',
      'Email Support'
    ],
    icon: Zap,
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    popular: true
  },
  {
    id: 'unlimited',
    name: 'Unlimited',
    price: 3500,
    description: 'Scale your operation with high-value features and dedicated support.',
    features: [
      'Unlimited Employee Profiles: Scale without hitting seat caps',
      'Advanced Industrial Relations (IR) Tools: Automated disciplinary record keeping',
      'Bulk Payroll Processing: One-click batch runs for large teams',
      'Dedicated Account Manager: Direct WhatsApp/Email support for Orfan Solutions VIPs',
      'Custom Integration: Connection to existing accounting software (like Xero or Sage)'
    ],
    icon: Crown,
    color: 'text-purple-500',
    bg: 'bg-purple-50'
  }
];

export const SubscriptionPage: React.FC = () => {
  const { organisation, user, profile } = useAuth();
  const { initializePayment } = usePaystack();

  if (!organisation) return null;

  const trialEndDate = organisation.trialEndDate ? new Date(organisation.trialEndDate) : null;
  const daysLeft = trialEndDate ? differenceInDays(trialEndDate, new Date()) : 0;
  const isExpired = daysLeft <= 0;

  const isOwner = profile?.role === 'admin' || organisation.owner_email === user?.email;

  const handleSubscription = async (planId: string) => {
    if (!isOwner) {
      toast.error('Only the Organisation Owner can manage billing.');
      return;
    }

    if (planId === organisation.subscriptionPlan) {
      toast.info('You are already on this plan.');
      return;
    }

    await initializePayment(planId);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-[var(--color-secondary)]">SUBSCRIPTION</h2>
          <p className="text-[var(--color-muted-foreground)] font-medium">Manage your plan and billing details.</p>
        </div>
        
        {organisation.subscriptionStatus === 'trialing' && (
          <div className={isExpired ? "bg-red-50 border-2 border-red-100 p-4 rounded-2xl flex items-center gap-4" : "bg-amber-50 border-2 border-amber-100 p-4 rounded-2xl flex items-center gap-4"}>
            <div className={isExpired ? "w-12 h-12 rounded-xl bg-red-500 flex items-center justify-center text-white" : "w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center text-white"}>
              {isExpired ? <AlertTriangle className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Trial Status</p>
              <p className={isExpired ? "text-lg font-black text-red-700" : "text-lg font-black text-amber-700"}>
                {isExpired ? 'TRIAL EXPIRED' : `${daysLeft} DAYS REMAINING`}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {PLANS.map((plan) => {
          const isCurrentPlan = organisation.subscriptionPlan === plan.id;
          const isPaidActive = (organisation.subscriptionStatus === 'active' || organisation.subscriptionStatus === 'trialing') && isCurrentPlan;

          return (
            <Card key={plan.id} className={`relative border-2 transition-all hover:shadow-xl ${plan.popular ? 'border-[var(--color-primary)] scale-105 z-10' : 'border-[var(--color-border)]'}`}>
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[var(--color-primary)] text-white text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full shadow-lg">
                  Most Popular
                </div>
              )}
            <CardHeader className="text-center pb-2">
              <div className={`w-16 h-16 rounded-2xl ${plan.bg} ${plan.color} flex items-center justify-center mx-auto mb-4`}>
                <plan.icon className="w-8 h-8" />
              </div>
              <CardTitle className="text-2xl font-black tracking-tight">{plan.name}</CardTitle>
              <CardDescription className="font-medium">{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <span className="text-4xl font-black tracking-tighter">R{plan.price}</span>
                <span className="text-[var(--color-muted-foreground)] font-bold">/month</span>
              </div>

              <div className="space-y-3">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    <span className="text-sm font-medium text-gray-600">{feature}</span>
                  </div>
                ))}
              </div>

              <Button 
                className={`w-full py-6 rounded-xl font-black tracking-tight ${plan.popular ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
                onClick={() => handleSubscription(plan.id)}
                disabled={isPaidActive}
              >
                {isPaidActive ? 'Current Plan' : 'Upgrade Now'}
              </Button>
            </CardContent>
          </Card>
        )})}
      </div>

      <Card className="border-2 border-[var(--color-border)] shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-black tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-[var(--color-primary)]" />
            Billing History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-[var(--color-muted-foreground)] italic font-medium">
            No billing history found. Your trial started on {organisation.trialStartDate ? format(new Date(organisation.trialStartDate), 'PPP') : 'N/A'}.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

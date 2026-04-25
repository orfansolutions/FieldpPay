import React, { createContext, useContext } from 'react';
import { useAuth } from '../AuthContext';
import { toast } from 'sonner';

interface PaystackContextType {
  initializePayment: (planId: string, amount?: number) => Promise<void>;
}

const PaystackContext = createContext<PaystackContextType | null>(null);

export const PaystackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { organisation, user } = useAuth();

  const initializePayment = async (planId: string, amount?: number) => {
    if (!organisation || !user) {
      toast.error('You must be logged in to subscribe.');
      return;
    }

    try {
      const response = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          amount: amount ? amount * 100 : undefined, // Paystack expects kobo/cents
          planId,
          metadata: {
            orgId: organisation.id,
            userId: user.uid,
          },
        }),
      });

      const data = await response.json();

      if (data.status && data.data.authorization_url) {
        window.location.href = data.data.authorization_url;
      } else {
        throw new Error(data.message || 'Failed to initialize payment');
      }
    } catch (error: any) {
      console.error('Paystack Initialization Error:', error);
      toast.error(error.message || 'Could not connect to Paystack');
    }
  };

  return (
    <PaystackContext.Provider value={{ initializePayment }}>
      {children}
    </PaystackContext.Provider>
  );
};

export const usePaystack = () => {
  const context = useContext(PaystackContext);
  if (!context) {
    throw new Error('usePaystack must be used within a PaystackProvider');
  }
  return context;
};

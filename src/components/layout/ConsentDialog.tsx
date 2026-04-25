import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { ShieldCheck, MapPin, Lock } from 'lucide-react';

export const ConsentDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [popiAccepted, setPopiAccepted] = useState(false);
  const [locationAccepted, setLocationAccepted] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('fieldpay_consent_accepted');
    if (!consent) {
      setIsOpen(true);
    }
  }, []);

  const handleAccept = () => {
    if (popiAccepted && locationAccepted) {
      localStorage.setItem('fieldpay_consent_accepted', 'true');
      setIsOpen(false);
      // Trigger location tracking if possible
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(() => {});
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-[2rem] border-none shadow-2xl">
        <div className="bg-[var(--color-primary)] p-8 text-white">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mb-6">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <DialogTitle className="text-3xl font-black tracking-tighter mb-2">DATA CONSENT</DialogTitle>
          <DialogDescription className="text-white/80 font-medium">
            To provide a secure and efficient experience, FieldPay requires your consent for data processing and location tracking.
          </DialogDescription>
        </div>

        <div className="p-8 space-y-6">
          <div className="flex gap-4 items-start p-4 rounded-2xl bg-gray-50 border-2 border-transparent hover:border-[var(--color-primary)]/20 transition-all">
            <Checkbox 
              id="popi" 
              checked={popiAccepted} 
              onCheckedChange={(checked) => setPopiAccepted(!!checked)}
              className="mt-1"
            />
            <div className="grid gap-1.5 leading-none">
              <label htmlFor="popi" className="text-sm font-black leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Privacy & POPI Act Agreement
              </label>
              <p className="text-xs text-gray-500 font-medium">
                I agree to the processing of my personal data in accordance with the POPI Act and FieldPay's privacy policy.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start p-4 rounded-2xl bg-gray-50 border-2 border-transparent hover:border-[var(--color-primary)]/20 transition-all">
            <Checkbox 
              id="location" 
              checked={locationAccepted} 
              onCheckedChange={(checked) => setLocationAccepted(!!checked)}
              className="mt-1"
            />
            <div className="grid gap-1.5 leading-none">
              <label htmlFor="location" className="text-sm font-black leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Location Tracking Consent
              </label>
              <p className="text-xs text-gray-500 font-medium">
                I consent to real-time location tracking while using the application for operational and safety purposes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest justify-center">
            <Lock className="w-3 h-3" />
            Your data is encrypted and secure
          </div>
        </div>

        <DialogFooter className="p-8 bg-gray-50 border-t">
          <Button 
            className="w-full py-8 rounded-2xl font-black text-lg shadow-xl shadow-[var(--color-primary)]/20 disabled:opacity-50"
            disabled={!popiAccepted || !locationAccepted}
            onClick={handleAccept}
          >
            I AGREE & CONTINUE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

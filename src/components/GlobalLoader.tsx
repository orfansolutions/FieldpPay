import React from 'react';
import { motion } from 'motion/react';

export const GlobalLoader: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
      <div className="relative flex flex-col items-center">
        {/* Orfan Solutions Logo Placeholder */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2">
            <div className="w-12 h-12 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center shadow-lg shadow-[var(--color-primary)]/20">
              <span className="text-white font-black text-2xl tracking-tighter italic">FP</span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tighter text-[var(--color-secondary)] leading-none italic">FIELDPAY</span>
              <span className="text-[8px] font-black tracking-[0.3em] text-[var(--color-muted-foreground)] leading-none uppercase ml-0.5">By Orfan Solutions</span>
            </div>
          </div>
        </motion.div>

        {/* Professional Spinner */}
        <div className="relative w-16 h-16">
          <motion.div
            className="absolute inset-0 border-4 border-[var(--color-primary)]/20 rounded-full"
          />
          <motion.div
            className="absolute inset-0 border-4 border-t-[var(--color-primary)] rounded-full"
            animate={{ rotate: 360 }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        </div>

        <motion.p 
          className="mt-6 text-sm font-black tracking-widest text-[var(--color-secondary)] uppercase"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Securing your session...
        </motion.p>
      </div>
    </div>
  );
};

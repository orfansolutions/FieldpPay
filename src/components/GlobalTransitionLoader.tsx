import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  show: boolean;
  message?: string;
}

export const GlobalTransitionLoader: React.FC<Props> = ({ show, message = "Synchronizing Entity Data..." }) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/95 backdrop-blur-md"
        >
          <div className="relative flex flex-col items-center scale-110">
            <motion.div 
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              className="mb-10"
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-[var(--color-primary)] rounded-[1.5rem] flex items-center justify-center shadow-2xl shadow-[var(--color-primary)]/40 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent" />
                  <span className="text-white font-black text-3xl tracking-tighter italic relative z-10">FP</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-4xl font-black tracking-tighter text-[var(--color-secondary)] leading-none italic">FIELDPAY</span>
                  <span className="text-[10px] font-black tracking-[0.4em] text-[var(--color-muted-foreground)] leading-none uppercase mt-1">Professional Enterprise Ecosystem</span>
                </div>
              </div>
            </motion.div>

            <div className="relative w-20 h-20">
              <div className="absolute inset-0 border-8 border-[var(--color-primary)]/10 rounded-full" />
              <motion.div
                className="absolute inset-0 border-8 border-t-[var(--color-primary)] rounded-full shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.3)]"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            </div>

            <motion.div 
              className="mt-10 flex flex-col items-center gap-2"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <p className="text-sm font-black tracking-[0.2em] text-[var(--color-secondary)] uppercase text-center">
                {message}
              </p>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Please wait while we secure your environment
              </span>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

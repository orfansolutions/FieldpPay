import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Printer, ExternalLink, Loader2 } from 'lucide-react';

interface PDFPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  blobUrl: string | null;
  filename: string;
}

export default function PDFPreview({ isOpen, onClose, title, blobUrl, filename }: PDFPreviewProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-4xl bg-white shadow-2xl z-[101] flex flex-col"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{title}</h2>
                <p className="text-xs text-slate-500">{filename}</p>
              </div>
              <div className="flex items-center gap-2">
                {blobUrl && (
                  <>
                    <a
                      href={blobUrl}
                      download={filename}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="Download"
                    >
                      <Download size={20} />
                    </a>
                    <button
                      onClick={() => window.open(blobUrl, '_blank')}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="Open in New Tab"
                    >
                      <ExternalLink size={20} />
                    </button>
                  </>
                )}
                <button
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all ml-2"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-100 relative overflow-hidden">
              {blobUrl ? (
                <iframe
                  src={blobUrl}
                  className="w-full h-full border-none"
                  title={title}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400">
                  <Loader2 className="animate-spin" size={48} />
                  <p className="font-medium">Generating Preview...</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

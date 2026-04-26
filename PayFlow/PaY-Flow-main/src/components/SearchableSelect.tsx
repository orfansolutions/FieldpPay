import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Check, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface Option {
  id: string;
  name: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  onAdd?: (name: string) => Promise<string | void>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  onAdd,
  placeholder = "Select option...",
  className,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(opt => opt.id === value);

  const filteredOptions = options.filter(opt =>
    opt.name.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatch = options.find(opt => opt.name.toLowerCase() === search.toLowerCase());

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearch('');
  };

  const handleAdd = async () => {
    if (!onAdd || !search.trim() || isAdding) return;
    setIsAdding(true);
    try {
      const newId = await onAdd(search.trim());
      if (newId) {
        onChange(newId);
      }
      setSearch('');
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to add option:', error);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between p-2.5 bg-white border rounded-lg text-sm transition-all outline-none",
          isOpen ? "border-blue-500 ring-2 ring-blue-500/10" : "border-slate-200 hover:border-slate-300",
          disabled && "bg-slate-50 cursor-not-allowed opacity-60"
        )}
      >
        <span className={cn("truncate", !selectedOption && "text-slate-400")}>
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        <ChevronDown size={16} className={cn("text-slate-400 transition-transform", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
          >
            <div className="p-2 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  ref={inputRef}
                  type="text"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 transition-all"
                  placeholder="Search or add new..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && search && !exactMatch && onAdd) {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto p-1">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelect(option.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left",
                      value === option.id ? "bg-blue-50 text-blue-600 font-medium" : "hover:bg-slate-50 text-slate-700"
                    )}
                  >
                    <span>{option.name}</span>
                    {value === option.id && <Check size={14} />}
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-slate-400 text-sm">
                  No results found
                </div>
              )}

              {onAdd && search.trim() && !exactMatch && (
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={isAdding}
                  className="w-full flex items-center gap-2 px-3 py-2.5 mt-1 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                >
                  <Plus size={14} />
                  <span>{isAdding ? 'Adding...' : `Add "${search}"`}</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

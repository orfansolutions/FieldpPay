import React from 'react';
import { useAuth } from '../AuthContext';
import { 
  Building2, 
  ChevronDown, 
  Check,
  Plus
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

export const OrgSwitcher: React.FC = () => {
  const { organisation, userOrganisations, switchOrganisation } = useAuth();
  const navigate = useNavigate();

  if (userOrganisations.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="w-full flex items-center justify-between gap-3 px-4 py-8 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)] flex items-center justify-center shrink-0 shadow-lg shadow-[var(--color-primary)]/20">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div className="text-left min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 leading-none mb-1">Active Entity</p>
              <p className="text-sm font-black text-white truncate tracking-tight">
                {organisation?.name || organisation?.registered_name || 'Select Organisation'}
              </p>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 p-2 rounded-2xl bg-[var(--sidebar-bg)] border-white/10 text-white shadow-2xl" align="start">
        <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-white/40 px-3 py-2">
          Switch Organisation
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/5" />
        {userOrganisations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            className={cn(
              "flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-colors",
              org.id === organisation?.id ? "bg-[var(--color-primary)] text-white" : "hover:bg-white/5 text-white/70"
            )}
            onClick={async () => {
              await switchOrganisation(org.id);
              navigate(`/dashboard/${org.id}`);
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="font-bold text-sm truncate">{org.name || org.registered_name}</span>
            </div>
            {org.id === organisation?.id && <Check className="w-4 h-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-white/5" />
        <DropdownMenuItem 
          className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer hover:bg-white/5 text-[var(--color-primary)] font-black text-sm"
          onClick={() => navigate('/organisation')}
        >
          <Plus className="w-4 h-4" />
          Create New Entity
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { UserProfile } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { User, Shield, Clock, Mail, UserPlus, Plus } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/error-handling';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { setDoc, doc } from 'firebase/firestore';
import { cn } from '../lib/utils';

export const ActiveUsersPage: React.FC = () => {
  const { organisation, user: authUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'supervisor' | 'viewer'>('viewer');
  const [isInviting, setIsInviting] = useState(false);

  const handleInvite = async () => {
    if (!organisation || !inviteEmail || !inviteName) return;
    setIsInviting(true);
    try {
      // For demo purposes, we'll create a user profile record
      // In a real app, this would be an invitation record
      const uid = `invited_${Date.now()}`;
      await setDoc(doc(db, 'users', uid), {
        uid,
        email: inviteEmail,
        displayName: inviteName,
        role: inviteRole,
        orgId: organisation.id,
        createdAt: new Date().toISOString(),
        status: 'invited'
      });
      
      // Also add to members subcollection for indexing
      await setDoc(doc(db, `organisations/${organisation.id}/members`, uid), {
        uid,
        email: inviteEmail,
        role: inviteRole,
        joinedAt: new Date().toISOString()
      });

      toast.success(`Invitation sent to ${inviteEmail}`);
      setIsInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
    } catch (e) {
      toast.error('Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  useEffect(() => {
    if (!organisation) return;

    if (organisation.id.startsWith('demo_')) {
      setUsers([
        { uid: 'u1', email: 'admin@demo.com', displayName: 'Demo Admin', role: 'admin', orgId: organisation.id, createdAt: new Date().toISOString() },
        { uid: 'u2', email: 'supervisor@demo.com', displayName: 'Demo Supervisor', role: 'supervisor', orgId: organisation.id, createdAt: new Date().toISOString() }
      ]);
      return;
    }

    // In a real app, we'd query users associated with this organisation
    // For now, we'll query the users collection where orgId matches
    const usersPath = 'users';
    const qUsers = query(collection(db, usersPath), where('orgId', '==', organisation.id));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    }, (error) => handleFirestoreError(error, OperationType.GET, usersPath, { currentUser: authUser }));

    return () => unsubUsers();
  }, [organisation, authUser]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-[var(--color-secondary)] uppercase">Active System Users</h2>
          <p className="text-[var(--color-muted-foreground)] font-bold uppercase text-[10px] tracking-widest">Manage administrative access to your organisation</p>
        </div>
        {!organisation?.id?.startsWith('demo_') && (
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger render={
              <Button className="rounded-xl font-black bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white shadow-lg">
                <UserPlus className="w-4 h-4 mr-2" />
                INVITE USER
              </Button>
            } />
            <DialogContent className="rounded-[2rem]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black tracking-tight">INVITE TEAM MEMBER</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Full Name</label>
                  <Input 
                    placeholder="e.g. John Doe"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    className="rounded-xl border-2"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Email Address</label>
                  <Input 
                    type="email"
                    placeholder="e.g. john@example.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className="rounded-xl border-2"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">System Role</label>
                  <Select value={inviteRole} onValueChange={(v: any) => setInviteRole(v)}>
                    <SelectTrigger className="rounded-xl border-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="viewer">Viewer Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[9px] font-bold text-gray-400 mt-2 px-1">
                    Administrators have full access. Supervisors can manage job cards and employees. Viewers can only see reports.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button 
                  className="w-full rounded-xl font-black py-6 bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary)]/90"
                  onClick={handleInvite}
                  disabled={isInviting || !inviteEmail || !inviteName}
                >
                  {isInviting ? 'SENDING...' : 'SEND INVITATION'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="border-2 shadow-sm rounded-[2rem] overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">User</TableHead>
                <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Role</TableHead>
                <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Email</TableHead>
                <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Joined</TableHead>
                <TableHead className="font-black text-[10px] uppercase tracking-widest py-6 px-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.uid} className="hover:bg-gray-50/50 transition-colors border-b-2 last:border-0">
                  <TableCell className="py-6 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
                        <User className="w-5 h-5" />
                      </div>
                      <span className="font-black text-[var(--color-secondary)]">{user.displayName || 'Unnamed User'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-6 px-6">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3 text-[var(--color-primary)]" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">{user.role}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-6 px-6">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                      <Mail className="w-3 h-3" />
                      {user.email}
                    </div>
                  </TableCell>
                  <TableCell className="py-6 px-6">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                      <Clock className="w-3 h-3" />
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                    </div>
                  </TableCell>
                  <TableCell className="py-6 px-6">
                    <Badge className={cn(
                      "border-none rounded-lg text-[10px] font-black uppercase tracking-widest px-3 py-1",
                      (user as any).status === 'invited' ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                    )}>
                      {(user as any).status === 'invited' ? 'Pending' : 'Active'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center text-[var(--color-muted-foreground)] font-bold uppercase tracking-widest text-xs">
                    No active users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

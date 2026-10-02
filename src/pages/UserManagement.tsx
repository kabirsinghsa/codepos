import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import Footer from '@/components/Footer';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, X, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface Site {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  display_name: string | null;
  approved: boolean;
  created_at: string;
  site_id: string | null;
}

interface UserRole {
  user_id: string;
  role: string;
}

const UserManagement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const [profilesRes, sitesRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('sites').select('id, name').eq('active', true).order('name'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      setProfiles((profilesRes.data as Profile[]) || []);
      setSites((sitesRes.data as Site[]) || []);
      setUserRoles((rolesRes.data as UserRole[]) || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const toggleApproval = async (id: string, currentlyApproved: boolean) => {
    setUpdating(id);
    const { error } = await supabase
      .from('profiles')
      .update({ approved: !currentlyApproved })
      .eq('id', id);

    if (error) toast.error('Failed to update user');
    else {
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, approved: !currentlyApproved } : p));
      toast.success(currentlyApproved ? 'User access revoked' : 'User approved');
    }
    setUpdating(null);
  };

  const assignSite = async (userId: string, siteId: string | null) => {
    const { error } = await supabase
      .from('profiles')
      .update({ site_id: siteId } as any)
      .eq('id', userId);

    if (error) toast.error('Failed to assign site');
    else {
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, site_id: siteId } : p));
      toast.success('Site assigned');
    }
  };

  const getUserRole = (userId: string): string => {
    const role = userRoles.find(r => r.user_id === userId);
    return role?.role || 'user';
  };

  const assignRole = async (userId: string, role: string) => {
    // Never let an admin remove their own admin rights (they'd lock themselves out)
    if (userId === user?.id && getUserRole(userId) === 'admin' && role !== 'admin') {
      toast.error("You can't remove your own admin role. Ask another admin to do it.");
      return;
    }

    // Add the new role FIRST, then remove the others. Deleting first meant a
    // failed insert left the user with no role at all.
    if (role !== 'user') {
      const { error } = await supabase
        .from('user_roles')
        .upsert({ user_id: userId, role } as any, { onConflict: 'user_id,role', ignoreDuplicates: true });
      if (error) { toast.error('Failed to assign role'); return; }
    }

    let del = supabase.from('user_roles').delete().eq('user_id', userId);
    if (role !== 'user') del = del.neq('role', role as any);
    const { error: delError } = await del;
    if (delError) { toast.error('Failed to remove old role'); return; }

    setUserRoles(prev => {
      const filtered = prev.filter(r => r.user_id !== userId);
      if (role !== 'user') filtered.push({ user_id: userId, role });
      return filtered;
    });
    toast.success(`Role updated to ${role}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">User Management</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-3">
        {profiles.map(profile => (
          <Card key={profile.id}>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{profile.display_name || 'No name'}</p>
                  <p className="text-xs text-muted-foreground">Joined {new Date(profile.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={profile.approved ? 'default' : 'secondary'}>
                    {profile.approved ? 'Approved' : 'Pending'}
                  </Badge>
                  <Button
                    size="sm"
                    variant={profile.approved ? 'destructive' : 'default'}
                    disabled={updating === profile.id}
                    onClick={() => toggleApproval(profile.id, profile.approved)}
                  >
                    {updating === profile.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : profile.approved ? (
                      <><X className="w-4 h-4" /> Revoke</>
                    ) : (
                      <><Check className="w-4 h-4" /> Approve</>
                    )}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Assigned Site</label>
                  <select
                    value={profile.site_id || ''}
                    onChange={e => assignSite(profile.id, e.target.value || null)}
                    className="h-9 rounded-md border border-border bg-secondary px-3 text-sm text-foreground w-full"
                  >
                    <option value="">No site (admin sees all)</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Role
                  </label>
                  <select
                    value={getUserRole(profile.id)}
                    onChange={e => assignRole(profile.id, e.target.value)}
                    className="h-9 rounded-md border border-border bg-secondary px-3 text-sm text-foreground w-full"
                  >
                    <option value="user">User</option>
                    <option value="site_manager">Site Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </main>
      <Footer />
    </div>
  );
};

export default UserManagement;

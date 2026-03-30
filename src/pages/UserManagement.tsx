import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import Footer from '@/components/Footer';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

const UserManagement = () => {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const [profilesRes, sitesRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('sites').select('id, name').eq('active', true).order('name'),
      ]);
      setProfiles((profilesRes.data as Profile[]) || []);
      setSites((sitesRes.data as Site[]) || []);
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
            </CardContent>
          </Card>
        ))}
      </main>
      <Footer />
    </div>
  );
};

export default UserManagement;

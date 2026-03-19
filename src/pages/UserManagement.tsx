import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Footer from '@/components/Footer';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Profile {
  id: string;
  display_name: string | null;
  approved: boolean;
  created_at: string;
}

const UserManagement = () => {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load users');
    } else {
      setProfiles((data as Profile[]) || []);
    }
    setLoading(false);
  };

  const toggleApproval = async (id: string, currentlyApproved: boolean) => {
    setUpdating(id);
    const { error } = await supabase
      .from('profiles')
      .update({ approved: !currentlyApproved })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update user');
    } else {
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, approved: !currentlyApproved } : p));
      toast.success(currentlyApproved ? 'User access revoked' : 'User approved');
    }
    setUpdating(null);
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
            <CardContent className="flex items-center justify-between py-4">
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
            </CardContent>
          </Card>
        ))}
      </main>
      <Footer />
    </div>
  );
};

export default UserManagement;

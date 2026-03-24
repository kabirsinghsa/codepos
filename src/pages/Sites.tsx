import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, ArrowLeft, MapPin, Trash2, Pencil } from 'lucide-react';
import Footer from '@/components/Footer';

interface Site {
  id: string;
  name: string;
  address: string;
  phone: string;
  active: boolean;
  created_at: string;
}

const Sites = () => {
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  const fetchSites = useCallback(async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Failed to load sites');
    else setSites((data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  const resetForm = () => {
    setName('');
    setAddress('');
    setPhone('');
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Site name is required'); return; }
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('sites')
          .update({ name: name.trim(), address: address.trim(), phone: phone.trim(), updated_at: new Date().toISOString() } as any)
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Site updated');
      } else {
        const { error } = await supabase
          .from('sites')
          .insert({ name: name.trim(), address: address.trim(), phone: phone.trim() } as any);
        if (error) throw error;
        toast.success('Site created');
      }
      resetForm();
      fetchSites();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save site');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (site: Site) => {
    setEditingId(site.id);
    setName(site.name);
    setAddress(site.address);
    setPhone(site.phone);
  };

  const handleToggleActive = async (site: Site) => {
    const { error } = await supabase
      .from('sites')
      .update({ active: !site.active, updated_at: new Date().toISOString() } as any)
      .eq('id', site.id);
    if (error) toast.error('Failed to update');
    else { toast.success(site.active ? 'Site deactivated' : 'Site activated'); fetchSites(); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('sites').delete().eq('id', id);
    if (error) toast.error('Failed to delete site');
    else { toast.success('Site deleted'); fetchSites(); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Site Management</h1>
            <p className="text-xs text-muted-foreground">Manage your car wash locations</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {editingId ? 'Edit Site' : 'Add New Site'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Site Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Street Wash" className="bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Address</label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 123 Main St" className="bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0812345678" className="font-mono bg-secondary border-border" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {editingId ? 'Update Site' : 'Add Site'}
              </Button>
              {editingId && <Button variant="outline" onClick={resetForm}>Cancel</Button>}
            </div>
          </CardContent>
        </Card>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Sites ({sites.length})
          </h2>
          {sites.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-mono text-sm">No sites added yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sites.map((site) => (
                <Card key={site.id} className={!site.active ? 'opacity-60' : ''}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-foreground">{site.name}</span>
                      <Badge variant={site.active ? 'default' : 'secondary'}>
                        {site.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      {site.address && <p>📍 {site.address}</p>}
                      {site.phone && <p>📞 {site.phone}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => handleEdit(site)}>
                        <Pencil className="w-3 h-3" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => handleToggleActive(site)}>
                        {site.active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => handleDelete(site.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Sites;

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, ArrowLeft, MapPin, Trash2, Pencil, Link2, Copy, Cpu, Download, QrCode } from 'lucide-react';
import { buildEsp32Sketch, sketchFileName } from '@/lib/esp32Sketch';
import Footer from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';

interface Site {
  id: string;
  name: string;
  address: string;
  phone: string;
  active: boolean;
  created_at: string;
  bay_id: number | null;
  relay_count?: number;
  pulse_ms?: number;
}

interface SiteLink { site_id: string; linked_site_id: string; }

const Sites = () => {
  const navigate = useNavigate();
  const { isAdmin, isSiteManager, siteId } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [links, setLinks] = useState<SiteLink[]>([]);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [sketchId, setSketchId] = useState<string | null>(null);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [activeLow, setActiveLow] = useState(true);
  const [pollSeconds, setPollSeconds] = useState(1);

  const canManageAll = isAdmin;
  const canEditOwn = isSiteManager && !!siteId;

  // Redirect if no access
  useEffect(() => {
    if (!isAdmin && !isSiteManager) navigate('/');
  }, [isAdmin, isSiteManager, navigate]);

  const fetchSites = useCallback(async () => {
    let query = supabase.from('sites').select('*').order('created_at', { ascending: false });
    // Site managers only see their own site
    if (!canManageAll && canEditOwn) {
      query = query.eq('id', siteId!);
    }
    const { data, error } = await query;
    if (error) toast.error('Failed to load sites');
    else setSites((data as any[]) || []);
    const { data: linkData } = await (supabase as any).from('site_links').select('site_id, linked_site_id');
    setLinks(linkData || []);
    setLoading(false);
  }, [canManageAll, canEditOwn, siteId]);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  const isLinked = (a: string, b: string) =>
    links.some(l => (l.site_id === a && l.linked_site_id === b) || (l.site_id === b && l.linked_site_id === a));

  const linkedNames = (id: string) =>
    sites.filter(s => s.id !== id && isLinked(id, s.id)).map(s => s.name);

  const toggleLink = async (a: string, b: string) => {
    if (isLinked(a, b)) {
      const { error } = await (supabase as any).from('site_links').delete()
        .or(`and(site_id.eq.${a},linked_site_id.eq.${b}),and(site_id.eq.${b},linked_site_id.eq.${a})`);
      if (error) { toast.error('Failed to unlink sites'); return; }
      setLinks(prev => prev.filter(l => !((l.site_id === a && l.linked_site_id === b) || (l.site_id === b && l.linked_site_id === a))));
      toast.success('Sites unlinked: packages no longer shared');
    } else {
      const { error } = await (supabase as any).from('site_links').insert({ site_id: a, linked_site_id: b });
      if (error) { toast.error('Failed to link sites'); return; }
      setLinks(prev => [...prev, { site_id: a, linked_site_id: b }]);
      toast.success('Sites linked: packages now work at both');
    }
  };

  const [relayMap, setRelayMap] = useState<string[]>([]);
  // Load the site's washes so the sketch header lists which wash uses which relay
  useEffect(() => {
    const site = sites.find(x => x.id === sketchId);
    if (!site) return;
    (supabase as any).from('site_washes').select('name, relay_number, active').eq('site_id', site.id).order('sort_order')
      .then(({ data }: any) => {
        const count = site.relay_count || 4;
        setRelayMap(Array.from({ length: count }, (_, i) => {
          const names = (data || []).filter((w: any) => w.active && w.relay_number === i + 1).map((w: any) => w.name);
          return `Relay ${i + 1}: ${names.length ? names.join(', ') : '(not used)'}`;
        }));
      });
  }, [sketchId, sites]);

  const sketchFor = (site: Site) => buildEsp32Sketch({
    siteName: site.name, bayId: site.bay_id || 0, wifiSsid, wifiPassword, activeLow, pollSeconds,
    relayCount: site.relay_count || 4, pulseMs: site.pulse_ms || 1000, relayMap,
  });

  const downloadSketch = (site: Site) => {
    if (!site.bay_id) { toast.error('This site has no bay number yet'); return; }
    const blob = new Blob([sketchFor(site)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sketchFileName(site.name, site.bay_id);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Sketch downloaded');
  };

  const copySketch = async (site: Site) => {
    if (!site.bay_id) { toast.error('This site has no bay number yet'); return; }
    try { await navigator.clipboard.writeText(sketchFor(site)); toast.success('Sketch copied'); }
    catch { toast.error('Could not copy. Use Download instead.'); }
  };

  const kioskUrl = (bay: number | null) => `${window.location.origin}/kiosk?site_id=${bay ?? ''}`;

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
        // Site managers can only update their own site
        if (!canManageAll && canEditOwn && editingId !== siteId) {
          toast.error('You can only edit your own site');
          setSaving(false);
          return;
        }
        const { error } = await supabase
          .from('sites')
          .update({ name: name.trim(), address: address.trim(), phone: phone.trim(), updated_at: new Date().toISOString() } as any)
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Site updated');
      } else {
        if (!canManageAll) { toast.error('Only admins can create sites'); setSaving(false); return; }
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
    if (!canManageAll && site.id !== siteId) return;
    setEditingId(site.id);
    setName(site.name);
    setAddress(site.address);
    setPhone(site.phone);
  };

  const handleToggleActive = async (site: Site) => {
    if (!canManageAll) { toast.error('Only admins can change site status'); return; }
    const { error } = await supabase
      .from('sites')
      .update({ active: !site.active, updated_at: new Date().toISOString() } as any)
      .eq('id', site.id);
    if (error) toast.error('Failed to update');
    else { toast.success(site.active ? 'Site deactivated' : 'Site activated'); fetchSites(); }
  };

  const handleDelete = async (id: string) => {
    if (!canManageAll) { toast.error('Only admins can delete sites'); return; }
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
            <p className="text-xs text-muted-foreground">
              {canManageAll ? 'Manage your car wash locations' : 'Edit your site details'}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Only show create form for admins, or edit form when editing */}
        {(canManageAll || editingId) && (
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
        )}

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
                      {site.bay_id && (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-xs font-bold text-foreground">Bay {site.bay_id}</span>
                          <code className="text-[11px] bg-muted px-2 py-0.5 rounded truncate">{kioskUrl(site.bay_id)}</code>
                          <button type="button" aria-label="Copy kiosk link" className="p-1 rounded hover:bg-muted"
                            onClick={() => { navigator.clipboard?.writeText(kioskUrl(site.bay_id)); toast.success('Kiosk link copied'); }}>
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <p className="text-xs">
                        🔗 Packages shared with: {linkedNames(site.id).length ? linkedNames(site.id).join(', ') : 'no other sites'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(canManageAll || site.id === siteId) && (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => handleEdit(site)}>
                          <Pencil className="w-3 h-3" /> Edit
                        </Button>
                      )}
                      {(canManageAll || site.id === siteId) && (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate(`/site-washes?site=${site.id}`)}>
                          <Cpu className="w-3 h-3" /> Washes & relays
                        </Button>
                      )}
                      {(canManageAll || site.id === siteId) && site.bay_id && (
                        <Button size="sm" className="gap-1" onClick={() => navigate(`/install?site_id=${site.bay_id}`)}>
                          <QrCode className="w-3 h-3" /> Deploy
                        </Button>
                      )}
                      {canManageAll && (
                        <>
                          <Button variant={linkingId === site.id ? 'default' : 'outline'} size="sm" className="gap-1"
                            onClick={() => setLinkingId(linkingId === site.id ? null : site.id)}>
                            <Link2 className="w-3 h-3" /> Link sites
                          </Button>
                          <Button variant={sketchId === site.id ? 'default' : 'outline'} size="sm" className="gap-1"
                            onClick={() => setSketchId(sketchId === site.id ? null : site.id)}>
                            <Cpu className="w-3 h-3" /> ESP32 sketch
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => handleToggleActive(site)}>
                            {site.active ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => handleDelete(site.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                    </div>
                    {canManageAll && sketchId === site.id && (
                      <div className="mt-2 p-3 rounded-xl border border-border bg-muted/30 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Relay controller sketch for <strong>{site.name}</strong> (Bay {site.bay_id}). WiFi details are only put in the file, never saved.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input placeholder="WiFi name (SSID)" value={wifiSsid} onChange={e => setWifiSsid(e.target.value)} />
                          <Input placeholder="WiFi password" type="password" value={wifiPassword} onChange={e => setWifiPassword(e.target.value)} />
                          <select value={activeLow ? 'low' : 'high'} onChange={e => setActiveLow(e.target.value === 'low')}
                            className="h-10 rounded-md bg-secondary border border-border px-3 text-sm" aria-label="Relay board type">
                            <option value="low">Relay board: active-LOW (most boards)</option>
                            <option value="high">Relay board: active-HIGH</option>
                          </select>
                          <select value={pollSeconds} onChange={e => setPollSeconds(Number(e.target.value))}
                            className="h-10 rounded-md bg-secondary border border-border px-3 text-sm" aria-label="Check interval">
                            <option value={1}>Check every 1 second (fastest)</option>
                            <option value={3}>Check every 3 seconds (less data)</option>
                            <option value={5}>Check every 5 seconds (least data)</option>
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" className="gap-1" onClick={() => downloadSketch(site)}>
                            <Download className="w-3 h-3" /> Download .ino
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => copySketch(site)}>
                            <Copy className="w-3 h-3" /> Copy code
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          This site uses {site.relay_count || 4} relay(s). Pins: relay 1 = GPIO 26, 2 = 27, 3 = 32, 4 = 33, 5 = 25, 6 = 14, 7 = 13, 8 = 23. Which wash fires which relay is set on Washes & relays and needs no new sketch. Needs the ArduinoJson library and ESP32 board package 3.x.
                        </p>
                      </div>
                    )}
                    {canManageAll && linkingId === site.id && (
                      <div className="mt-2 p-3 rounded-xl border border-border bg-muted/30 space-y-2">
                        <p className="text-xs text-muted-foreground">Linked sites accept each other's packages (plates and multi-wash codes). Single wash codes only work at the site that sold them.</p>
                        {sites.filter(o => o.id !== site.id).length === 0 && <p className="text-xs">No other sites yet.</p>}
                        {sites.filter(o => o.id !== site.id).map(o => (
                          <div key={o.id} className="flex items-center justify-between">
                            <span className="text-sm font-medium">{o.name}</span>
                            <Button size="sm" variant={isLinked(site.id, o.id) ? 'default' : 'outline'} onClick={() => toggleLink(site.id, o.id)}>
                              {isLinked(site.id, o.id) ? 'Linked ✓' : 'Link'}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
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

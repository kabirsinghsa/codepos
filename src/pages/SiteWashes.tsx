import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Cpu, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Footer from '@/components/Footer';

interface SiteConfig {
  id: string; name: string; bay_id: number | null;
  relay_count: number; pulse_ms: number; package_relay: number; vehicle_pricing: boolean;
  busy_input_enabled: boolean; package_duration_seconds: number;
}
interface SiteWash {
  id: string; site_id: string; name: string; description: string; relay_number: number;
  price: number; price_suv: number; price_quantum: number; sort_order: number; active: boolean;
  duration_seconds: number;
  _dirty?: boolean; _new?: boolean;
}

const db = supabase as any;
const selectCls = 'h-10 rounded-md bg-secondary border border-border px-3 text-sm';

const SiteWashes = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const siteParam = params.get('site') || '';
  const { isAdmin, siteId: mySiteId } = useAuth();
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [washes, setWashes] = useState<SiteWash[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canEdit = isAdmin || (!!mySiteId && mySiteId === siteParam);

  const load = useCallback(async () => {
    const [s, w] = await Promise.all([
      db.from('sites').select('id, name, bay_id, relay_count, pulse_ms, package_relay, vehicle_pricing, busy_input_enabled, package_duration_seconds').eq('id', siteParam).maybeSingle(),
      db.from('site_washes').select('*').eq('site_id', siteParam).order('sort_order').order('created_at'),
    ]);
    setSite(s.data || null);
    setWashes(w.data || []);
    setLoading(false);
  }, [siteParam]);

  useEffect(() => { if (siteParam) load(); }, [siteParam, load]);

  const updateSite = (patch: Partial<SiteConfig>) => setSite(prev => (prev ? { ...prev, ...patch } : prev));
  const updateWash = (id: string, patch: Partial<SiteWash>) =>
    setWashes(prev => prev.map(w => (w.id === id ? { ...w, ...patch, _dirty: true } : w)));

  const addWash = () => {
    if (!site) return;
    setWashes(prev => [...prev, {
      id: crypto.randomUUID(), site_id: site.id, name: '', description: '', relay_number: 1,
      price: 0, price_suv: 0, price_quantum: 0, sort_order: prev.length + 1, active: true, duration_seconds: 600, _dirty: true, _new: true,
    }]);
  };

  const removeWash = async (w: SiteWash) => {
    if (!confirm(`Delete "${w.name || 'this wash'}"? Codes already sold keep working.`)) return;
    if (!w._new) {
      const { error } = await db.from('site_washes').delete().eq('id', w.id);
      if (error) { toast.error('Failed to delete wash'); return; }
    }
    setWashes(prev => prev.filter(x => x.id !== w.id));
    toast.success('Wash deleted');
  };

  const saveAll = async () => {
    if (!site) return;
    if (washes.some(w => !w.name.trim())) { toast.error('Every wash needs a name'); return; }
    setSaving(true);
    try {
      const relayCount = Math.min(8, Math.max(1, site.relay_count));
      const { error: siteErr } = await db.from('sites').update({
        relay_count: relayCount,
        pulse_ms: Math.min(30000, Math.max(100, Math.round(site.pulse_ms))),
        package_relay: Math.min(relayCount, Math.max(1, site.package_relay)),
        vehicle_pricing: site.vehicle_pricing,
        busy_input_enabled: site.busy_input_enabled,
        package_duration_seconds: Math.min(7200, Math.max(0, Math.round(site.package_duration_seconds))),
      }).eq('id', site.id);
      if (siteErr) throw siteErr;

      const dirty = washes.filter(w => w._dirty).map((w, i) => ({
        id: w.id, site_id: site.id, name: w.name.trim(), description: w.description.trim(),
        relay_number: Math.min(relayCount, Math.max(1, w.relay_number)),
        price: Number(w.price) || 0, price_suv: Number(w.price_suv) || 0, price_quantum: Number(w.price_quantum) || 0,
        sort_order: w.sort_order || i + 1, active: w.active,
        duration_seconds: Math.min(7200, Math.max(0, Math.round(w.duration_seconds))),
      }));
      if (dirty.length) {
        const { error } = await db.from('site_washes').upsert(dirty);
        if (error) throw error;
      }
      toast.success('Saved');
      await load();
    } catch (e) {
      console.error(e);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const relayOptions = Array.from({ length: site?.relay_count || 1 }, (_, i) => i + 1);
  const outOfRange = washes.filter(w => site && w.relay_number > site.relay_count);

  return (
    <div className="min-h-screen bg-background font-sans">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/sites')} aria-label="Back" className="p-2 rounded-xl hover:bg-secondary text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-xl bg-primary/10 text-primary"><Cpu className="w-6 h-6" /></div>
          <div>
            <h1 className="text-lg font-black uppercase tracking-tight">{site?.name || 'Site'}</h1>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Washes & relays{site?.bay_id ? ` · Bay ${site.bay_id}` : ''}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !site ? (
          <p className="text-sm text-muted-foreground">Site not found.</p>
        ) : (
          <>
            <section className="premium-card p-5 space-y-4">
              <h2 className="section-label">ESP32 signals</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Relays used at this site</span>
                  <select className={selectCls + ' w-full'} value={site.relay_count} disabled={!canEdit}
                    onChange={e => updateSite({ relay_count: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n} relay{n > 1 ? 's' : ''}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Pulse length (seconds)</span>
                  <Input type="number" min={0.1} max={30} step={0.1} disabled={!canEdit}
                    value={site.pulse_ms / 1000} onChange={e => updateSite({ pulse_ms: Math.round(Number(e.target.value) * 1000) || 1000 })} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Package / plate washes use</span>
                  <select className={selectCls + ' w-full'} value={Math.min(site.package_relay, site.relay_count)} disabled={!canEdit}
                    onChange={e => updateSite({ package_relay: Number(e.target.value) })}>
                    {relayOptions.map(n => <option key={n} value={n}>Relay {n}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={site.vehicle_pricing} disabled={!canEdit}
                  onChange={e => updateSite({ vehicle_pricing: e.target.checked })} />
                Different prices per vehicle type (Small/Medium, Bakkie/SUV, Quantum)
              </label>
              <div className="rounded-xl border border-border p-3 space-y-2">
                <p className="text-sm font-semibold">Stop a second car starting while the machine is busy</p>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={site.busy_input_enabled} disabled={!canEdit}
                    onChange={e => updateSite({ busy_input_enabled: e.target.checked })} />
                  <span>Use the machine's busy signal (PLC output wired to ESP32 GPIO 4). The kiosk waits until the machine says it's finished.</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Each wash's time below is always used as a backup lock, and is the only lock when the busy signal is off or the ESP32 is offline.
                </p>
                <label className="space-y-1 block">
                  <span className="text-xs text-muted-foreground">Package / plate wash time (minutes)</span>
                  <Input type="number" min={0} max={120} step={0.5} disabled={!canEdit}
                    value={site.package_duration_seconds / 60}
                    onChange={e => updateSite({ package_duration_seconds: Math.round(Number(e.target.value) * 60) })} />
                </label>
              </div>
              {outOfRange.length > 0 && (
                <p className="text-xs font-semibold text-destructive">
                  {outOfRange.length} wash(es) use a relay above {site.relay_count}. They will fire relay 1 until you change them.
                </p>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="section-label">Washes on the app ({washes.length})</h2>
                {canEdit && <Button size="sm" variant="outline" className="gap-1" onClick={addWash}><Plus className="w-3 h-3" /> Add wash</Button>}
              </div>
              {washes.length === 0 && <p className="text-sm text-muted-foreground">No washes yet. Tap Add wash.</p>}
              {washes.map(w => (
                <div key={w.id} className={`premium-card p-4 space-y-3 ${w.active ? '' : 'opacity-60'}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                    <Input placeholder="Wash name, e.g. Quick Wash" value={w.name} disabled={!canEdit}
                      onChange={e => updateWash(w.id, { name: e.target.value })} />
                    <select className={selectCls} value={w.relay_number} disabled={!canEdit} aria-label="Relay"
                      onChange={e => updateWash(w.id, { relay_number: Number(e.target.value) })}>
                      {relayOptions.map(n => <option key={n} value={n}>Sends relay {n}</option>)}
                      {w.relay_number > site.relay_count && <option value={w.relay_number}>Relay {w.relay_number} (not available)</option>}
                    </select>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Input placeholder="Short description (optional)" value={w.description} disabled={!canEdit}
                      onChange={e => updateWash(w.id, { description: e.target.value })} />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Input type="number" min={0} max={120} step={0.5} className="w-20" disabled={!canEdit} aria-label="Wash time in minutes"
                        value={w.duration_seconds / 60} onChange={e => updateWash(w.id, { duration_seconds: Math.round(Number(e.target.value) * 60) })} />
                      min
                    </label>
                  </div>
                  <div className={`grid gap-2 ${site.vehicle_pricing ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
                    <label className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">{site.vehicle_pricing ? 'Small/Medium (R)' : 'Price (R)'}</span>
                      <Input type="number" min={0} step={0.5} value={w.price} disabled={!canEdit}
                        onChange={e => updateWash(w.id, { price: Number(e.target.value) })} />
                    </label>
                    {site.vehicle_pricing && (
                      <>
                        <label className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">Bakkie/SUV (R)</span>
                          <Input type="number" min={0} step={0.5} value={w.price_suv} disabled={!canEdit}
                            onChange={e => updateWash(w.id, { price_suv: Number(e.target.value) })} />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">Quantum (R)</span>
                          <Input type="number" min={0} step={0.5} value={w.price_quantum} disabled={!canEdit}
                            onChange={e => updateWash(w.id, { price_quantum: Number(e.target.value) })} />
                        </label>
                      </>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={w.active} onChange={e => updateWash(w.id, { active: e.target.checked })} />
                        Show on POS
                      </label>
                      <button type="button" onClick={() => removeWash(w)} className="text-xs text-destructive flex items-center gap-1">
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </section>

            {canEdit && (
              <div className="sticky bottom-4">
                <Button className="w-full h-12 gap-2" onClick={saveAll} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save washes & relays
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Changing washes or relay numbers here takes effect straight away. Only re-download the ESP32 sketch if you change the number of relays.
            </p>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default SiteWashes;

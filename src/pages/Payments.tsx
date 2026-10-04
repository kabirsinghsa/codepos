import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Eye, EyeOff, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import Footer from '@/components/Footer';

const KEYS = ['payfast_enabled', 'payfast_sandbox', 'payfast_merchant_id', 'payfast_merchant_key', 'payfast_passphrase'] as const;
type Key = typeof KEYS[number];


const Payments = () => {
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<Key, string>>({
    payfast_enabled: 'false', payfast_sandbox: 'true', payfast_merchant_id: '', payfast_merchant_key: '', payfast_passphrase: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    supabase.from('business_settings').select('key, value').in('key', KEYS as unknown as string[])
      .then(({ data }) => {
        if (data) {
          setValues(prev => {
            const next = { ...prev };
            data.forEach(r => { (next as any)[r.key] = r.value; });
            return next;
          });
        }
        setLoading(false);
      });
  }, []);

  const set = (k: Key, v: string) => setValues(prev => ({ ...prev, [k]: v }));
  const enabled = values.payfast_enabled === 'true';
  const sandbox = values.payfast_sandbox === 'true';

  const save = async () => {
    if (enabled && (!values.payfast_merchant_id.trim() || !values.payfast_merchant_key.trim())) {
      toast.error('Merchant ID and Merchant Key are required to switch PayFast on');
      return;
    }
    setSaving(true);
    try {
      const rows = KEYS.map(k => ({ key: k, value: values[k].trim() }));
      const { error } = await supabase.from('business_settings').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
      toast.success(enabled ? (sandbox ? 'Saved: PayFast TEST mode is on' : 'Saved: PayFast LIVE payments are on') : 'Saved: PayFast is off');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save. Only admins can change payment settings.');
    } finally {
      setSaving(false);
    }
  };

  const notifyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payfast-itn`;

  return (
    <div className="min-h-screen bg-background font-sans">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/')} aria-label="Back" className="p-2 rounded-xl hover:bg-secondary text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-xl bg-primary/10 text-primary"><CreditCard className="w-6 h-6" /></div>
          <div>
            <h1 className="text-lg font-black uppercase tracking-tight">Payments</h1>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">PayFast for online package sales</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <section className="premium-card p-5 space-y-4">
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-semibold">Accept online payments</span>
                  <span className="block text-xs text-muted-foreground">
                    {enabled ? 'On: customers pay with PayFast and packages activate automatically' : 'Off: orders stay pending until staff activate them'}
                  </span>
                </span>
                <Switch checked={enabled} onCheckedChange={(v: boolean) => set('payfast_enabled', v ? 'true' : 'false')} aria-label="Accept online payments" />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <span>
                  <span className="block text-sm font-semibold">Test mode (PayFast sandbox)</span>
                  <span className="block text-xs text-muted-foreground">
                    {sandbox ? 'No real money moves. Use this to try a payment first.' : 'LIVE: real payments into your PayFast account'}
                  </span>
                </span>
                <Switch checked={sandbox} onCheckedChange={(v: boolean) => set('payfast_sandbox', v ? 'true' : 'false')} aria-label="Test mode" />
              </label>
              {!sandbox && enabled && (
                <p className="text-xs font-semibold text-amber-600">Live mode: make sure these are your real PayFast details, not the sandbox ones.</p>
              )}
            </section>

            <section className="premium-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="section-label">PayFast account details</h2>
                <button type="button" onClick={() => setShowSecrets(v => !v)} className="text-xs flex items-center gap-1 text-muted-foreground">
                  {showSecrets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {showSecrets ? 'Hide' : 'Show'}
                </button>
              </div>
              <label className="space-y-1 block">
                <span className="text-xs text-muted-foreground">Merchant ID</span>
                <Input inputMode="numeric" value={values.payfast_merchant_id} onChange={e => set('payfast_merchant_id', e.target.value)} placeholder="e.g. 10000100" />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs text-muted-foreground">Merchant Key</span>
                <Input type={showSecrets ? 'text' : 'password'} value={values.payfast_merchant_key} onChange={e => set('payfast_merchant_key', e.target.value)} autoComplete="off" />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs text-muted-foreground">Passphrase (must match PayFast → Settings → Developer Settings; leave empty if you didn't set one)</span>
                <Input type={showSecrets ? 'text' : 'password'} value={values.payfast_passphrase} onChange={e => set('payfast_passphrase', e.target.value)} autoComplete="off" />
              </label>
              {sandbox && (
                <p className="text-xs text-muted-foreground">
                  Test mode needs your <strong>sandbox</strong> details: log in at sandbox.payfast.co.za and copy the Merchant ID, Key and passphrase from there.
                </p>
              )}
            </section>

            <section className="premium-card p-5 space-y-2">
              <h2 className="section-label">Payment confirmation address (ITN)</h2>
              <p className="text-xs text-muted-foreground">Sent to PayFast with every payment automatically. Nothing to set up; shown here for reference.</p>
              <code className="block text-[11px] bg-muted rounded px-2 py-1.5 break-all">{notifyUrl}</code>
              <p className="text-xs text-muted-foreground">Package prices are set on the main screen under Settings.</p>
            </section>

            <Button className="w-full h-12 gap-2" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save payment settings
            </Button>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Payments;

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Printer, ExternalLink, QrCode, Copy, MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import Footer from '@/components/Footer';

interface SiteRow { id: string; name: string; bay_id: number | null; active: boolean }
interface DeployLink { title: string; subtitle: string; poster: string; url: string; color: string; bg: string }

const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const Install = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const origin = window.location.origin;
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState('GES CODE CONTROLLER');

  useEffect(() => {
    Promise.all([
      (supabase as any).from('sites').select('id, name, bay_id, active').order('bay_id'),
      supabase.from('business_settings').select('value').eq('key', 'business_name').maybeSingle(),
    ]).then(([sitesRes, nameRes]: any[]) => {
      setSites(sitesRes.data || []);
      if (nameRes.data?.value) setBusinessName(nameRes.data.value);
      setLoading(false);
    });
  }, []);

  const bay = parseInt(searchParams.get('site_id') || '');
  const site = sites.find(s => s.bay_id === bay) || null;

  const links: DeployLink[] = useMemo(() => {
    if (!site?.bay_id) return [];
    const b = site.bay_id;
    return [
      {
        title: 'Kiosk terminal',
        subtitle: 'Open this on the bay tablet. Customers scan their QR code here.',
        poster: 'Wash bay kiosk',
        url: `${origin}/kiosk?site_id=${b}`,
        color: 'text-primary', bg: 'bg-primary/10',
      },
      {
        title: 'Customer: My Wash Codes',
        subtitle: 'Customers scan this to see the wash codes they bought.',
        poster: 'Scan to view your wash codes',
        url: `${origin}/my-codes?site_id=${b}`,
        color: 'text-blue-500', bg: 'bg-blue-500/10',
      },
      {
        title: 'Customer: Buy Package',
        subtitle: 'Customers scan this to buy a monthly package for this site.',
        poster: 'Scan to buy a monthly wash package',
        url: `${origin}/buy-package?site_id=${b}`,
        color: 'text-orange-500', bg: 'bg-orange-500/10',
      },
    ];
  }, [site, origin]);

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
    catch { toast.error('Could not copy the link'); }
  };

  const handlePrint = (link: DeployLink) => {
    if (!site) return;
    const qr = renderToStaticMarkup(<QRCodeSVG value={link.url} size={300} level="H" />);
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) { toast.error('Allow pop-ups to print the poster'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>${esc(site.name)} - ${esc(link.title)}</title>
      <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
        .box { padding: 40px; border: 4px solid #000; border-radius: 40px; max-width: 500px; }
        h1 { font-size: 34px; font-weight: 900; margin: 0 0 4px; text-transform: uppercase; }
        h2 { font-size: 14px; font-weight: 700; color: #888; margin: 0 0 24px; letter-spacing: 2px; text-transform: uppercase; }
        p { font-size: 20px; font-weight: bold; margin: 0 0 28px; }
        .qr { background: #fff; padding: 16px; display: inline-block; border: 2px solid #eee; }
        .url { font-family: monospace; font-size: 12px; color: #999; margin-top: 20px; word-break: break-all; }
      </style></head><body><div class="box">
        <h1>${esc(site.name)}</h1>
        <h2>${esc(businessName)}</h2>
        <p>${esc(link.poster)}</p>
        <div class="qr">${qr}</div>
        <div class="url">${esc(link.url)}</div>
      </div><script>window.onload = () => setTimeout(() => window.print(), 300);</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="min-h-screen bg-background font-sans">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate(site ? '/sites' : '/')} aria-label="Back"
            className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-xl bg-primary/10 text-primary"><QrCode className="w-6 h-6" /></div>
          <div>
            <h1 className="text-lg font-black uppercase tracking-tight">{site ? site.name : 'Deploy a site'}</h1>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
              {site ? `Bay ${site.bay_id} · kiosk and customer links` : 'Choose a site'}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !site ? (
          <div className="space-y-3">
            {sites.length === 0 && <p className="text-sm text-muted-foreground">No sites yet. Create one on the Sites page first.</p>}
            {sites.filter(s => s.bay_id).map(s => (
              <button key={s.id} onClick={() => setSearchParams({ site_id: String(s.bay_id) })}
                className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-border bg-card hover:border-primary/40 transition-all text-left">
                <span className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-primary" />
                  <span>
                    <span className="block font-bold">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">Bay {s.bay_id}{s.active ? '' : ' · inactive'}</span>
                  </span>
                </span>
                <span className="text-xs font-bold text-primary uppercase">Deploy →</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {links.map(link => (
              <Card key={link.title} className="overflow-hidden border-2 hover:border-primary/40 transition-all shadow-lg rounded-[2rem]">
                <CardHeader className={`${link.bg} border-b pb-5`}>
                  <CardTitle className={`text-sm font-black uppercase tracking-widest ${link.color}`}>{link.title}</CardTitle>
                  <p className="text-xs text-muted-foreground font-medium">{link.subtitle}</p>
                </CardHeader>
                <CardContent className="pt-6 flex flex-col items-center gap-4">
                  <div className="p-4 bg-white rounded-3xl shadow-inner border-2 border-zinc-100">
                    <QRCodeSVG value={link.url} size={160} level="H" />
                  </div>
                  <p className="text-[10px] font-mono text-center text-muted-foreground break-all px-2">{link.url}</p>
                  <div className="grid grid-cols-3 gap-2 w-full">
                    <Button variant="outline" size="sm" onClick={() => window.open(link.url, '_blank')} className="rounded-xl font-bold text-[10px] uppercase">
                      <ExternalLink className="w-3 h-3 mr-1" /> Open
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => copy(link.url)} className="rounded-xl font-bold text-[10px] uppercase">
                      <Copy className="w-3 h-3 mr-1" /> Copy
                    </Button>
                    <Button size="sm" onClick={() => handlePrint(link)} className="rounded-xl font-bold text-[10px] uppercase">
                      <Printer className="w-3 h-3 mr-1" /> Print
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Install;

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, getDaysInMonth } from 'date-fns';
import { FileText, ArrowLeft, TrendingUp, MapPin, ShoppingCart, CheckCircle2, ShieldCheck, Tag, Globe } from 'lucide-react';
import Footer from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';

interface WashCodeRecord {
  id: string;
  code: string;
  wash_type: string;
  price: number;
  used: boolean;
  used_at: string | null;
  created_at: string;
  site_id: string | null;
}

interface PackageLogRecord {
  id: string;
  vehicle_reg: string;
  wash_type: string;
  washed_at: string;
  site_name: string;
}

interface PosTransaction {
  id: string;
  total: number;
  created_at: string;
}

const Reports = () => {
  const { isAdmin } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [tab, setTab] = useState('overview');

  const [codes, setCodes] = useState<WashCodeRecord[]>([]);
  const [packageLogs, setPackageLogs] = useState<PackageLogRecord[]>([]);
  const [posTransactions, setPosTransactions] = useState<PosTransaction[]>([]);
  const [globalActivePackages, setGlobalActivePackages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from('sites').select('id, name').order('name').then(({ data }) => {
      setSites((data as any[]) || []);
    });

    // Fetch Global Active Packages (Packages that work at all sites)
    const fetchActivePackages = async () => {
      const { count } = await supabase
        .from('wash_packages')
        .select('*', { count: 'exact', head: true })
        .eq('active', true)
        .gt('end_date', new Date().toISOString());
      setGlobalActivePackages(count || 0);
    };
    fetchActivePackages();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    let start, end;
    if (tab === 'overview') {
      start = `${date}T00:00:00.000Z`;
      end = `${date}T23:59:59.999Z`;
    } else {
      const [year, mon] = month.split('-').map(Number);
      start = `${month}-01T00:00:00.000Z`;
      const lastDay = getDaysInMonth(new Date(year, mon - 1));
      end = `${month}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;
    }

    const [codesRes, logsRes, posRes] = await Promise.all([
      supabase.from('wash_codes').select('*').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false }),
      supabase.from('package_wash_logs').select('*').gte('washed_at', start).lte('washed_at', end).order('washed_at', { ascending: false }),
      supabase.from('pos_transactions').select('id, total, created_at').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false })
    ]);

    setCodes((codesRes.data as WashCodeRecord[]) || []);
    setPackageLogs((logsRes.data as PackageLogRecord[]) || []);
    setPosTransactions((posRes.data as PosTransaction[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [date, month, tab]);

  const statsBySite = useMemo(() => {
    const siteData: Record<string, { codes: number; packages: number; revenue: number }> = {
      'HEAD OFFICE': { codes: 0, packages: 0, revenue: 0 },
      'HUDDLE': { codes: 0, packages: 0, revenue: 0 },
      'BOKSBURG': { codes: 0, packages: 0, revenue: 0 }
    };

    codes.forEach(c => {
      const matchedSite = sites.find(s => s.id === c.site_id);
      const siteName = matchedSite ? matchedSite.name.toUpperCase() : 'HEAD OFFICE';
      if (siteData[siteName]) {
        siteData[siteName].codes++;
        siteData[siteName].revenue += Number(c.price);
      }
    });

    packageLogs.forEach(p => {
      const siteName = (p.site_name || 'HEAD OFFICE').toUpperCase();
      if (siteData[siteName]) {
        siteData[siteName].packages++;
      }
    });

    return Object.entries(siteData);
  }, [codes, packageLogs, sites]);

  const posRevenue = useMemo(() => posTransactions.reduce((s, t) => s + Number(t.total), 0), [posTransactions]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-lg font-bold tracking-tight uppercase italic">Business Intelligence</h1>
          </div>
          <Link to="/" className="text-[10px] font-black text-muted-foreground hover:text-foreground flex items-center gap-1 uppercase tracking-widest bg-secondary px-3 py-1.5 rounded-full border border-border">
            <ArrowLeft className="w-3 h-3" /> Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* TOP LEVEL SUMMARY */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-primary/5 border-primary/20 shadow-lg border-2">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Global Active Packages</p>
                  <p className="text-4xl font-black font-mono mt-1">{globalActivePackages}</p>
                </div>
                <div className="p-4 bg-primary/10 rounded-2xl"><ShieldCheck className="w-8 h-8 text-primary" /></div>
              </div>
              <p className="text-[9px] text-muted-foreground mt-4 font-bold uppercase italic">These packages are valid at all 3 sites</p>
            </CardContent>
          </Card>

          <Card className="bg-orange-500/5 border-orange-500/20 shadow-lg border-2">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-orange-600 uppercase tracking-[0.2em]">Total POS Revenue</p>
                  <p className="text-4xl font-black font-mono mt-1 text-orange-600">R{posRevenue.toFixed(0)}</p>
                </div>
                <div className="p-4 bg-orange-500/10 rounded-2xl"><Tag className="w-8 h-8 text-orange-500" /></div>
              </div>
              <p className="text-[9px] text-muted-foreground mt-4 font-bold uppercase italic">Includes all shop & product sales</p>
            </CardContent>
          </Card>

          <Card className="bg-blue-500/5 border-blue-500/20 shadow-lg border-2">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Global Wash Intake</p>
                  <p className="text-4xl font-black font-mono mt-1 text-blue-600">{codes.length + packageLogs.length}</p>
                </div>
                <div className="p-4 bg-blue-500/10 rounded-2xl"><Globe className="w-8 h-8 text-blue-500" /></div>
              </div>
              <p className="text-[9px] text-muted-foreground mt-4 font-bold uppercase italic">Total cars washed across all sites</p>
            </CardContent>
          </Card>
        </div>

        <div className="bg-card p-4 rounded-3xl border border-border shadow-sm flex flex-col sm:flex-row gap-4 items-center">
          <Tabs value={tab} onValueChange={setTab} className="w-full sm:w-auto">
            <TabsList className="bg-muted p-1 rounded-2xl">
              <TabsTrigger value="overview" className="text-[10px] uppercase font-black px-8 py-2 rounded-xl">Intake & Usage</TabsTrigger>
              <TabsTrigger value="pos" className="text-[10px] uppercase font-black px-8 py-2 rounded-xl">Shop detail</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex gap-2 ml-auto">
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-40 h-10 font-black border-border rounded-xl text-xs" />
            <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40 h-10 font-black border-border rounded-xl text-xs" />
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsContent value="overview" className="space-y-8 animate-in fade-in duration-500">
            {/* SITE PERFORMANCE CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {statsBySite.map(([name, data]) => (
                <Card key={name} className="overflow-hidden border-2 border-border shadow-xl rounded-3xl group hover:border-primary/40 transition-all duration-300">
                  <CardHeader className="bg-muted/30 pb-4 border-b">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-[11px] font-black text-foreground tracking-[0.25em]">{name}</CardTitle>
                      <MapPin className="w-4 h-4 text-primary" />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-8 space-y-8">
                    <div className="space-y-1 text-center">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Site Activity</p>
                      <p className="text-6xl font-black font-mono text-foreground tracking-tighter italic">{data.codes + data.packages}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 py-6 border-y border-dashed border-border">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Wash Codes</p>
                        <p className="text-2xl font-black font-mono">{data.codes}</p>
                      </div>
                      <div className="space-y-1 border-l border-border pl-4">
                        <p className="text-[9px] font-black text-purple-500 uppercase tracking-widest">Packages</p>
                        <p className="text-2xl font-black font-mono">{data.packages}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-[9px] font-black text-muted-foreground uppercase mb-1 tracking-widest">Cash Revenue (Codes Only)</p>
                      <p className="text-3xl font-black font-mono text-green-500">R{data.revenue.toFixed(2)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <section className="space-y-4">
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" /> Code Sales History
                </h2>
                <div className="rounded-3xl border border-border bg-card overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr className="text-muted-foreground text-left">
                        <th className="px-6 py-4 font-black text-[9px] uppercase tracking-widest">Code</th>
                        <th className="px-6 py-4 font-black text-[9px] uppercase tracking-widest">Site</th>
                        <th className="px-6 py-4 font-black text-[9px] uppercase tracking-widest text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {codes.map(c => (
                        <tr key={c.id} className="border-b border-border/50 hover:bg-blue-500/5 transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-primary">{c.code}</td>
                          <td className="px-6 py-4 text-[9px] font-black uppercase">
                            {sites.find(s => s.id === c.site_id)?.name || 'HEAD OFFICE'}
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-right">R{Number(c.price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-500 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Package Usage History
                </h2>
                <div className="rounded-3xl border border-border bg-card overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr className="text-muted-foreground text-left">
                        <th className="px-6 py-4 font-black text-[9px] uppercase tracking-widest">Vehicle</th>
                        <th className="px-6 py-4 font-black text-[9px] uppercase tracking-widest">Site</th>
                        <th className="px-6 py-4 font-black text-[9px] uppercase tracking-widest text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packageLogs.map(p => (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-purple-500/5 transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-foreground uppercase">{p.vehicle_reg}</td>
                          <td className="px-6 py-4 text-[9px] font-black uppercase">
                            {p.site_name || 'HEAD OFFICE'}
                          </td>
                          <td className="px-6 py-4 text-[10px] text-muted-foreground font-mono text-right font-bold tracking-tighter">
                            {format(new Date(p.washed_at), 'HH:mm')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="pos" className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 gap-6">
              {posTransactions.map(t => (
                <div key={t.id} className="bg-card border border-border p-6 rounded-2xl shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-orange-500/10 rounded-xl"><ShoppingCart className="w-5 h-5 text-orange-500" /></div>
                    <div>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Transaction Ref</p>
                      <p className="font-mono font-bold text-sm uppercase">{t.id.slice(0, 8)}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Time</p>
                    <p className="font-bold text-xs">{format(new Date(t.created_at), 'dd MMM, HH:mm')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total</p>
                    <p className="text-2xl font-black font-mono text-orange-500">R{Number(t.total).toFixed(2)}</p>
                  </div>
                </div>
              ))}
              {posTransactions.length === 0 && <div className="py-20 text-center text-muted-foreground italic uppercase tracking-widest text-xs">No Shop sales for this period</div>}
            </div>
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
};

export default Reports;

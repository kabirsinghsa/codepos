import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, getDaysInMonth } from 'date-fns';
import { FileText, ArrowLeft, TrendingUp, MapPin, ShoppingCart, CheckCircle2, ShieldCheck, Tag } from 'lucide-react';
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
  const [activePackagesCount, setActivePackagesCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from('sites').select('id, name').order('name').then(({ data }) => {
      setSites((data as any[]) || []);
    });

    const fetchActivePackages = async () => {
      const { data } = await supabase
        .from('wash_packages')
        .select('site_id')
        .eq('active', true)
        .gt('end_date', new Date().toISOString());

      if (data) {
        const counts: Record<string, number> = { 'GLOBAL': data.length };
        data.forEach(pkg => {
          const matchedSite = sites.find(s => s.id === pkg.site_id);
          const siteName = matchedSite ? matchedSite.name.toUpperCase() : 'HEAD OFFICE';
          counts[siteName] = (counts[siteName] || 0) + 1;
        });
        setActivePackagesCount(counts);
      }
    };
    if (sites.length > 0) fetchActivePackages();
  }, [sites]);

  const fetchData = async () => {
    setLoading(true);
    let start, end;
    if (tab === 'daily' || tab === 'overview') {
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
            <FileText className="w-6 h-6 text-primary" />
            <h1 className="text-lg font-bold tracking-tight uppercase">Site Reports</h1>
          </div>
          <Link to="/" className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 uppercase">
            <ArrowLeft className="w-3 h-3" /> Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest pl-1">Reporting Mode</label>
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="bg-muted/50 p-1">
                <TabsTrigger value="overview" className="text-[10px] uppercase font-black px-6">Today</TabsTrigger>
                <TabsTrigger value="monthly" className="text-[10px] uppercase font-black px-6">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-1 ml-auto">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest pl-1">
              Selection
            </label>
            {tab === 'monthly' ? (
              <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-48 h-10 font-black border-primary/20" />
            ) : (
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-48 h-10 font-black border-primary/20" />
            )}
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-xs font-black uppercase tracking-widest">Site Performance Breakdown</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                <ShieldCheck className="w-3 h-3 text-green-500" />
                <span className="text-[10px] font-black text-green-600 uppercase tracking-tighter">Total Active Packages: {activePackagesCount['GLOBAL'] || 0}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-1 bg-blue-500/10 rounded-full border border-blue-500/20">
                <Tag className="w-3 h-3 text-blue-500" />
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">Total POS Revenue: R{posRevenue.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {statsBySite.map(([name, data]) => (
              <Card key={name} className="overflow-hidden border-2 border-border shadow-md">
                <CardHeader className="bg-muted/30 pb-4 border-b">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-xs font-black text-primary tracking-[0.2em]">{name}</CardTitle>
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Site Washes</p>
                    <p className="text-5xl font-black font-mono text-foreground tracking-tighter italic">{data.codes + data.packages}</p>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-dashed border-border">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="w-3 h-3 text-blue-500" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Wash Codes Sold</span>
                      </div>
                      <span className="text-xl font-black font-mono">{data.codes}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-purple-500" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Package Washes</span>
                      </div>
                      <span className="text-xl font-black font-mono">{data.packages}</span>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-muted/50">
                      <span className="text-[9px] font-black text-green-600 uppercase tracking-tighter italic">Currently Active Packages (Site)</span>
                      <span className="text-sm font-black font-mono text-green-600">{activePackagesCount[name] || 0}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t-2 border-primary/10">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1 tracking-widest">Cash Revenue (Codes)</p>
                    <p className="text-2xl font-black font-mono text-green-500">R{data.revenue.toFixed(2)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 px-1">Wash Codes</h2>
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr className="text-muted-foreground text-left">
                    <th className="px-4 py-3 font-black text-[9px] uppercase">Code</th>
                    <th className="px-4 py-3 font-black text-[9px] uppercase text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map(c => (
                    <tr key={c.id} className="border-b border-border/50">
                      <td className="px-4 py-3 font-mono font-bold text-primary">{c.code}</td>
                      <td className="px-4 py-3 font-mono font-bold text-right text-xs">R{Number(c.price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-500 px-1">Package Washes</h2>
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr className="text-muted-foreground text-left">
                    <th className="px-4 py-3 font-black text-[9px] uppercase">Vehicle</th>
                    <th className="px-4 py-3 font-black text-[9px] uppercase text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {packageLogs.map(p => (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="px-4 py-3 font-mono font-bold text-foreground uppercase">{p.vehicle_reg}</td>
                      <td className="px-4 py-3 text-[10px] text-muted-foreground font-mono text-right bold">
                        {format(new Date(p.washed_at), 'HH:mm')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500 px-1">POS Sales</h2>
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr className="text-muted-foreground text-left">
                    <th className="px-4 py-3 font-black text-[9px] uppercase">Trans ID</th>
                    <th className="px-4 py-3 font-black text-[9px] uppercase text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {posTransactions.map(t => (
                    <tr key={t.id} className="border-b border-border/50">
                      <td className="px-4 py-3 font-mono text-[9px] text-muted-foreground truncate max-w-[80px]">{t.id}</td>
                      <td className="px-4 py-3 font-mono font-bold text-right text-xs text-orange-500">R{Number(t.total).toFixed(2)}</td>
                    </tr>
                  ))}
                  {posTransactions.length === 0 && <tr><td colSpan={2} className="py-12 text-center text-muted-foreground italic text-[9px]">No POS sales</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Reports;

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, getDaysInMonth } from 'date-fns';
import { FileText, ArrowLeft, TrendingUp, MapPin, ShoppingCart, CheckCircle2, ShieldCheck, Tag, Globe, Store, Lock, Download } from 'lucide-react';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  site_id: string | null;
}

const Reports = () => {
  const { isAdmin, siteId: userSiteId } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [activeTab, setActiveTab] = useState('overview');

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
    if (viewMode === 'daily') {
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
      supabase.from('pos_transactions').select('*').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false })
    ]);

    setCodes((codesRes.data as WashCodeRecord[]) || []);
    setPackageLogs((logsRes.data as PackageLogRecord[]) || []);
    setPosTransactions((posRes.data as PosTransaction[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [date, month, viewMode]);

  const statsBySite = useMemo(() => {
    const siteData: Record<string, { id: string | null; codes: number; packages: number; washRevenue: number; posRevenue: number }> = {
      'HEAD OFFICE': { id: null, codes: 0, packages: 0, washRevenue: 0, posRevenue: 0 },
      'HUDDLE': { id: null, codes: 0, packages: 0, washRevenue: 0, posRevenue: 0 },
      'BOKSBURG': { id: null, codes: 0, packages: 0, washRevenue: 0, posRevenue: 0 }
    };

    sites.forEach(s => {
      if (siteData[s.name.toUpperCase()]) {
        siteData[s.name.toUpperCase()].id = s.id;
      }
    });

    codes.forEach(c => {
      const matchedSite = sites.find(s => s.id === c.site_id);
      const siteName = matchedSite ? matchedSite.name.toUpperCase() : 'HEAD OFFICE';
      if (siteData[siteName]) {
        siteData[siteName].codes++;
        siteData[siteName].washRevenue += Number(c.price);
      }
    });

    packageLogs.forEach(p => {
      const siteName = (p.site_name || 'HEAD OFFICE').toUpperCase();
      if (siteData[siteName]) {
        siteData[siteName].packages++;
      }
    });

    posTransactions.forEach(t => {
      const matchedSite = sites.find(s => s.id === t.site_id);
      const siteName = matchedSite ? matchedSite.name.toUpperCase() : 'HEAD OFFICE';
      if (siteData[siteName]) {
        siteData[siteName].posRevenue += Number(t.total);
      }
    });

    let results = Object.entries(siteData);
    if (!isAdmin && userSiteId) {
      results = results.filter(([_, data]) => data.id === userSiteId);
    }

    return results;
  }, [codes, packageLogs, posTransactions, sites, isAdmin, userSiteId]);

  const totalPosRevenue = useMemo(() => posTransactions.reduce((s, t) => s + Number(t.total), 0), [posTransactions]);
  const totalWashRevenue = useMemo(() => codes.reduce((s, c) => s + Number(c.price), 0), [codes]);

  const exportCSV = () => {
    const filename = `report-${viewMode}-${viewMode === 'daily' ? date : month}.csv`;
    let csv = 'Site,Type,Reference,Value,Timestamp\n';

    codes.forEach(c => {
      const sName = sites.find(s => s.id === c.site_id)?.name || 'Head Office';
      csv += `${sName},Wash Code,${c.code},${c.price},${format(new Date(c.created_at), 'yyyy-MM-dd HH:mm')}\n`;
    });

    packageLogs.forEach(p => {
      csv += `${p.site_name || 'Head Office'},Package Wash,${p.vehicle_reg},0,${format(new Date(p.washed_at), 'yyyy-MM-dd HH:mm')}\n`;
    });

    posTransactions.forEach(t => {
      const sName = sites.find(s => s.id === t.site_id)?.name || 'Head Office';
      csv += `${sName},Shop Sale,${t.id.slice(0,8)},${t.total},${format(new Date(t.created_at), 'yyyy-MM-dd HH:mm')}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-lg font-bold tracking-tight uppercase italic">Intelligence Hub</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={exportCSV} variant="outline" size="sm" className="gap-2 font-black text-[10px] rounded-full border-2 border-primary/20">
              <Download className="w-3 h-3" /> EXPORT REPORT
            </Button>
            <Link to="/" className="text-[10px] font-black text-muted-foreground hover:text-foreground flex items-center gap-1 uppercase tracking-widest bg-secondary px-3 py-1.5 rounded-full border border-border">
              <ArrowLeft className="w-3 h-3" /> Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* TIME CONTROLS */}
        <div className="bg-card p-4 rounded-3xl border border-border shadow-sm flex flex-col sm:flex-row gap-6 items-center">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest pl-1">Reporting Period</label>
            <div className="flex bg-muted p-1 rounded-xl">
              <button
                onClick={() => setViewMode('daily')}
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'daily' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
              >Daily</button>
              <button
                onClick={() => setViewMode('monthly')}
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'monthly' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
              >Monthly</button>
            </div>
          </div>

          <div className="space-y-1 ml-auto">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest pl-1">Selection</label>
            {viewMode === 'daily' ? (
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-48 h-10 font-black border-primary/20 rounded-xl" />
            ) : (
              <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-48 h-10 font-black border-primary/20 rounded-xl" />
            )}
          </div>
        </div>

        {/* TOP LEVEL GLOBAL SUMMARY - ONLY VISIBLE TO ADMIN */}
        {isAdmin && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in duration-700">
            <Card className="bg-primary/5 border-primary/20 shadow-lg border-2 rounded-3xl">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Global Active Packages</p>
                    <p className="text-4xl font-black font-mono mt-1">{globalActivePackages}</p>
                  </div>
                  <div className="p-4 bg-primary/10 rounded-2xl"><ShieldCheck className="w-8 h-8 text-primary" /></div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-4 font-bold uppercase italic text-center border-t border-primary/10 pt-2 tracking-widest">Global Reach</p>
              </CardContent>
            </Card>

            <Card className="bg-orange-500/5 border-orange-500/20 shadow-lg border-2 rounded-3xl">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-orange-600 uppercase tracking-[0.2em]">Global Shop Revenue</p>
                    <p className="text-4xl font-black font-mono mt-1 text-orange-600">R{totalPosRevenue.toFixed(0)}</p>
                  </div>
                  <div className="p-4 bg-orange-500/10 rounded-2xl"><Tag className="w-8 h-8 text-orange-500" /></div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-4 font-bold uppercase italic text-center border-t border-orange-500/10 pt-2 tracking-widest">Product Sales</p>
              </CardContent>
            </Card>

            <Card className="bg-blue-500/5 border-blue-500/20 shadow-lg border-2 rounded-3xl">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Global Wash Revenue</p>
                    <p className="text-4xl font-black font-mono mt-1 text-blue-600">R{totalWashRevenue.toFixed(0)}</p>
                  </div>
                  <div className="p-4 bg-blue-500/10 rounded-2xl"><ShoppingCart className="w-8 h-8 text-blue-500" /></div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-4 font-bold uppercase italic text-center border-t border-blue-500/10 pt-2 tracking-widest">Service Sales</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* PERFORMANCE BREAKDOWN */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 px-1">
            <MapPin className="w-4 h-4 text-primary" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Regional Performance Cards</h2>
          </div>
          <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-3' : 'max-w-md mx-auto'} gap-6`}>
            {statsBySite.map(([name, data]) => (
              <Card key={name} className="overflow-hidden border-2 border-border shadow-xl rounded-[2rem] group hover:border-primary/40 transition-all duration-500 bg-card">
                <CardHeader className="bg-muted/30 pb-4 border-b">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-[11px] font-black text-foreground tracking-[0.25em]">{name}</CardTitle>
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  </div>
                </CardHeader>
                <CardContent className="pt-8 space-y-6">
                  <div className="space-y-1 text-center">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Intake</p>
                    <p className="text-6xl font-black font-mono text-foreground tracking-tighter italic">{data.codes + data.packages}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-4 border-y border-dashed border-border text-center">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest opacity-70">Codes</p>
                      <p className="text-2xl font-black font-mono">{data.codes}</p>
                    </div>
                    <div className="space-y-1 border-l border-border pl-4">
                      <p className="text-[9px] font-black text-purple-500 uppercase tracking-widest opacity-70">Packages</p>
                      <p className="text-2xl font-black font-mono">{data.packages}</p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Service Value</span>
                      <span className="text-lg font-black font-mono text-green-600">R{data.washRevenue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Shop Value</span>
                      <span className="text-lg font-black font-mono text-orange-500">R{data.posRevenue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t-2 border-primary/10">
                      <span className="text-[10px] font-black text-foreground uppercase tracking-[0.2em]">Total</span>
                      <span className="text-2xl font-black font-mono text-primary">R{(data.washRevenue + data.posRevenue).toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* LOGS SECTION */}
        <div className="bg-zinc-900/5 p-1 rounded-[2.5rem] border border-border">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between p-4">
              <TabsList className="bg-muted p-1 rounded-2xl h-12">
                <TabsTrigger value="overview" className="text-[10px] font-black uppercase px-8 h-10 rounded-xl">Wash Log</TabsTrigger>
                <TabsTrigger value="pos" className="text-[10px] font-black uppercase px-8 h-10 rounded-xl">Shop Log</TabsTrigger>
              </TabsList>
              <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pr-4 opacity-40">Detail Feed</div>
            </div>

            <TabsContent value="overview" className="p-4 space-y-8 animate-in slide-in-from-bottom-2 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className="space-y-4">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 flex items-center gap-2 px-2">
                    <ShoppingCart className="w-4 h-4" /> Service Redemptions
                  </h2>
                  <div className="rounded-[2rem] border border-border bg-card overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr className="text-muted-foreground text-left text-[9px] font-black uppercase tracking-widest">
                          <th className="px-6 py-4">Auth Ref</th>
                          <th className="px-6 py-4">Site</th>
                          <th className="px-6 py-4 text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {codes.filter(c => isAdmin || c.site_id === userSiteId).map(c => (
                          <tr key={c.id} className="hover:bg-blue-500/5 transition-colors">
                            <td className="px-6 py-4 font-mono font-bold text-primary">{c.code}</td>
                            <td className="px-6 py-4 text-[9px] font-black uppercase">
                              {sites.find(s => s.id === c.site_id)?.name || 'UNKNOWN'}
                            </td>
                            <td className="px-6 py-4 font-mono font-bold text-right">R{Number(c.price).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="space-y-4">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-500 flex items-center gap-2 px-2">
                    <CheckCircle2 className="w-4 h-4" /> Package History
                  </h2>
                  <div className="rounded-[2rem] border border-border bg-card overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr className="text-muted-foreground text-left text-[9px] font-black uppercase tracking-widest">
                          <th className="px-6 py-4">Vehicle</th>
                          <th className="px-6 py-4">Site</th>
                          <th className="px-6 py-4 text-right">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {packageLogs.filter(p => {
                          if (isAdmin) return true;
                          const siteName = sites.find(s => s.id === userSiteId)?.name.toUpperCase();
                          return (p.site_name || '').toUpperCase() === siteName;
                        }).map(p => (
                          <tr key={p.id} className="hover:bg-purple-500/5 transition-colors">
                            <td className="px-6 py-4 font-mono font-bold text-foreground uppercase">{p.vehicle_reg}</td>
                            <td className="px-6 py-4 text-[9px] font-black uppercase tracking-tighter">
                              {p.site_name || 'UNKNOWN'}
                            </td>
                            <td className="px-6 py-4 text-[10px] text-muted-foreground font-mono text-right font-bold">
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

            <TabsContent value="pos" className="p-4 animate-in slide-in-from-bottom-2 duration-500">
              <div className="grid grid-cols-1 gap-4">
                {posTransactions.filter(t => isAdmin || t.site_id === userSiteId).map(t => (
                  <div key={t.id} className="bg-card border border-border p-6 rounded-[1.5rem] shadow-sm flex items-center justify-between hover:border-orange-500/30 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-orange-500/10 rounded-2xl group-hover:bg-orange-500 group-hover:text-white transition-colors">
                        <Store className="w-5 h-5 text-orange-500 group-hover:text-white" />
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Location Node</p>
                        <p className="font-bold text-sm uppercase tracking-tighter">{sites.find(s => s.id === t.site_id)?.name || 'UNKNOWN'}</p>
                      </div>
                    </div>
                    <div className="text-center hidden md:block">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Transaction Ref</p>
                      <p className="font-mono text-xs font-bold uppercase">{t.id.slice(0, 8)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Sales Value</p>
                      <p className="text-2xl font-black font-mono text-orange-500">R{Number(t.total).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
                {posTransactions.filter(t => isAdmin || t.site_id === userSiteId).length === 0 && <div className="py-20 text-center text-muted-foreground italic uppercase tracking-widest text-[10px]">No shop transactions recorded</div>}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Reports;

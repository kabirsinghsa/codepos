import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, getDaysInMonth } from 'date-fns';
import { FileText, Download, ArrowLeft, CalendarDays, Calendar, Car } from 'lucide-react';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface WashRecord {
  id: string;
  code: string;
  wash_type: string;
  price: number;
  customer_phone: string;
  used: boolean;
  used_at: string | null;
  created_at: string;
  total_washes: number;
  washes_used: number;
}

interface PackageWashLog {
  id: string;
  package_id: string;
  vehicle_reg: string;
  wash_type: string;
  washed_at: string;
}

const SummaryCards = ({ records }: { records: WashRecord[] }) => {
  const totalRevenue = records.reduce((s, r) => s + Number(r.price), 0);
  const usedCount = records.filter(r => r.used).length;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Codes Sold</p>
        <p className="text-3xl font-bold font-mono text-foreground mt-1">{records.length}</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Used</p>
        <p className="text-3xl font-bold font-mono text-foreground mt-1">{usedCount}</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Unused</p>
        <p className="text-3xl font-bold font-mono text-foreground mt-1">{records.length - usedCount}</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Revenue</p>
        <p className="text-3xl font-bold font-mono text-primary mt-1">R{totalRevenue.toFixed(2)}</p>
      </div>
    </div>
  );
};

const BreakdownByType = ({ records }: { records: WashRecord[] }) => {
  const byType = records.reduce<Record<string, { count: number; revenue: number; used: number }>>((acc, r) => {
    if (!acc[r.wash_type]) acc[r.wash_type] = { count: 0, revenue: 0, used: 0 };
    acc[r.wash_type].count++;
    acc[r.wash_type].revenue += Number(r.price);
    if (r.used) acc[r.wash_type].used++;
    return acc;
  }, {});

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Breakdown by Wash Type</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(byType).map(([type, stats]) => (
          <div key={type} className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground capitalize">{type} Wash</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.count} sold · {stats.used} used</p>
            <p className="text-lg font-bold font-mono text-primary mt-2">R{stats.revenue.toFixed(2)}</p>
          </div>
        ))}
        {Object.keys(byType).length === 0 && (
          <p className="text-sm text-muted-foreground col-span-4">No data for this period</p>
        )}
      </div>
    </section>
  );
};

const TransactionTable = ({ records, showDate }: { records: WashRecord[]; showDate?: boolean }) => (
  <section className="space-y-3">
    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">All Transactions ({records.length})</h2>
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="px-4 py-3 font-medium">Code</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Price</th>
            <th className="px-4 py-3 font-medium">Phone</th>
            <th className="px-4 py-3 font-medium">Washes</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">{showDate ? 'Date' : 'Created'}</th>
            <th className="px-4 py-3 font-medium">Used At</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
              <td className="px-4 py-3 font-mono font-bold text-primary">{r.code}</td>
              <td className="px-4 py-3 capitalize">{r.wash_type}</td>
              <td className="px-4 py-3 font-mono">R{Number(r.price).toFixed(2)}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.customer_phone || '—'}</td>
              <td className="px-4 py-3 font-mono text-xs">
                {(r.total_washes ?? 1) > 1
                  ? <span className="text-primary font-semibold">{r.washes_used ?? 0}/{r.total_washes}</span>
                  : '1/1'}
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.used ? 'bg-muted text-muted-foreground' : 'bg-success/10 text-success'}`}>
                  {r.used ? 'USED' : 'ACTIVE'}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                {showDate ? format(new Date(r.created_at), 'dd/MM HH:mm') : format(new Date(r.created_at), 'HH:mm')}
              </td>
              <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                {r.used_at ? format(new Date(r.used_at), showDate ? 'dd/MM HH:mm' : 'HH:mm') : '—'}
              </td>
            </tr>
          ))}
          {records.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No transactions for this period</td></tr>
          )}
        </tbody>
      </table>
    </div>
  </section>
);

const PackageWashReport = () => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [logs, setLogs] = useState<PackageWashLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async (monthStr: string) => {
    setLoading(true);
    const [year, mon] = monthStr.split('-').map(Number);
    const start = `${monthStr}-01T00:00:00.000Z`;
    const lastDay = getDaysInMonth(new Date(year, mon - 1));
    const end = `${monthStr}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;
    const { data } = await supabase
      .from('package_wash_logs')
      .select('*')
      .gte('washed_at', start)
      .lte('washed_at', end)
      .order('washed_at', { ascending: false });
    setLogs((data as PackageWashLog[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(month); }, [month]);

  const byVehicle = useMemo(() => {
    const map: Record<string, { reg: string; wash_type: string; count: number; lastWash: string }> = {};
    logs.forEach(l => {
      if (!map[l.vehicle_reg]) {
        map[l.vehicle_reg] = { reg: l.vehicle_reg, wash_type: l.wash_type, count: 0, lastWash: l.washed_at };
      }
      map[l.vehicle_reg].count++;
      if (new Date(l.washed_at) > new Date(map[l.vehicle_reg].lastWash)) {
        map[l.vehicle_reg].lastWash = l.washed_at;
      }
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [logs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Report Month</label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-secondary border-border w-48" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Washes</p>
          <p className="text-3xl font-bold font-mono text-foreground mt-1">{logs.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Unique Vehicles</p>
          <p className="text-3xl font-bold font-mono text-foreground mt-1">{byVehicle.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Washes/Vehicle</p>
          <p className="text-3xl font-bold font-mono text-primary mt-1">
            {byVehicle.length > 0 ? (logs.length / byVehicle.length).toFixed(1) : '0'}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Washes per Vehicle ({byVehicle.length})</h2>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-left">
                <th className="px-4 py-3 font-medium">Registration</th>
                <th className="px-4 py-3 font-medium">Wash Type</th>
                <th className="px-4 py-3 font-medium">Times Washed</th>
                <th className="px-4 py-3 font-medium">Last Wash</th>
              </tr>
            </thead>
            <tbody>
              {byVehicle.map(v => (
                <tr key={v.reg} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-foreground">{v.reg}</td>
                  <td className="px-4 py-3 capitalize">{v.wash_type}</td>
                  <td className="px-4 py-3 font-mono text-primary font-bold">{v.count}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{format(new Date(v.lastWash), 'dd MMM yyyy HH:mm')}</td>
                </tr>
              ))}
              {byVehicle.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">{loading ? 'Loading…' : 'No package washes this month'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

const Reports = () => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [dailyRecords, setDailyRecords] = useState<WashRecord[]>([]);
  const [monthlyRecords, setMonthlyRecords] = useState<WashRecord[]>([]);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [tab, setTab] = useState('daily');

  const fetchDaily = async (dateStr: string) => {
    setLoadingDaily(true);
    const dayStart = `${dateStr}T00:00:00.000Z`;
    const dayEnd = `${dateStr}T23:59:59.999Z`;
    const { data } = await supabase
      .from('wash_codes')
      .select('*')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at', { ascending: false });
    setDailyRecords((data as WashRecord[]) || []);
    setLoadingDaily(false);
  };

  const fetchMonthly = async (monthStr: string) => {
    setLoadingMonthly(true);
    const [year, mon] = monthStr.split('-').map(Number);
    const start = `${monthStr}-01T00:00:00.000Z`;
    const lastDay = getDaysInMonth(new Date(year, mon - 1));
    const end = `${monthStr}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;
    const { data } = await supabase
      .from('wash_codes')
      .select('*')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });
    setMonthlyRecords((data as WashRecord[]) || []);
    setLoadingMonthly(false);
  };

  useEffect(() => { fetchDaily(date); }, [date]);
  useEffect(() => { fetchMonthly(month); }, [month]);

  const exportCSV = (records: WashRecord[], filename: string) => {
    const header = 'Code,Wash Type,Price,Phone,Status,Washes,Used,Created,Used At\n';
    const rows = records.map(r =>
      `${r.code},${r.wash_type},${r.price},${r.customer_phone || ''},${r.used ? 'Used' : 'Active'},${r.washes_used ?? 0}/${r.total_washes ?? 1},${format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')},${r.used_at ? format(new Date(r.used_at), 'dd/MM/yyyy HH:mm') : ''}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dailyBreakdown = useMemo(() => {
    const grouped: Record<string, { count: number; revenue: number; used: number }> = {};
    monthlyRecords.forEach(r => {
      const day = format(new Date(r.created_at), 'yyyy-MM-dd');
      if (!grouped[day]) grouped[day] = { count: 0, revenue: 0, used: 0 };
      grouped[day].count++;
      grouped[day].revenue += Number(r.price);
      if (r.used) grouped[day].used++;
    });
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [monthlyRecords]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <FileText className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Reports</h1>
          <Link to="/" className="ml-auto text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="daily" className="gap-2"><CalendarDays className="w-4 h-4" /> Daily</TabsTrigger>
            <TabsTrigger value="monthly" className="gap-2"><Calendar className="w-4 h-4" /> Monthly</TabsTrigger>
            <TabsTrigger value="packages" className="gap-2"><Car className="w-4 h-4" /> Packages</TabsTrigger>
          </TabsList>

          {/* Daily Report */}
          <TabsContent value="daily" className="space-y-6 mt-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Report Date</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-secondary border-border w-48" />
              </div>
              <Button variant="outline" onClick={() => exportCSV(dailyRecords, `wash-report-${date}.csv`)} disabled={dailyRecords.length === 0} className="gap-2 mt-5">
                <Download className="w-4 h-4" /> Export CSV
              </Button>
            </div>
            <SummaryCards records={dailyRecords} />
            <BreakdownByType records={dailyRecords} />
            <TransactionTable records={dailyRecords} />
          </TabsContent>

          {/* Monthly Report */}
          <TabsContent value="monthly" className="space-y-6 mt-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Report Month</label>
                <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-secondary border-border w-48" />
              </div>
              <Button variant="outline" onClick={() => exportCSV(monthlyRecords, `wash-report-${month}.csv`)} disabled={monthlyRecords.length === 0} className="gap-2 mt-5">
                <Download className="w-4 h-4" /> Export CSV
              </Button>
            </div>
            <SummaryCards records={monthlyRecords} />
            <BreakdownByType records={monthlyRecords} />

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Daily Breakdown</h2>
              <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-left">
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Codes Sold</th>
                      <th className="px-4 py-3 font-medium">Used</th>
                      <th className="px-4 py-3 font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyBreakdown.map(([day, stats]) => (
                      <tr key={day} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 font-mono">{format(new Date(day), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-3 font-mono">{stats.count}</td>
                        <td className="px-4 py-3 font-mono">{stats.used}</td>
                        <td className="px-4 py-3 font-mono text-primary font-bold">R{stats.revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                    {dailyBreakdown.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No data for this month</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <TransactionTable records={monthlyRecords} showDate />
          </TabsContent>

          {/* Package Wash Report */}
          <TabsContent value="packages" className="space-y-6 mt-6">
            <PackageWashReport />
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
};

export default Reports;

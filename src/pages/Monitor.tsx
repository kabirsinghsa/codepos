import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { WashType, WASH_OPTIONS } from '@/lib/codeGenerator';
import { format } from 'date-fns';
import { Activity, Droplets, Clock, DollarSign } from 'lucide-react';
import Footer from '@/components/Footer';
import { Link } from 'react-router-dom';

type BayStatus = 'idle' | 'washing' | 'complete' | 'error';

interface BayState {
  status: BayStatus;
  current_wash_type: string | null;
  current_code: string | null;
  started_at: string | null;
}

interface RecentWash {
  id: string;
  code: string;
  wash_type: string;
  price: number;
  used: boolean;
  used_at: string | null;
  created_at: string;
  customer_phone: string;
}

const statusColors: Record<BayStatus, string> = {
  idle: 'bg-muted text-muted-foreground',
  washing: 'bg-blue-500/20 text-blue-400',
  complete: 'bg-green-500/20 text-green-400',
  error: 'bg-destructive/20 text-destructive',
};

const Monitor = () => {
  const [bayState, setBayState] = useState<BayState>({ status: 'idle', current_wash_type: null, current_code: null, started_at: null });
  const [recentWashes, setRecentWashes] = useState<RecentWash[]>([]);
  const [todayStats, setTodayStats] = useState({ total: 0, revenue: 0, used: 0 });

  const fetchData = async () => {
    // Bay status
    const { data: bayData } = await supabase.from('wash_bay_status').select('*').eq('id', 1).single();
    if (bayData) setBayState({ status: bayData.status as BayStatus, current_wash_type: bayData.current_wash_type, current_code: bayData.current_code, started_at: bayData.started_at });

    // Recent washes
    const { data: washes } = await supabase
      .from('wash_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (washes) setRecentWashes(washes as RecentWash[]);

    // Today's stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayCodes } = await supabase
      .from('wash_codes')
      .select('price, used')
      .gte('created_at', todayStart.toISOString());
    if (todayCodes) {
      setTodayStats({
        total: todayCodes.length,
        revenue: todayCodes.reduce((sum, c) => sum + Number(c.price), 0),
        used: todayCodes.filter(c => c.used).length,
      });
    }
  };

  useEffect(() => {
    fetchData();

    // Realtime subscriptions
    const ch1 = supabase.channel('monitor-bay').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wash_bay_status' }, (p) => {
      const d = p.new;
      setBayState({ status: d.status as BayStatus, current_wash_type: d.current_wash_type, current_code: d.current_code, started_at: d.started_at });
    }).subscribe();

    const ch2 = supabase.channel('monitor-codes').on('postgres_changes', { event: '*', schema: 'public', table: 'wash_codes' }, () => {
      fetchData();
    }).subscribe();

    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Activity className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Wash Bay Monitor</h1>
          <Link to="/" className="ml-auto text-sm text-muted-foreground hover:text-foreground transition-colors">← Back to Generator</Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Top Row: Bay Status + Today Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Bay Status */}
          <div className="md:col-span-1 rounded-lg border border-border bg-card p-6 text-center space-y-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bay Status</h2>
            <div className={`inline-block px-4 py-2 rounded-full text-sm font-bold uppercase ${statusColors[bayState.status]}`}>
              {bayState.status}
            </div>
            {bayState.current_wash_type && bayState.status === 'washing' && (
              <p className="text-sm text-foreground">{bayState.current_wash_type.charAt(0).toUpperCase() + bayState.current_wash_type.slice(1)} Wash</p>
            )}
            {bayState.started_at && bayState.status === 'washing' && (
              <p className="text-xs text-muted-foreground font-mono">Since {format(new Date(bayState.started_at), 'HH:mm:ss')}</p>
            )}
          </div>

          {/* Stats */}
          <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10 text-primary"><Droplets className="w-6 h-6" /></div>
            <div>
              <p className="text-2xl font-bold font-mono text-foreground">{todayStats.total}</p>
              <p className="text-xs text-muted-foreground">Codes Today</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-green-500/10 text-green-400"><Clock className="w-6 h-6" /></div>
            <div>
              <p className="text-2xl font-bold font-mono text-foreground">{todayStats.used}</p>
              <p className="text-xs text-muted-foreground">Used Today</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-accent/10 text-accent"><DollarSign className="w-6 h-6" /></div>
            <div>
              <p className="text-2xl font-bold font-mono text-foreground">R{todayStats.revenue.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Revenue Today</p>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Transactions</h2>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Wash Type</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Used At</th>
                </tr>
              </thead>
              <tbody>
                {recentWashes.map(w => (
                  <tr key={w.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-primary">{w.code}</td>
                    <td className="px-4 py-3 capitalize">{w.wash_type}</td>
                    <td className="px-4 py-3 font-mono">R{Number(w.price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{w.customer_phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${w.used ? 'bg-muted text-muted-foreground' : 'bg-success/10 text-success'}`}>
                        {w.used ? 'USED' : 'ACTIVE'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{format(new Date(w.created_at), 'dd/MM HH:mm')}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{w.used_at ? format(new Date(w.used_at), 'dd/MM HH:mm') : '—'}</td>
                  </tr>
                ))}
                {recentWashes.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No transactions yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Monitor;

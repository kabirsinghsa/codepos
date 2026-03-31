import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Activity, Droplets, Clock, DollarSign, MapPin } from 'lucide-react';
import Footer from '@/components/Footer';
import { Link } from 'react-router-dom';

type BayStatus = 'idle' | 'washing' | 'complete' | 'error';

interface BayState {
  id: number;
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

// Mapping IDs to your specific site names
const siteNames: Record<number, string> = {
  1: 'Head Office',
  2: 'Huddle',
  3: 'Boksburg'
};

const Monitor = () => {
  const [bays, setBays] = useState<BayState[]>([]);
  const [recentWashes, setRecentWashes] = useState<RecentWash[]>([]);
  const [todayStats, setTodayStats] = useState({ total: 0, revenue: 0, used: 0 });

  const fetchData = async () => {
    // Fetch all 3 bays
    const { data: baysData } = await supabase.from('wash_bay_status').select('*').order('id', { ascending: true });
    if (baysData) setBays(baysData as BayState[]);

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

    // Realtime subscription for all bays
    const channel = supabase.channel('monitor-all-bays').on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'wash_bay_status' },
      (payload) => {
        setBays(current =>
          current.map(bay => bay.id === payload.new.id ? (payload.new as BayState) : bay)
        );
      }
    ).subscribe();

    const ch2 = supabase.channel('monitor-codes').on('postgres_changes', { event: '*', schema: 'public', table: 'wash_codes' }, () => {
      fetchData();
    }).subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(ch2);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <Activity className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-bold">Multi-Site Monitor</h1>
          <Link to="/" className="ml-auto text-sm text-muted-foreground hover:text-foreground transition-colors">← Back to Dashboard</Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Sites Status Grid */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Live Site Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {bays.length === 0 ? (
              <div className="col-span-3 py-12 text-center border border-dashed rounded-lg border-border">
                <p className="text-muted-foreground italic">Initializing site data...</p>
              </div>
            ) : (
              bays.map((bay) => (
                <div key={bay.id} className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg">{siteNames[bay.id] || `Site ${bay.id}`}</h3>
                      <p className="text-xs text-muted-foreground font-mono">ID: {bay.id}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColors[bay.status]}`}>
                      {bay.status}
                    </div>
                  </div>

                  <div className="py-2">
                    {bay.status === 'washing' ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-primary font-bold">
                          <Droplets className="w-5 h-5 animate-pulse" />
                          <span>{bay.current_wash_type?.toUpperCase()} WASH</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Code: <span className="font-mono text-foreground">{bay.current_code}</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Started: {bay.started_at ? format(new Date(bay.started_at), 'HH:mm:ss') : 'N/A'}
                        </p>
                      </div>
                    ) : (
                      <div className="text-muted-foreground py-4 text-center border border-dashed rounded-lg border-border/50">
                        <p className="text-sm">Waiting for vehicle...</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Global Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10 text-primary"><Activity className="w-6 h-6" /></div>
            <div>
              <p className="text-2xl font-bold font-mono">{todayStats.total}</p>
              <p className="text-xs text-muted-foreground">Total Today</p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-green-500/10 text-green-400"><Clock className="w-6 h-6" /></div>
            <div>
              <p className="text-2xl font-bold font-mono">{todayStats.used}</p>
              <p className="text-xs text-muted-foreground">Washes Completed</p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-accent/10 text-accent"><DollarSign className="w-6 h-6" /></div>
            <div>
              <p className="text-2xl font-bold font-mono">R{todayStats.revenue.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Global Activity</h2>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-left">
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentWashes.map(w => (
                    <tr key={w.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="px-4 py-3 font-mono font-bold text-primary">{w.code}</td>
                      <td className="px-4 py-3 capitalize">{w.wash_type}</td>
                      <td className="px-4 py-3 font-mono">R{Number(w.price).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${w.used ? 'bg-muted text-muted-foreground' : 'bg-green-500/20 text-green-400'}`}>
                          {w.used ? 'USED' : 'ACTIVE'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{format(new Date(w.created_at), 'HH:mm')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Monitor;

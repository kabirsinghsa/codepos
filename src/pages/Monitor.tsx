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
  washing: 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]',
  complete: 'bg-green-500/20 text-green-400',
  error: 'bg-destructive/20 text-destructive',
};

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
    // 1. Fetch current status of all bays
    const { data: baysData } = await supabase
      .from('wash_bay_status')
      .select('*')
      .in('id', [1, 2, 3])
      .order('id', { ascending: true });

    if (baysData) setBays(baysData as BayState[]);

    // 2. Recent washes
    const { data: washes } = await supabase
      .from('wash_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(15);
    if (washes) setRecentWashes(washes as RecentWash[]);

    // 3. Today's stats
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

    // Listen for status changes on ALL BAYS
    const channel = supabase.channel('monitor-bays').on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'wash_bay_status' },
      () => {
        console.log("Status update detected! Refreshing...");
        fetchData();
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
          <div className="p-2 bg-primary/10 rounded-lg">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-lg font-black uppercase tracking-tight">Live Operations Monitor</h1>
          <Link to="/" className="ml-auto text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">← EXIT MONITOR</Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-10">
        {/* Sites Status Grid */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1 text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <h2 className="text-xs font-bold uppercase tracking-widest">Site Connectivity Status</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((id) => {
              const bay = bays.find(b => b.id === id);
              const isWashing = bay?.status === 'washing';

              return (
                <div key={id} className={`rounded-2xl border-2 transition-all duration-500 p-6 space-y-6 ${isWashing ? 'border-blue-500 bg-blue-500/5' : 'border-border bg-card shadow-sm'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-xl tracking-tight">{siteNames[id]}</h3>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-70 tracking-widest">Hardware Node {id}</p>
                    </div>
                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${statusColors[bay?.status || 'idle']}`}>
                      {bay?.status || 'OFFLINE'}
                    </div>
                  </div>

                  <div className="min-h-[100px] flex flex-col justify-center">
                    {isWashing ? (
                      <div className="space-y-3 animate-in fade-in zoom-in duration-300">
                        <div className="flex items-center gap-3 text-blue-500">
                          <div className="p-2 bg-blue-500/20 rounded-full animate-pulse">
                            <Droplets className="w-6 h-6" />
                          </div>
                          <span className="font-black text-lg uppercase italic">{bay.current_wash_type} Wash</span>
                        </div>
                        <div className="pl-11 space-y-1">
                          <p className="text-xs font-mono text-muted-foreground">ID: {bay.current_code}</p>
                          <p className="text-[10px] font-bold text-blue-400 uppercase">Started: {bay.started_at ? format(new Date(bay.started_at), 'HH:mm:ss') : '--:--'}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 border border-dashed rounded-xl border-border/50 opacity-40">
                        <p className="text-xs font-bold uppercase tracking-widest">Ready for Intake</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Global Summary Stats */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-6 flex items-center gap-5 shadow-sm">
            <div className="p-4 rounded-xl bg-primary/10 text-primary"><Activity className="w-6 h-6" /></div>
            <div>
              <p className="text-3xl font-black font-mono leading-none">{todayStats.total}</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">Global Intake</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 flex items-center gap-5 shadow-sm">
            <div className="p-4 rounded-xl bg-green-500/10 text-green-500"><Clock className="w-6 h-6" /></div>
            <div>
              <p className="text-3xl font-black font-mono leading-none">{todayStats.used}</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">Throughput</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 flex items-center gap-5 shadow-sm">
            <div className="p-4 rounded-xl bg-accent/10 text-accent"><DollarSign className="w-6 h-6" /></div>
            <div>
              <p className="text-3xl font-black font-mono leading-none">R{todayStats.revenue.toFixed(0)}</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">Day Revenue</p>
            </div>
          </div>
        </section>

        {/* Recent Feed */}
        <section className="space-y-4">
          <h2 className="text-xs font-black text-muted-foreground uppercase tracking-widest px-1">Recent Activity Feed</h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-muted-foreground text-left">
                    <th className="px-6 py-4 font-bold text-[10px] uppercase">Ref Code</th>
                    <th className="px-6 py-4 font-bold text-[10px] uppercase">Service</th>
                    <th className="px-6 py-4 font-bold text-[10px] uppercase">Value</th>
                    <th className="px-6 py-4 font-bold text-[10px] uppercase">Status</th>
                    <th className="px-6 py-4 font-bold text-[10px] uppercase text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {recentWashes.map(w => (
                    <tr key={w.id} className="hover:bg-secondary/30 transition-colors group">
                      <td className="px-6 py-4 font-mono font-bold text-primary">{w.code}</td>
                      <td className="px-6 py-4 capitalize font-medium">{w.wash_type}</td>
                      <td className="px-6 py-4 font-mono font-bold text-muted-foreground">R{Number(w.price).toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-tighter uppercase ${w.used ? 'bg-muted text-muted-foreground' : 'bg-green-500/10 text-green-500'}`}>
                          {w.used ? 'Processed' : 'Active'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground font-mono text-[10px] text-right">
                        {format(new Date(w.created_at), 'HH:mm')}
                      </td>
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

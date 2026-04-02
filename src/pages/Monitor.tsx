import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Activity, Droplets, Clock, DollarSign, MapPin, ShieldCheck, Zap, AlertCircle, Package } from 'lucide-react';
import Footer from '@/components/Footer';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

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
}

const statusThemes: Record<BayStatus, { bg: string; text: string; glow: string; label: string }> = {
  idle: { bg: 'bg-zinc-900/50', text: 'text-zinc-500', glow: 'border-zinc-800', label: 'Ready' },
  washing: { bg: 'bg-blue-500/10', text: 'text-blue-400', glow: 'border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.2)]', label: 'In Progress' },
  complete: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', glow: 'border-emerald-500/50', label: 'Success' },
  error: { bg: 'bg-red-500/10', text: 'text-red-400', glow: 'border-red-500/50', label: 'System Alert' },
};

const siteNames: Record<number, string> = {
  1: 'Head Office',
  2: 'Huddle',
  3: 'Boksburg'
};

const Monitor = () => {
  const [bays, setBays] = useState<BayState[]>([]);
  const [recentWashes, setRecentWashes] = useState<RecentWash[]>([]);
  const [todayStats, setTodayStats] = useState({ total: 0, revenue: 0, throughput: 0, activePackages: 0 });

  const fetchData = async () => {
    const { data: baysData } = await supabase.from('wash_bay_status').select('*').in('id', [1, 2, 3]).order('id', { ascending: true });
    if (baysData) setBays(baysData as BayState[]);

    const { data: washes } = await supabase.from('wash_codes').select('*').order('created_at', { ascending: false }).limit(10);
    if (washes) setRecentWashes(washes as RecentWash[]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Fetch today's wash stats
    const { data: todayCodes } = await supabase.from('wash_codes').select('price, used').gte('created_at', todayStart.toISOString());

    // Fetch currently active wash packages count
    const { count: activePkgs } = await supabase
      .from('wash_packages')
      .select('*', { count: 'exact', head: true })
      .eq('active', true)
      .gt('end_date', new Date().toISOString());

    if (todayCodes) {
      setTodayStats({
        total: todayCodes.length,
        revenue: todayCodes.reduce((sum, c) => sum + Number(c.price), 0),
        throughput: todayCodes.filter(c => c.used).length,
        activePackages: activePkgs || 0
      });
    }
  };

  // ESP32 handles resetting bays to idle after firing the relay

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('ops-monitor').on('postgres_changes', { event: '*', schema: 'public', table: 'wash_bay_status' }, () => fetchData()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-primary/30">
      {/* Top Professional Navbar */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-600/20">
              <Zap className="text-white w-6 h-6 fill-current" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter uppercase leading-none">Operations Command</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Network Live • Real-time Sync</span>
              </div>
            </div>
          </div>
          <Link to="/" className="text-[10px] font-black px-6 py-2.5 rounded-full border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-all tracking-widest text-orange-500">
            CONTROL PANEL
          </Link>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-10 space-y-12">
        {/* Global Key Metrics */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Active Packages', value: todayStats.activePackages, icon: Package, color: 'text-orange-500' },
            { label: 'Daily Throughput', value: todayStats.throughput, icon: ShieldCheck, color: 'text-emerald-400' },
            { label: 'Network Nodes', value: '3 / 3', icon: MapPin, color: 'text-purple-400' },
            { label: 'Cash Revenue', value: `R${todayStats.revenue.toFixed(0)}`, icon: DollarSign, color: 'text-amber-400' }
          ].map((stat, i) => (
            <div key={i} className="bg-zinc-900/30 border border-zinc-800 p-6 rounded-2xl flex items-center gap-5 shadow-xl shadow-black/20">
              <div className={`p-4 rounded-xl bg-zinc-950 border border-zinc-800 ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">{stat.label}</p>
                <p className="text-3xl font-black font-mono mt-1 tracking-tighter italic">{stat.value}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Site Nodes Grid */}
        <section className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500 flex items-center gap-2">
              <Activity className="w-4 h-4 text-orange-500" /> Site Deployment Live Status
            </h2>
            <span className="text-[10px] font-bold text-zinc-600 bg-zinc-900/50 px-3 py-1 rounded-full border border-zinc-800">GLOBAL INTEL</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((id) => {
              const bay = bays.find(b => b.id === id);
              const theme = statusThemes[bay?.status || 'idle'];

              return (
                <motion.div
                  key={id}
                  layout
                  className={`relative rounded-[2.5rem] border-2 transition-all duration-700 p-10 space-y-8 ${theme.glow} ${theme.bg}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h3 className="font-black text-3xl tracking-tighter uppercase italic">{siteNames[id]}</h3>
                      <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Hardware Terminal 00{id}</p>
                    </div>
                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter border ${theme.text} border-current/20 bg-black/20 shadow-inner`}>
                      {theme.label}
                    </div>
                  </div>

                  <div className="min-h-[160px] flex flex-col justify-center">
                    <AnimatePresence mode="wait">
                      {bay?.status === 'washing' ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="space-y-6"
                        >
                          <div className="flex items-center gap-5">
                            <div className="h-16 w-16 rounded-[1.5rem] bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-500 animate-pulse shadow-lg shadow-orange-500/10">
                              <Droplets className="w-10 h-10" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-orange-500/60 uppercase tracking-widest italic">Live Process</p>
                              <p className="font-black text-3xl uppercase tracking-tighter text-white italic">{bay.current_wash_type} Wash</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/5">
                            <div>
                              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Active ID</p>
                              <p className="font-mono text-sm font-black text-zinc-300">{bay.current_code}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Status</p>
                              <p className="font-black text-sm text-emerald-500 uppercase">RUNNING</p>
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="text-center space-y-4 opacity-10">
                          <ShieldCheck className="w-14 h-14 mx-auto text-zinc-500" />
                          <p className="text-[10px] font-black uppercase tracking-[0.4em]">Node Standby</p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Console Log Feed */}
        <section className="bg-zinc-950 border-2 border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
          <div className="bg-zinc-900/50 px-8 py-5 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.6)]" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Tactical Feed</h2>
            </div>
            <span className="text-[9px] font-mono text-zinc-600 font-bold uppercase tracking-widest">Cloud Encrypted stream</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-900">
                {recentWashes.map(w => (
                  <tr key={w.id} className="hover:bg-orange-500/5 transition-colors group">
                    <td className="px-8 py-5 font-mono text-[11px] text-zinc-500">
                      {format(new Date(w.created_at), 'HH:mm:ss')}
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-[10px] font-black text-orange-500 uppercase tracking-tighter">Event::Node_Auth_Success</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="font-black text-zinc-200 uppercase tracking-tight italic">{w.wash_type} Program</span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <span className="font-mono text-xs font-black text-zinc-700">HASH_{w.code}</span>
                    </td>
                  </tr>
                ))}
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

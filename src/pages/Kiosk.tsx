import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Droplets, CheckCircle, AlertTriangle, Loader2, Camera, CameraOff, QrCode, Car, XCircle, Keyboard, Delete } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5Qrcode } from 'html5-qrcode';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import Footer from '@/components/Footer';
import PlateScanner from '@/components/PlateScanner';

type BayStatus = 'idle' | 'washing' | 'complete' | 'error';
type KioskMode = 'code' | 'keypad' | 'plate';

interface BayState {
  status: BayStatus;
  current_wash_type: string | null;
  current_wash_name?: string | null;
  current_code: string | null;
  started_at: string | null;
}

const statusConfig: Record<BayStatus, { icon: React.ReactNode; title: string; subtitle: string; bg: string; pulse: boolean }> = {
  idle: { icon: <Droplets className="w-24 h-24" />, title: 'READY', subtitle: 'Choose your scan method below', bg: 'from-primary/20 to-background', pulse: true },
  washing: { icon: <Loader2 className="w-24 h-24 animate-spin" />, title: 'WASHING IN PROGRESS', subtitle: 'Please wait while your vehicle is being washed', bg: 'from-blue-500/20 to-background', pulse: false },
  complete: { icon: <CheckCircle className="w-24 h-24" />, title: 'WASH COMPLETE', subtitle: 'Thank you! Your vehicle is ready', bg: 'from-green-500/20 to-background', pulse: false },
  error: { icon: <AlertTriangle className="w-24 h-24" />, title: 'ERROR', subtitle: 'Please see an attendant for assistance', bg: 'from-destructive/20 to-background', pulse: false },
};

const Kiosk = () => {
  const [searchParams] = useSearchParams();
  const [businessName, setBusinessName] = useState('GES CODE CONTROLLER');

  const [dbSiteName, setDbSiteName] = useState<string | null>(null);
  const [kioskLogo, setKioskLogo] = useState('');
  const [siteMissing, setSiteMissing] = useState(false);

  const siteConfig = useMemo(() => {
    const rawId = searchParams.get('site_id') || searchParams.get('siteId') || searchParams.get('id');
    const rawName = searchParams.get('site') || searchParams.get('Site');

    if (!rawId) return null;

    const idNum = parseInt(rawId);
    let name = rawName?.toUpperCase();

    if (!name) name = `BAY ${idNum}`;

    return { id: idNum, name: dbSiteName ? dbSiteName.toUpperCase() : name };
  }, [searchParams, dbSiteName]);

  // Look up the site that owns this kiosk bay number
  const bayParam = searchParams.get('site_id') || searchParams.get('siteId') || searchParams.get('id');
  useEffect(() => {
    const n = parseInt(bayParam || '');
    if (!n) return;
    (supabase as any).from('sites').select('name, busy_input_enabled, logo_url').eq('bay_id', n).maybeSingle()
      .then(({ data }: any) => {
        if (data?.name) { setDbSiteName(data.name); setSiteMissing(false); setBusyInputEnabled(!!data.busy_input_enabled); setKioskLogo(data.logo_url || ''); }
        else setSiteMissing(true);
      });
  }, [bayParam]);

  // Busy lock: machine still running from the previous car
  const [lock, setLock] = useState<{ busy: boolean; busyAt: number; until: number; startedAt: number }>({ busy: false, busyAt: 0, until: 0, startedAt: 0 });
  const [busyInputEnabled, setBusyInputEnabled] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 1000); return () => clearInterval(t); }, []);
  const lockFromRow = (d: any) => setLock({
    busy: !!d.machine_busy,
    busyAt: d.busy_updated_at ? Date.parse(d.busy_updated_at) : 0,
    until: d.locked_until ? Date.parse(d.locked_until) : 0,
    startedAt: d.last_started_at ? Date.parse(d.last_started_at) : 0,
  });
  const busySignalLive = busyInputEnabled && lock.busyAt > 0 && nowMs - lock.busyAt < 60_000;
  const inGrace = lock.startedAt > 0 && nowMs - lock.startedAt < 30_000;
  const bayLocked = inGrace || (busySignalLive ? lock.busy : lock.until > nowMs);
  const waitSeconds = inGrace ? Math.ceil((30_000 - (nowMs - lock.startedAt)) / 1000)
    : !busySignalLive && lock.until > nowMs ? Math.ceil((lock.until - nowMs) / 1000) : null;

  const [bayState, setBayState] = useState<BayState>({
    status: 'idle',
    current_wash_type: null,
    current_code: null,
    started_at: null,
  });
  const [mode, setMode] = useState<KioskMode>('code');
  const [typedCode, setTypedCode] = useState('');
  const [packageInfo, setPackageInfo] = useState<{ vehicle_reg?: string; days_remaining?: number } | null>(null);

  useEffect(() => {
    supabase.from('business_settings').select('key, value').then(({ data }) => {
      if (data) {
        data.forEach((row: any) => {
          if (row.key === 'business_name') setBusinessName(row.value);
        });
      }
    });
  }, []);

  const [scanning, setScanning] = useState(false);
  const [validating, setValidating] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'qr-scanner';

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const validateCode = useCallback(async (code: string) => {
    if (!siteConfig) return;
    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-code', {
        body: {
          code,
          site_id: siteConfig.id,
          site_name: siteConfig.name
        },
      });

      if (error || !data?.valid) {
        toast.error(data?.error || 'Invalid code');
      } else {
        toast.success(`Wash started for ${siteConfig.name}`);
        stopScanner();
      }
    } catch (err) {
      toast.error('Failed to validate code');
    } finally {
      setValidating(false);
    }
  }, [siteConfig, stopScanner]);

  const pressKey = (digit: string) => {
    if (validating) return;
    setTypedCode(prev => (prev.length < 6 ? prev + digit : prev));
  };

  const submitTypedCode = async () => {
    if (typedCode.length !== 6 || validating) return;
    await validateCode(typedCode);
    setTypedCode('');
  };

  const validatePlate = useCallback(async (plate: string) => {
    if (!siteConfig) return;
    setValidating(true);
    setPackageInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke('validate-plate', {
        body: {
          plate,
          site_name: siteConfig.name,
          site_id: siteConfig.id
        },
      });

      if (error || !data?.valid) {
        toast.error(data?.error || 'No active package found');
      } else {
        toast.success(`Wash started for ${siteConfig.name}`);
        setPackageInfo({ vehicle_reg: data.vehicle_reg, days_remaining: data.days_remaining });
      }
    } catch (err) {
      toast.error('Failed to validate plate');
    } finally {
      setValidating(false);
    }
  }, [siteConfig]);

  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;
    try {
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (decodedText) => { validateCode(decodedText); },
        () => {}
      );
      setScanning(true);
    } catch (err) {
      scannerRef.current = null;
    }
  }, [validateCode]);

  // INCREASED TO 10 SECONDS TO GIVE ESP32 TIME TO POLL
  useEffect(() => {
    if (bayState.status === 'washing' && siteConfig) {
      const timer = setTimeout(async () => {
        // Preferred: secured RPC that can only reset the bay to idle.
        // Fallback: direct update, for databases where the security migration
        // hasn't been applied yet (keeps the kiosk working either way).
        const { error: rpcError } = await supabase.rpc('reset_bay_idle', { p_bay_id: siteConfig.id });
        if (rpcError) {
          await supabase.from('wash_bay_status').update({
            status: 'idle', current_wash_type: null, current_code: null, started_at: null, updated_at: new Date().toISOString(),
          }).eq('id', siteConfig.id);
        }
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [bayState.status, siteConfig]);

  useEffect(() => {
    if (!siteConfig) return;
    if (bayState.status === 'idle' && !bayLocked && mode === 'code' && !scanning && !validating) {
      startScanner();
    }
    if ((bayState.status !== 'idle' || bayLocked || mode !== 'code') && scanning) {
      stopScanner();
    }
  }, [bayState.status, bayLocked, mode, scanning, validating, startScanner, stopScanner, siteConfig]);

  useEffect(() => {
    if (!siteConfig) return;
    const fetchStatus = async () => {
      const { data } = await supabase.from('wash_bay_status').select('*').eq('id', siteConfig.id).maybeSingle();
      if (data) {
        lockFromRow(data);
        setBayState({
          status: data.status as BayStatus,
          current_wash_type: data.current_wash_type,
          current_wash_name: (data as any).current_wash_name,
          current_code: data.current_code,
          started_at: data.started_at,
        });
      }
    };
    fetchStatus();

    const channel = supabase.channel(`status-${siteConfig.id}`).on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'wash_bay_status', filter: `id=eq.${siteConfig.id}` },
      (payload) => {
        const d = payload.new;
        lockFromRow(d);
        setBayState({
          status: d.status as BayStatus,
          current_wash_type: d.current_wash_type,
          current_wash_name: d.current_wash_name,
          current_code: d.current_code,
          started_at: d.started_at,
        });
        setPackageInfo(null);
      }
    ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [siteConfig]);

  if (!siteConfig) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <XCircle className="w-20 h-20 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2 uppercase italic">Kiosk Setup Required</h1>
        <p className="text-muted-foreground mb-6 max-w-sm">This tablet is missing its Site ID configuration in the URL.</p>
        <div className="p-6 bg-muted rounded-2xl font-mono text-xs text-left border-2 border-border shadow-inner">
          <p className="font-black text-primary mb-2 tracking-widest uppercase">Required link parameters:</p>
          /kiosk?site_id=BAY_NUMBER<br/>
          <span className="text-muted-foreground">Find each site's kiosk link on the Sites page.</span>
        </div>
      </div>
    );
  }

  const currentConfig = statusConfig[bayState.status];
  const washLabel = (bayState as any).current_wash_name
    ? (bayState as any).current_wash_name
    : bayState.current_wash_type
    ? bayState.current_wash_type.charAt(0).toUpperCase() + bayState.current_wash_type.slice(1) + ' Wash'
    : null;

  return (
    <div className={`min-h-screen bg-gradient-to-b ${currentConfig.bg} flex flex-col items-center justify-center p-8 select-none`}>
      <div className="text-center space-y-6 max-w-2xl w-full">
        {kioskLogo && <img src={kioskLogo} alt="" className="h-20 max-w-[60%] mx-auto object-contain" />}
        <h1 className="text-3xl font-bold text-primary tracking-wider uppercase">{dbSiteName || businessName}</h1>
        {siteMissing && (
          <p className="text-sm font-bold text-destructive">No site uses bay {siteConfig.id}. Check this kiosk link on the Sites page.</p>
        )}

        <div className="flex justify-center gap-2 -mt-4">
          {!dbSiteName && (
            <span className="px-4 py-1.5 bg-card text-foreground text-sm font-bold rounded-full border border-border shadow-sm uppercase">
              {siteConfig.name}
            </span>
          )}
          <span className={`px-4 py-1.5 text-white text-sm font-black rounded-full shadow-md ${siteConfig.id === 1 ? 'bg-blue-600' : siteConfig.id === 2 ? 'bg-orange-600' : 'bg-purple-600'}`}>
            BAY {siteConfig.id}
          </span>
        </div>

        {bayState.status !== 'idle' && (
          <AnimatePresence mode="wait">
            <motion.div key={bayState.status} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.4 }} className={`text-primary mx-auto ${currentConfig.pulse ? 'animate-pulse' : ''}`}>
              {currentConfig.icon}
            </motion.div>
          </AnimatePresence>
        )}

        <motion.h2 key={currentConfig.title} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-4xl md:text-5xl font-extrabold text-foreground tracking-tight uppercase">
          {currentConfig.title}
        </motion.h2>

        {bayState.status === 'idle' && bayLocked && (
          <div className="w-full max-w-md mx-auto p-6 rounded-3xl border-2 border-amber-500/50 bg-amber-500/10 space-y-2">
            <p className="text-2xl font-black uppercase text-amber-600">Machine busy</p>
            <p className="text-sm font-semibold text-foreground">Please wait for the car in front to finish.</p>
            {waitSeconds !== null && waitSeconds > 0 && (
              <p className="text-4xl font-black font-mono text-foreground">
                {Math.floor(waitSeconds / 60)}:{String(waitSeconds % 60).padStart(2, '0')}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Keep your code. It will work as soon as the bay is ready.</p>
          </div>
        )}

        {bayState.status === 'idle' && !bayLocked && (
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => setMode('code')} className={`flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all border-2 ${mode === 'code' ? 'bg-primary text-primary-foreground border-primary shadow-xl scale-105' : 'bg-secondary text-muted-foreground border-transparent'}`}>
              <QrCode className="w-5 h-5" /> SCAN CODE
            </button>
            <button onClick={() => { setTypedCode(''); setMode('keypad'); }} className={`flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all border-2 ${mode === 'keypad' ? 'bg-primary text-primary-foreground border-primary shadow-xl scale-105' : 'bg-secondary text-muted-foreground border-transparent'}`}>
              <Keyboard className="w-5 h-5" /> ENTER CODE
            </button>
            <button onClick={() => setMode('plate')} className={`flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all border-2 ${mode === 'plate' ? 'bg-primary text-primary-foreground border-primary shadow-xl scale-105' : 'bg-secondary text-muted-foreground border-transparent'}`}>
              <Car className="w-5 h-5" /> SCAN PLATE
            </button>
          </div>
        )}

        {bayState.status === 'idle' && !bayLocked && mode === 'code' && (
          <div className="relative w-72 h-72 md:w-80 md:h-80 mx-auto rounded-3xl overflow-hidden border-4 border-primary bg-black shadow-2xl">
            <div id={scannerContainerId} className="w-full h-full" />
            {validating && <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>}
          </div>
        )}

        {bayState.status === 'idle' && !bayLocked && mode === 'keypad' && (
          <div className="w-full max-w-xs mx-auto space-y-4">
            <div className="flex justify-center gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`w-11 h-14 rounded-xl border-2 flex items-center justify-center text-3xl font-black ${typedCode[i] ? 'border-primary bg-card text-foreground' : 'border-border bg-muted/40'}`}>
                  {typedCode[i] || ''}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <button key={d} type="button" onClick={() => pressKey(d)} disabled={validating}
                  className="h-16 rounded-2xl bg-card border-2 border-border text-2xl font-bold text-foreground active:scale-95 transition-transform disabled:opacity-50">
                  {d}
                </button>
              ))}
              <button type="button" onClick={() => setTypedCode(prev => prev.slice(0, -1))} disabled={validating || !typedCode}
                aria-label="Delete digit"
                className="h-16 rounded-2xl bg-secondary border-2 border-transparent flex items-center justify-center text-muted-foreground active:scale-95 transition-transform disabled:opacity-40">
                <Delete className="w-7 h-7" />
              </button>
              <button type="button" onClick={() => pressKey('0')} disabled={validating}
                className="h-16 rounded-2xl bg-card border-2 border-border text-2xl font-bold text-foreground active:scale-95 transition-transform disabled:opacity-50">
                0
              </button>
              <button type="button" onClick={submitTypedCode} disabled={validating || typedCode.length !== 6}
                className="h-16 rounded-2xl bg-primary text-primary-foreground text-lg font-black active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center">
                {validating ? <Loader2 className="w-6 h-6 animate-spin" /> : 'GO'}
              </button>
            </div>
            <p className="text-sm text-muted-foreground">Type the 6-digit number printed under your QR code</p>
          </div>
        )}

        {bayState.status === 'idle' && !bayLocked && mode === 'plate' && (
          <PlateScanner onPlateDetected={validatePlate} disabled={validating} />
        )}

        {packageInfo && bayState.status === 'washing' && (
          <div className="inline-block px-8 py-3 rounded-full bg-primary/20 border-2 border-primary/40 text-primary text-xl font-bold shadow-lg">
            {packageInfo.vehicle_reg} • {packageInfo.days_remaining} days left
          </div>
        )}

        {washLabel && bayState.status === 'washing' && !packageInfo && (
          <div className="inline-block px-8 py-3 rounded-full bg-primary/20 border-2 border-primary/40 text-primary text-xl font-black shadow-lg">
            {washLabel}
          </div>
        )}

        <p className="text-xl text-muted-foreground font-medium">{currentConfig.subtitle}</p>
      </div>
      <Footer />
    </div>
  );
};

export default Kiosk;

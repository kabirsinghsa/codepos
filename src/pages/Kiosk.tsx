import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Droplets, CheckCircle, AlertTriangle, Loader2, Camera, CameraOff, QrCode, Car, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5Qrcode } from 'html5-qrcode';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import Footer from '@/components/Footer';
import PlateScanner from '@/components/PlateScanner';

type BayStatus = 'idle' | 'washing' | 'complete' | 'error';
type KioskMode = 'code' | 'plate';

interface BayState {
  status: BayStatus;
  current_wash_type: string | null;
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
  const [businessName, setBusinessName] = useState('BULLDOG CARWASH');

  const siteConfig = useMemo(() => {
    const rawId = searchParams.get('site_id') || searchParams.get('siteId') || searchParams.get('id');
    const rawName = searchParams.get('site') || searchParams.get('Site');

    if (!rawId) return null;

    const idNum = parseInt(rawId);
    let name = rawName?.toUpperCase();

    if (!name) {
      if (idNum === 1) name = 'HEAD OFFICE';
      else if (idNum === 2) name = 'HUDDLE';
      else if (idNum === 3) name = 'BOKSBURG';
      else name = 'UNKNOWN SITE';
    }

    return { id: idNum, name };
  }, [searchParams]);

  const [bayState, setBayState] = useState<BayState>({
    status: 'idle',
    current_wash_type: null,
    current_code: null,
    started_at: null,
  });
  const [mode, setMode] = useState<KioskMode>('code');
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
        await supabase.from('wash_bay_status').update({
          status: 'idle', current_wash_type: null, current_code: null, started_at: null, updated_at: new Date().toISOString(),
        }).eq('id', siteConfig.id);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [bayState.status, siteConfig]);

  useEffect(() => {
    if (!siteConfig) return;
    if (bayState.status === 'idle' && mode === 'code' && !scanning && !validating) {
      startScanner();
    }
    if ((bayState.status !== 'idle' || mode !== 'code') && scanning) {
      stopScanner();
    }
  }, [bayState.status, mode, scanning, validating, startScanner, stopScanner, siteConfig]);

  useEffect(() => {
    if (!siteConfig) return;
    const fetchStatus = async () => {
      const { data } = await supabase.from('wash_bay_status').select('*').eq('id', siteConfig.id).maybeSingle();
      if (data) {
        setBayState({
          status: data.status as BayStatus,
          current_wash_type: data.current_wash_type,
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
        setBayState({
          status: d.status as BayStatus,
          current_wash_type: d.current_wash_type,
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
          <strong>Huddle:</strong> /kiosk?site=Huddle&site_id=2<br/>
          <strong>Boksburg:</strong> /kiosk?site=Boksburg&site_id=3
        </div>
      </div>
    );
  }

  const currentConfig = statusConfig[bayState.status];
  const washLabel = bayState.current_wash_type
    ? bayState.current_wash_type.charAt(0).toUpperCase() + bayState.current_wash_type.slice(1) + ' Wash'
    : null;

  return (
    <div className={`min-h-screen bg-gradient-to-b ${currentConfig.bg} flex flex-col items-center justify-center p-8 select-none`}>
      <div className="text-center space-y-6 max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-primary tracking-wider uppercase">{businessName}</h1>

        <div className="flex justify-center gap-2 -mt-4">
          <span className="px-4 py-1.5 bg-card text-foreground text-sm font-bold rounded-full border border-border shadow-sm uppercase">
            {siteConfig.name}
          </span>
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

        {bayState.status === 'idle' && (
          <div className="flex justify-center gap-3">
            <button onClick={() => setMode('code')} className={`flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all border-2 ${mode === 'code' ? 'bg-primary text-primary-foreground border-primary shadow-xl scale-105' : 'bg-secondary text-muted-foreground border-transparent'}`}>
              <QrCode className="w-5 h-5" /> SCAN CODE
            </button>
            <button onClick={() => setMode('plate')} className={`flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold transition-all border-2 ${mode === 'plate' ? 'bg-primary text-primary-foreground border-primary shadow-xl scale-105' : 'bg-secondary text-muted-foreground border-transparent'}`}>
              <Car className="w-5 h-5" /> SCAN PLATE
            </button>
          </div>
        )}

        {bayState.status === 'idle' && mode === 'code' && (
          <div className="relative w-72 h-72 md:w-80 md:h-80 mx-auto rounded-3xl overflow-hidden border-4 border-primary bg-black shadow-2xl">
            <div id={scannerContainerId} className="w-full h-full" />
            {validating && <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>}
          </div>
        )}

        {bayState.status === 'idle' && mode === 'plate' && (
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

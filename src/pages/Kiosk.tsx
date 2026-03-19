import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Droplets, CheckCircle, AlertTriangle, Loader2, Camera, CameraOff, QrCode, Car } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5Qrcode } from 'html5-qrcode';
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
  idle: {
    icon: <Droplets className="w-24 h-24" />,
    title: 'READY',
    subtitle: 'Choose your scan method below',
    bg: 'from-primary/20 to-background',
    pulse: true,
  },
  washing: {
    icon: <Loader2 className="w-24 h-24 animate-spin" />,
    title: 'WASHING IN PROGRESS',
    subtitle: 'Please wait while your vehicle is being washed',
    bg: 'from-blue-500/20 to-background',
    pulse: false,
  },
  complete: {
    icon: <CheckCircle className="w-24 h-24" />,
    title: 'WASH COMPLETE',
    subtitle: 'Thank you! Your vehicle is ready',
    bg: 'from-green-500/20 to-background',
    pulse: false,
  },
  error: {
    icon: <AlertTriangle className="w-24 h-24" />,
    title: 'ERROR',
    subtitle: 'Please see an attendant for assistance',
    bg: 'from-destructive/20 to-background',
    pulse: false,
  },
};

const Kiosk = () => {
  const [businessName, setBusinessName] = useState('BULLDOG CARWASH');
  const [siteName, setSiteName] = useState('');
  const [packagesEnabled, setPackagesEnabled] = useState(false);
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
          if (row.key === 'packages_enabled') setPackagesEnabled(row.value === 'true');
        });
      }
    });
  }, []);

  const [scanning, setScanning] = useState(false);
  const [validating, setValidating] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'qr-scanner';
  const lastScannedRef = useRef<string | null>(null);

  const validateCode = useCallback(async (code: string) => {
    const match = code.match(/\d{6}/);
    const cleanCode = match ? match[0] : code;

    if (lastScannedRef.current === cleanCode) return;
    lastScannedRef.current = cleanCode;

    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-code', {
        body: { code: cleanCode },
      });

      if (error || !data?.valid) {
        toast.error(data?.error || 'Invalid code');
        setTimeout(() => { lastScannedRef.current = null; }, 3000);
      } else {
        toast.success(`${data.wash_type} wash started!`);
        stopScanner();
      }
    } catch (err) {
      toast.error('Failed to validate code');
      setTimeout(() => { lastScannedRef.current = null; }, 3000);
    } finally {
      setValidating(false);
    }
  }, []);

  const validatePlate = useCallback(async (plate: string) => {
    setValidating(true);
    setPackageInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke('validate-plate', {
        body: { plate },
      });

      if (error || !data?.valid) {
        toast.error(data?.error || 'No active package for this vehicle');
      } else {
        toast.success(`${data.wash_type} wash started for ${data.vehicle_reg}!`);
        setPackageInfo({ vehicle_reg: data.vehicle_reg, days_remaining: data.days_remaining });
      }
    } catch (err) {
      toast.error('Failed to validate plate');
    } finally {
      setValidating(false);
    }
  }, []);

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
      toast.error('Could not access camera. Please grant camera permission.');
      scannerRef.current = null;
    }
  }, [validateCode]);

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

  // Auto-reset after washing
  useEffect(() => {
    if (bayState.status === 'washing') {
      const timer = setTimeout(async () => {
        await supabase.from('wash_bay_status').update({
          status: 'idle', current_wash_type: null, current_code: null, started_at: null, updated_at: new Date().toISOString(),
        }).eq('id', 1);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [bayState.status]);

  // Auto-start scanner when idle in code mode
  useEffect(() => {
    if (bayState.status === 'idle' && mode === 'code' && !scanning && !validating) {
      startScanner();
    }
    if ((bayState.status !== 'idle' || mode !== 'code') && scanning) {
      stopScanner();
    }
  }, [bayState.status, mode, scanning, validating, startScanner, stopScanner]);

  // Stop scanner when switching to plate mode
  useEffect(() => {
    if (mode === 'plate') {
      stopScanner();
    }
  }, [mode, stopScanner]);

  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  // Realtime subscription
  useEffect(() => {
    const fetchStatus = async () => {
      const { data } = await supabase.from('wash_bay_status').select('*').eq('id', 1).single();
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

    const channel = supabase.channel('wash-bay-status').on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'wash_bay_status' },
      (payload) => {
        const d = payload.new;
        setBayState({
          status: d.status as BayStatus,
          current_wash_type: d.current_wash_type,
          current_code: d.current_code,
          started_at: d.started_at,
        });
        lastScannedRef.current = null;
        setPackageInfo(null);
      }
    ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const config = statusConfig[bayState.status];
  const washLabel = bayState.current_wash_type
    ? bayState.current_wash_type.charAt(0).toUpperCase() + bayState.current_wash_type.slice(1) + ' Wash'
    : null;

  return (
    <div className={`min-h-screen bg-gradient-to-b ${config.bg} flex flex-col items-center justify-center p-8 select-none cursor-default`}>
      <div className="text-center space-y-6 max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-primary tracking-wider">{businessName}</h1>

        {/* Status Icon (hidden during idle to show scanners) */}
        {bayState.status !== 'idle' && (
          <AnimatePresence mode="wait">
            <motion.div
              key={bayState.status}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.4 }}
              className={`text-primary mx-auto ${config.pulse ? 'animate-pulse' : ''}`}
            >
              {config.icon}
            </motion.div>
          </AnimatePresence>
        )}

        <motion.h2
          key={config.title}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-4xl md:text-5xl font-bold text-foreground tracking-wide"
        >
          {config.title}
        </motion.h2>

        {/* Mode Switcher (visible when idle) */}
        {bayState.status === 'idle' && (
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setMode('code')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
                mode === 'code'
                  ? 'bg-primary text-primary-foreground shadow-lg'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              <QrCode className="w-5 h-5" />
              Scan QR Code
            </button>
            {packagesEnabled && (
              <button
                onClick={() => setMode('plate')}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
                  mode === 'plate'
                    ? 'bg-primary text-primary-foreground shadow-lg'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                <Car className="w-5 h-5" />
                Monthly Package
              </button>
            )}
          </div>
        )}

        {/* QR Code Scanner */}
        {bayState.status === 'idle' && mode === 'code' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="relative w-72 h-72 md:w-80 md:h-80 mx-auto rounded-2xl overflow-hidden border-4 border-primary/30 bg-black">
              <div id={scannerContainerId} className="w-full h-full" />
              {validating && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                </div>
              )}
            </div>
            {scanning ? (
              <div className="flex items-center gap-2 text-primary">
                <Camera className="w-5 h-5" />
                <span className="text-sm font-mono">Camera Active — Point at QR Code</span>
              </div>
            ) : (
              <button onClick={startScanner} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                <CameraOff className="w-4 h-4" />
                Enable Camera
              </button>
            )}
          </motion.div>
        )}

        {/* Plate Scanner */}
        {bayState.status === 'idle' && mode === 'plate' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <PlateScanner onPlateDetected={validatePlate} disabled={validating} />
            {validating && (
              <div className="mt-4 flex items-center justify-center gap-2 text-primary">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-mono">Checking package...</span>
              </div>
            )}
          </motion.div>
        )}

        {/* Package info */}
        {packageInfo && bayState.status === 'washing' && (
          <div className="inline-block px-6 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary text-lg font-semibold">
            {packageInfo.vehicle_reg} • {packageInfo.days_remaining} days remaining
          </div>
        )}

        {/* Wash type badge */}
        {washLabel && bayState.status === 'washing' && !packageInfo && (
          <div className="inline-block px-6 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary text-xl font-semibold">
            {washLabel}
          </div>
        )}

        <p className="text-xl text-muted-foreground">{config.subtitle}</p>
      </div>
      <Footer />
    </div>
  );
};

export default Kiosk;

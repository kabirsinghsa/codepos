import { useState, useRef, useCallback, useEffect } from 'react';
import { Car, Loader2, Camera, CameraOff, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface PlateScannerProps {
  onPlateDetected: (plate: string) => void;
  disabled?: boolean;
}

const PlateScanner = ({ onPlateDetected, disabled }: PlateScannerProps) => {
  const [plate, setPlate] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setScanning(false);
    setScanStatus('');
    processingRef.current = false;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCameraActive(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.play().catch(err => console.error("Play error:", err));
        }
      }, 100);
    } catch (err) {
      console.error('Camera access error:', err);
      toast.error('Could not access camera. Check permissions.');
    }
  }, []);

  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || processingRef.current || disabled || !cameraActive) return;

    const video = videoRef.current;
    if (video.readyState !== 4 || video.videoWidth === 0) return;

    processingRef.current = true;
    setScanning(true);
    setScanStatus('Sending to plate reader...');

    try {
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.85)
      );
      if (!blob) return;

      const formData = new FormData();
      formData.append('upload', blob, 'plate.jpg');

      // Call recognize-plate edge function
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/recognize-plate`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await resp.json();

      if (data.plate && data.plate.length >= 3 && data.score > 0.5) {
        const detectedPlate = data.plate.toUpperCase();
        setPlate(detectedPlate);
        toast.success(`Plate detected: ${detectedPlate} (${Math.round(data.score * 100)}% confidence)`);
        stopCamera();
        onPlateDetected(detectedPlate);
      } else {
        setScanStatus('No plate found — position plate in view');
      }
    } catch (err) {
      console.error('Plate recognition error:', err);
      setScanStatus('Recognition error — retrying...');
    } finally {
      processingRef.current = false;
      setScanning(false);
    }
  }, [disabled, cameraActive, onPlateDetected, stopCamera]);

  // Auto-scan every 3 seconds when camera is active
  useEffect(() => {
    if (cameraActive && !disabled) {
      intervalRef.current = setInterval(processFrame, 3000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [cameraActive, disabled, processFrame]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const handleSubmit = () => {
    const cleaned = plate.trim().toUpperCase();
    if (cleaned.length >= 3) {
      onPlateDetected(cleaned);
      setPlate('');
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm mx-auto">
      {cameraActive ? (
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden border-4 border-primary/30 bg-black shadow-2xl">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          {/* Plate guide overlay */}
          <div className="absolute inset-0 flex items-end justify-center pb-[15%] pointer-events-none">
            <div className="w-[70%] h-[25%] border-2 border-primary/60 rounded-lg bg-primary/5" />
          </div>
          {scanning && (
            <div className="absolute top-2 left-2 px-3 py-1 rounded-full bg-black/60 text-white text-xs font-bold flex items-center gap-1">
              <Search className="w-3 h-3 animate-pulse" /> {scanStatus || 'Reading...'}
            </div>
          )}
          <button
            onClick={stopCamera}
            className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <CameraOff className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <Button
          onClick={startCamera}
          disabled={disabled}
          className="w-full h-24 flex flex-col items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Camera className="w-8 h-8" />
          <span className="text-xs font-bold uppercase tracking-wider">Open Camera to Scan Plate</span>
        </Button>
      )}

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex items-center gap-2 text-muted-foreground text-xs w-full py-2">
        <div className="h-px flex-1 bg-border" />
        <span>OR ENTER MANUALLY</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Input
        value={plate}
        onChange={(e) => setPlate(e.target.value.toUpperCase())}
        placeholder="ABC 123 GP"
        className="font-mono text-2xl bg-secondary border-border uppercase text-center tracking-widest h-14 border-2"
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        disabled={disabled || scanning}
      />
      <Button
        onClick={handleSubmit}
        disabled={disabled || plate.trim().length < 3 || scanning}
        className="w-full h-14 text-lg font-bold"
        size="lg"
      >
        {scanning ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Car className="w-5 h-5 mr-2" />}
        {scanning ? 'SCANNING...' : 'START WASH'}
      </Button>
    </div>
  );
};

export default PlateScanner;

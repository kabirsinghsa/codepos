import { useState, useRef, useCallback, useEffect } from 'react';
import { Car, Loader2, Camera, CameraOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PlateScannerProps {
  onPlateDetected: (plate: string) => void;
  disabled?: boolean;
}

const PlateScanner = ({ onPlateDetected, disabled }: PlateScannerProps) => {
  const [plate, setPlate] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      // 1. Set camera as active first so the video element is rendered
      setCameraActive(true);

      // 2. Request the stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      // We'll use a useEffect to attach the stream once the video element is confirmed to exist
    } catch (err) {
      console.error('Camera access error:', err);
      setCameraActive(false);
      toast.error('Could not access camera. Please grant permission.');
    }
  }, []);

  // Effect to attach the stream to the video element once it's rendered
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(err => {
        console.error("Video play error:", err);
      });
    }
  }, [cameraActive]);

  const captureAndRecognize = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || scanning || disabled) return;

    const video = videoRef.current;
    // Check if video is actually playing and has dimensions
    if (video.readyState !== 4 || video.videoWidth === 0) return;

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    setScanning(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.8)
      );
      if (!blob) return;

      const formData = new FormData();
      formData.append('upload', blob, 'plate.jpg');

      const { data, error } = await supabase.functions.invoke('recognize-plate', {
        body: formData,
      });

      if (error) throw error;

      if (data.plate && data.score > 0.6) {
        setPlate(data.plate);
        toast.success(`Plate detected: ${data.plate}`);
        stopCamera();
        onPlateDetected(data.plate);
      }
    } catch (err) {
      console.error('Plate recognition error:', err);
    } finally {
      setScanning(false);
    }
  }, [scanning, disabled, onPlateDetected, stopCamera]);

  // Auto-capture every 3 seconds while camera is active
  useEffect(() => {
    if (cameraActive && !disabled) {
      intervalRef.current = setInterval(captureAndRecognize, 3000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [cameraActive, disabled, captureAndRecognize]);

  // Cleanup on unmount
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
      {/* Camera viewfinder */}
      {cameraActive ? (
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden border-4 border-primary/30 bg-black">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          {scanning && (
            <div className="absolute inset-0 bg-background/40 flex items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          )}
          <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
            <span className="text-xs font-mono text-primary bg-background/70 px-2 py-1 rounded">
              {scanning ? 'Reading plate...' : 'Point at plate'}
            </span>
            <button
              onClick={stopCamera}
              className="p-2 rounded-full bg-destructive/80 text-destructive-foreground"
            >
              <CameraOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={startCamera}
          disabled={disabled}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
        >
          <Camera className="w-5 h-5" />
          Scan Plate with Camera
        </button>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {/* Manual fallback */}
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <div className="h-px flex-1 bg-border" />
        <span>or enter manually</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="flex items-center gap-2 text-primary mb-1">
        <Car className="w-5 h-5" />
        <span className="text-sm font-semibold tracking-wide">Vehicle Registration</span>
      </div>
      <Input
        value={plate}
        onChange={(e) => setPlate(e.target.value.toUpperCase())}
        placeholder="e.g. CA 123-456"
        className="font-mono text-2xl bg-secondary border-border uppercase text-center tracking-widest h-14"
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        disabled={disabled}
      />
      <Button
        onClick={handleSubmit}
        disabled={disabled || plate.trim().length < 3}
        className="w-full h-12 text-lg font-semibold"
        size="lg"
      >
        {disabled ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
        {disabled ? 'Checking...' : 'Start Wash'}
      </Button>
    </div>
  );
};

export default PlateScanner;

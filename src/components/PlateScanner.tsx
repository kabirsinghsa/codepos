import { useState, useRef, useCallback, useEffect } from 'react';
import { Car, Loader2, Camera, CameraOff, CameraIcon } from 'lucide-react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      toast.error('Live camera failed. Try the "Snap Photo" button.');
    }
  }, []);

  const processImage = async (blob: Blob) => {
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append('upload', blob, 'plate.jpg');

      const { data, error } = await supabase.functions.invoke('recognize-plate', {
        body: formData,
      });

      if (error) throw error;

      if (data.plate && data.score > 0.5) {
        setPlate(data.plate);
        toast.success(`Plate detected: ${data.plate}`);
        stopCamera();
        onPlateDetected(data.plate);
      } else {
        toast.error('Could not read plate clearly. Please try again or enter manually.');
      }
    } catch (err) {
      console.error('Plate recognition error:', err);
      toast.error('Recognition failed. Please try manual entry.');
    } finally {
      setScanning(false);
    }
  };

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || scanning || disabled || !cameraActive) return;

    const video = videoRef.current;
    if (video.readyState !== 4 || video.videoWidth === 0) return;

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8)
    );
    if (blob) processImage(blob);
  }, [scanning, disabled, onPlateDetected, stopCamera, cameraActive]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  };

  useEffect(() => {
    if (cameraActive && !disabled) {
      intervalRef.current = setInterval(captureFrame, 3000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [cameraActive, disabled, captureFrame]);

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
      {/* Hidden file input for native camera trigger */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
        ref={fileInputRef}
      />

      {cameraActive ? (
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden border-4 border-primary/30 bg-black shadow-2xl">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          {scanning && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-white" />
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
        <div className="grid grid-cols-2 gap-3 w-full">
          <Button
            onClick={startCamera}
            disabled={disabled}
            variant="outline"
            className="h-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 hover:bg-secondary transition-all"
          >
            <Camera className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Live Scan</span>
          </Button>

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="h-20 flex flex-col items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <CameraIcon className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Snap Photo</span>
          </Button>
        </div>
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

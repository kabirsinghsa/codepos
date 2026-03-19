import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, CameraOff, Loader2, Keyboard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface PlateScannerProps {
  onPlateDetected: (plate: string) => void;
  disabled?: boolean;
}

const PlateScanner = ({ onPlateDetected, disabled }: PlateScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualReg, setManualReg] = useState('');

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || processing || disabled) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || video.readyState < 2) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    setProcessing(true);
    try {
      // Dynamically import tesseract to avoid large initial bundle
      const { createWorker } = await import('tesseract.js');
      
      if (!workerRef.current) {
        const worker = await createWorker('eng');
        workerRef.current = worker;
      }

      const { data: { text } } = await workerRef.current.recognize(canvas);
      
      // Try to extract a South African-style registration plate
      // Patterns: XX 00 XX GP, XX 000-000, CA 123-456, etc.
      const cleaned = text.replace(/[^A-Z0-9\s\-]/gi, '').trim();
      const platePattern = /[A-Z]{2,3}\s?\d{2,3}[\s\-]?\d{0,3}\s?[A-Z]{0,2}\s?[A-Z]{0,2}/i;
      const match = cleaned.match(platePattern);
      
      if (match && match[0].replace(/\s/g, '').length >= 5) {
        const plate = match[0].toUpperCase().trim();
        stopCamera();
        onPlateDetected(plate);
      }
    } catch (err) {
      console.error('OCR error:', err);
    } finally {
      setProcessing(false);
    }
  }, [processing, disabled, onPlateDetected, stopCamera]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      // Process every 2 seconds
      intervalRef.current = window.setInterval(processFrame, 2000);
    } catch (err) {
      console.error('Camera error:', err);
      setManualMode(true);
    }
  }, [processFrame]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [stopCamera]);

  const handleManualSubmit = () => {
    if (manualReg.trim().length >= 3) {
      onPlateDetected(manualReg.trim().toUpperCase());
      setManualReg('');
    }
  };

  if (manualMode) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 w-full max-w-sm">
          <Input
            value={manualReg}
            onChange={(e) => setManualReg(e.target.value)}
            placeholder="Enter registration number"
            className="font-mono text-lg bg-secondary border-border uppercase text-center"
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            disabled={disabled}
          />
          <Button onClick={handleManualSubmit} disabled={disabled || !manualReg.trim()}>
            Go
          </Button>
        </div>
        <button
          onClick={() => { setManualMode(false); startCamera(); }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Camera className="w-4 h-4" />
          Try camera instead
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-72 h-48 md:w-96 md:h-64 mx-auto rounded-2xl overflow-hidden border-4 border-primary/30 bg-black">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />
        {processing && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-xs text-primary mt-2 font-mono">Reading plate...</p>
            </div>
          </div>
        )}
        {/* Plate guide overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-56 h-16 md:w-72 md:h-20 border-2 border-primary/50 rounded-lg" />
        </div>
      </div>

      {cameraActive ? (
        <div className="flex items-center gap-2 text-primary">
          <Camera className="w-5 h-5" />
          <span className="text-sm font-mono">Point camera at number plate</span>
        </div>
      ) : (
        <button
          onClick={startCamera}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          <CameraOff className="w-4 h-4" />
          Start Camera
        </button>
      )}

      <button
        onClick={() => { stopCamera(); setManualMode(true); }}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Keyboard className="w-4 h-4" />
        Enter plate manually
      </button>
    </div>
  );
};

export default PlateScanner;

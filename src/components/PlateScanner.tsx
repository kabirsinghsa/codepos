import { useState, useRef, useCallback, useEffect } from 'react';
import { Car, Loader2, Camera, CameraOff, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import Tesseract from 'tesseract.js';

interface PlateScannerProps {
  onPlateDetected: (plate: string) => void;
  disabled?: boolean;
}

// SA plate patterns: 2-3 letters, space, 3 digits, space, 2 letters (e.g. CA 123-456, ABC 123 GP)
const PLATE_PATTERNS = [
  /[A-Z]{2,3}\s?\d{3}\s?[A-Z]{2}/,      // ABC 123 GP
  /[A-Z]{2}\s?\d{3}[-\s]?\d{3}/,          // CA 123-456
  /[A-Z]{3}\s?\d{3}\s?[A-Z]{2,3}/,        // ABC 123 GP
  /[A-Z]{2,3}\d{3}[A-Z]{2,3}/,            // ABC123GP (no spaces)
  /[A-Z]{1,3}\s?\d{2,5}\s?[A-Z]{0,3}/,    // Broader catch
];

function extractPlate(text: string): string | null {
  // Clean up OCR text
  const cleaned = text
    .toUpperCase()
    .replace(/[^A-Z0-9\s\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  for (const pattern of PLATE_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match && match[0].replace(/\s/g, '').length >= 5) {
      return match[0].replace(/\s+/g, ' ').trim();
    }
  }

  // Fallback: look for any sequence with letters and digits that looks plate-like
  const words = cleaned.split(/\s+/);
  const combined = words.join('');
  if (/[A-Z]{2,3}\d{3}[A-Z]{0,3}/.test(combined)) {
    const m = combined.match(/[A-Z]{2,3}\d{3}[A-Z]{0,3}/);
    if (m) return m[0];
  }

  return null;
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
  const workerRef = useRef<Tesseract.Worker | null>(null);
  const processingRef = useRef(false);

  // Initialize Tesseract worker on mount
  useEffect(() => {
    let cancelled = false;
    const initWorker = async () => {
      try {
        const worker = await Tesseract.createWorker('eng', 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setScanStatus(`Scanning... ${Math.round((m.progress || 0) * 100)}%`);
            }
          },
        });
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -',
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        });
        if (!cancelled) {
          workerRef.current = worker;
        }
      } catch (err) {
        console.error('Tesseract init error:', err);
      }
    };
    initWorker();
    return () => {
      cancelled = true;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

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
    if (!videoRef.current || !canvasRef.current || processingRef.current || disabled || !cameraActive || !workerRef.current) return;

    const video = videoRef.current;
    if (video.readyState !== 4 || video.videoWidth === 0) return;

    processingRef.current = true;
    setScanning(true);

    try {
      const canvas = canvasRef.current;
      // Crop to center-bottom area where plates typically are
      const cropH = Math.floor(video.videoHeight * 0.35);
      const cropY = Math.floor(video.videoHeight * 0.5);
      canvas.width = video.videoWidth;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw cropped region
      ctx.drawImage(video, 0, cropY, video.videoWidth, cropH, 0, 0, video.videoWidth, cropH);

      // Increase contrast for better OCR
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const val = avg > 128 ? 255 : 0; // Threshold to black/white
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
      ctx.putImageData(imageData, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png', 1)
      );
      if (!blob || !workerRef.current) return;

      const { data: result } = await workerRef.current.recognize(blob);
      const detectedPlate = extractPlate(result.text);

      if (detectedPlate && detectedPlate.length >= 5) {
        setPlate(detectedPlate);
        toast.success(`Plate detected: ${detectedPlate}`);
        stopCamera();
        onPlateDetected(detectedPlate);
      } else {
        setScanStatus('Scanning... Position plate in view');
      }
    } catch (err) {
      console.error('OCR error:', err);
    } finally {
      processingRef.current = false;
      setScanning(false);
    }
  }, [disabled, cameraActive, onPlateDetected, stopCamera]);

  // Auto-scan every 2 seconds when camera is active
  useEffect(() => {
    if (cameraActive && !disabled) {
      intervalRef.current = setInterval(processFrame, 2000);
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

import { useState } from 'react';
import { Car, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface PlateScannerProps {
  onPlateDetected: (plate: string) => void;
  disabled?: boolean;
}

const PlateScanner = ({ onPlateDetected, disabled }: PlateScannerProps) => {
  const [plate, setPlate] = useState('');

  const handleSubmit = () => {
    const cleaned = plate.trim().toUpperCase();
    if (cleaned.length >= 3) {
      onPlateDetected(cleaned);
      setPlate('');
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm mx-auto">
      <div className="text-center text-muted-foreground text-sm px-4">
        <p className="font-semibold text-foreground mb-1">IP Camera Auto-Scan Active</p>
        <p>Plates are detected automatically. Use manual entry below as backup.</p>
      </div>

      <Input
        value={plate}
        onChange={(e) => setPlate(e.target.value.toUpperCase())}
        placeholder="ABC 123 GP"
        className="font-mono text-2xl bg-secondary border-border uppercase text-center tracking-widest h-14 border-2"
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        disabled={disabled}
      />
      <Button
        onClick={handleSubmit}
        disabled={disabled || plate.trim().length < 3}
        className="w-full h-14 text-lg font-bold"
        size="lg"
      >
        {disabled ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Car className="w-5 h-5 mr-2" />}
        {disabled ? 'CHECKING...' : 'START WASH'}
      </Button>
    </div>
  );
};

export default PlateScanner;

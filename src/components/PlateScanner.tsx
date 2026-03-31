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
      <div className="flex items-center gap-2 text-primary mb-1">
        <Car className="w-6 h-6" />
        <span className="text-sm font-semibold tracking-wide">Enter Vehicle Registration</span>
      </div>
      <Input
        value={plate}
        onChange={(e) => setPlate(e.target.value.toUpperCase())}
        placeholder="e.g. CA 123-456"
        className="font-mono text-2xl bg-secondary border-border uppercase text-center tracking-widest h-14"
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        disabled={disabled}
        autoFocus
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

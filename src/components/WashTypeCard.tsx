import { WashOption, WashType } from '@/lib/codeGenerator';
import { Droplets, SprayCan, Sparkles, Crown } from 'lucide-react';

const icons: Record<WashType, React.ReactNode> = {
  basic: <Droplets className="w-6 h-6" />,
  standard: <SprayCan className="w-6 h-6" />,
  premium: <Sparkles className="w-6 h-6" />,
  ultimate: <Crown className="w-6 h-6" />,
};

const colorClasses: Record<WashType, string> = {
  basic: 'border-wash-basic/30 hover:border-wash-basic/60 text-wash-basic',
  standard: 'border-wash-standard/30 hover:border-wash-standard/60 text-wash-standard',
  premium: 'border-wash-premium/30 hover:border-wash-premium/60 text-wash-premium',
  ultimate: 'border-wash-ultimate/30 hover:border-wash-ultimate/60 text-wash-ultimate',
};

const selectedClasses: Record<WashType, string> = {
  basic: 'border-wash-basic bg-wash-basic/10',
  standard: 'border-wash-standard bg-wash-standard/10',
  premium: 'border-wash-premium bg-wash-premium/10',
  ultimate: 'border-wash-ultimate bg-wash-ultimate/10',
};

interface WashTypeCardProps {
  option: WashOption;
  selected: boolean;
  onSelect: (type: WashType) => void;
}

export function WashTypeCard({ option, selected, onSelect }: WashTypeCardProps) {
  return (
    <button
      onClick={() => onSelect(option.id)}
      className={`relative p-4 rounded-lg border-2 transition-all duration-200 text-left w-full
        ${colorClasses[option.id]}
        ${selected ? selectedClasses[option.id] : 'bg-card'}
      `}
    >
      <div className="flex items-center gap-3 mb-2">
        {icons[option.id]}
        <span className="font-semibold text-foreground">{option.name}</span>
      </div>
      <p className="text-sm text-muted-foreground">{option.description}</p>
      <span className="text-xs text-muted-foreground font-mono mt-2 block">
        PLC Input #{option.plcInput}
      </span>
    </button>
  );
}

import { WashOption, WashType } from '@/lib/codeGenerator';
import { Droplets, SprayCan, Sparkles, Crown } from 'lucide-react';

const icons: Record<WashType, React.ReactNode> = {
  basic: <Droplets className="w-5 h-5" />,
  standard: <SprayCan className="w-5 h-5" />,
  premium: <Sparkles className="w-5 h-5" />,
  ultimate: <Crown className="w-5 h-5" />,
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
      className={`relative p-3.5 rounded-xl border transition-all duration-200 text-left w-full
        ${selected
          ? 'border-primary/60 bg-primary/10 shadow-md'
          : 'border-border bg-secondary hover:border-border hover:bg-secondary/80'
        }
      `}
    >
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className={selected ? 'text-primary' : 'text-muted-foreground'}>{icons[option.id]}</span>
        <span className="font-semibold text-sm text-foreground">{option.name}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{option.description}</p>
      <span className="text-[9px] text-muted-foreground/60 font-mono mt-1.5 block">
        PLC #{option.plcInput}
      </span>
    </button>
  );
}

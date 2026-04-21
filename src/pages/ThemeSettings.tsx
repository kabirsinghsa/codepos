import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, Save, RotateCcw, Upload, Loader2, Image as ImageIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme, hexToHslString, hslStringToHex, DEFAULT_THEME, ThemeTokens } from '@/hooks/useTheme';
import { supabase } from '@/integrations/supabase/client';

type ColorField = {
  key: keyof ThemeTokens;
  label: string;
  group: 'Surfaces' | 'Brand' | 'Text' | 'Borders' | 'States';
};

const COLOR_FIELDS: ColorField[] = [
  { key: 'background', label: 'Background', group: 'Surfaces' },
  { key: 'card', label: 'Card', group: 'Surfaces' },
  { key: 'secondary', label: 'Secondary surface', group: 'Surfaces' },
  { key: 'muted', label: 'Muted surface', group: 'Surfaces' },

  { key: 'primary', label: 'Primary', group: 'Brand' },
  { key: 'primary_foreground', label: 'Primary text', group: 'Brand' },
  { key: 'accent', label: 'Accent', group: 'Brand' },
  { key: 'accent_foreground', label: 'Accent text', group: 'Brand' },
  { key: 'ring', label: 'Focus ring', group: 'Brand' },

  { key: 'foreground', label: 'Body text', group: 'Text' },
  { key: 'card_foreground', label: 'Card text', group: 'Text' },
  { key: 'secondary_foreground', label: 'Secondary text', group: 'Text' },
  { key: 'muted_foreground', label: 'Muted text', group: 'Text' },

  { key: 'border', label: 'Border', group: 'Borders' },
  { key: 'input', label: 'Input border', group: 'Borders' },

  { key: 'destructive', label: 'Destructive', group: 'States' },
];

const PRESETS: { name: string; theme: Partial<ThemeTokens> }[] = [
  {
    name: 'Executive Charcoal & Gold',
    theme: { background: '30 6% 6%', card: '30 6% 9%', primary: '42 55% 58%', accent: '42 55% 58%', foreground: '40 15% 92%', border: '30 5% 16%', muted: '30 5% 13%', ring: '42 55% 58%', primary_foreground: '30 10% 8%', accent_foreground: '30 10% 8%' },
  },
  {
    name: 'Corporate Navy & Slate',
    theme: { background: '222 30% 8%', card: '222 25% 12%', primary: '212 90% 56%', accent: '212 90% 56%', foreground: '210 20% 92%', border: '222 20% 20%', muted: '222 20% 16%', ring: '212 90% 56%', primary_foreground: '0 0% 100%', accent_foreground: '0 0% 100%' },
  },
  {
    name: 'Clean Teal & Steel',
    theme: { background: '210 15% 10%', card: '210 15% 14%', primary: '180 60% 45%', accent: '180 60% 45%', foreground: '210 15% 92%', border: '210 12% 22%', muted: '210 12% 18%', ring: '180 60% 45%', primary_foreground: '0 0% 100%', accent_foreground: '0 0% 100%' },
  },
  {
    name: 'Light Pro',
    theme: { background: '0 0% 100%', card: '210 20% 98%', primary: '222 47% 31%', accent: '222 47% 31%', foreground: '222 47% 11%', card_foreground: '222 47% 11%', border: '214 20% 88%', muted: '210 16% 95%', muted_foreground: '215 16% 45%', secondary: '210 16% 95%', secondary_foreground: '222 47% 11%', input: '214 20% 88%', ring: '222 47% 31%', primary_foreground: '0 0% 100%', accent_foreground: '0 0% 100%' },
  },
];

export default function ThemeSettings() {
  const navigate = useNavigate();
  const { theme, setTheme, saveTheme, resetTheme } = useTheme();
  const [draft, setDraft] = useState<ThemeTokens>(theme);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (key: keyof ThemeTokens, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    setTheme(next); // live preview
  };

  const applyPreset = (preset: Partial<ThemeTokens>) => {
    const next = { ...draft, ...preset };
    setDraft(next);
    setTheme(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveTheme(draft);
      toast.success('Theme saved — applies to all users');
    } catch (e: any) {
      toast.error('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset theme to defaults?')) return;
    await resetTheme();
    setDraft(DEFAULT_THEME);
    toast.success('Theme reset');
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `bg-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('theme-assets').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('theme-assets').getPublicUrl(path);
      update('bg_image_url', data.publicUrl);
      toast.success('Background uploaded');
    } catch (e: any) {
      toast.error('Upload failed: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const grouped = COLOR_FIELDS.reduce<Record<string, ColorField[]>>((acc, f) => {
    (acc[f.group] = acc[f.group] || []).push(f);
    return acc;
  }, {});

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Theme Settings</h1>
              <p className="text-xs text-muted-foreground">Customise colors, surfaces & background</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Presets */}
        <Card className="p-5">
          <h2 className="font-semibold mb-3">Quick presets</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <Button key={p.name} variant="outline" className="h-auto py-3 flex flex-col items-start" onClick={() => applyPreset(p.theme)}>
                <span className="text-sm font-medium">{p.name}</span>
                <div className="flex gap-1 mt-2">
                  {[p.theme.background, p.theme.card, p.theme.primary, p.theme.accent].map((c, i) => (
                    <span key={i} className="w-4 h-4 rounded-full border border-border" style={{ background: `hsl(${c})` }} />
                  ))}
                </div>
              </Button>
            ))}
          </div>
        </Card>

        {/* Background image */}
        <Card className="p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Background image</h2>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 space-y-3">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                Upload image
              </Button>
              {draft.bg_image_url && (
                <Button variant="ghost" size="sm" onClick={() => update('bg_image_url', '')}>
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              )}
              <div>
                <Label className="text-xs">Or paste image URL</Label>
                <Input value={draft.bg_image_url} onChange={(e) => update('bg_image_url', e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label className="text-xs">Overlay darkness ({Math.round(parseFloat(draft.bg_overlay_opacity) * 100)}%)</Label>
                <Slider
                  value={[parseFloat(draft.bg_overlay_opacity) * 100]}
                  onValueChange={(v) => update('bg_overlay_opacity', (v[0] / 100).toFixed(2))}
                  min={0} max={100} step={1}
                />
              </div>
            </div>
            {draft.bg_image_url && (
              <div className="w-full md:w-48 h-32 rounded-lg border border-border bg-cover bg-center" style={{ backgroundImage: `url(${draft.bg_image_url})` }} />
            )}
          </div>
        </Card>

        {/* Color tokens */}
        {Object.entries(grouped).map(([group, fields]) => (
          <Card key={group} className="p-5">
            <h2 className="font-semibold mb-3">{group}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.map((f) => {
                const hex = hslStringToHex(draft[f.key] as string);
                return (
                  <div key={f.key} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/30">
                    <input
                      type="color"
                      value={hex}
                      onChange={(e) => update(f.key, hexToHslString(e.target.value))}
                      className="w-12 h-12 rounded cursor-pointer bg-transparent border border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{f.label}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">{hex}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

        {/* Radius */}
        <Card className="p-5">
          <h2 className="font-semibold mb-3">Corner radius</h2>
          <div className="flex items-center gap-4">
            <Slider
              value={[parseFloat(draft.radius)]}
              onValueChange={(v) => update('radius', `${v[0].toFixed(3)}rem`)}
              min={0} max={1.5} step={0.025}
              className="flex-1"
            />
            <span className="font-mono text-sm w-20 text-right">{draft.radius}</span>
          </div>
        </Card>

        <div className="flex justify-end gap-2 pb-10">
          <Button variant="outline" onClick={handleReset}>Reset</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save theme
          </Button>
        </div>
      </main>
    </div>
  );
}

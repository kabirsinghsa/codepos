export type WashType = 'basic' | 'standard' | 'premium' | 'ultimate';

export interface WashOption {
  id: WashType;
  name: string;
  description: string;
  plcInput: number; // Delta PLC input number
}

export interface WashCodeExtra {
  name: string;
  price: number;
}

export interface WashCode {
  id: string;
  code: string;
  washType: WashType;
  customerPhone: string;
  price: number;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
  usedAt?: Date;
  totalWashes: number;
  washesUsed: number;
  vehicleType?: string;
  selectedExtras?: WashCodeExtra[];
}

export const WASH_OPTIONS: WashOption[] = [
  { id: 'basic', name: 'Basic Wash', description: 'Exterior rinse & dry', plcInput: 1 },
  { id: 'standard', name: 'Standard Wash', description: 'Soap, rinse & dry', plcInput: 2 },
  { id: 'premium', name: 'Premium Wash', description: 'Full wash with wax', plcInput: 3 },
  { id: 'ultimate', name: 'Ultimate Wash', description: 'Complete detail wash', plcInput: 4 },
];

export const DEFAULT_PRICES: Record<WashType, number> = {
  basic: 90,
  standard: 10,
  premium: 40,
  ultimate: 20,
};

const washPrefix: Record<WashType, string> = {
  basic: '1',
  standard: '2',
  premium: '3',
  ultimate: '4',
};

function generateUniqueCode(washType: WashType, existingCodes: WashCode[]): string {
  const chars = '0123456789';
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentCodes = new Set(
    existingCodes
      .filter(c => new Date(c.createdAt) > thirtyDaysAgo)
      .map(c => c.code)
  );

  let code: string;
  let attempts = 0;
  do {
    code = washPrefix[washType];
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    attempts++;
    if (attempts > 1000) throw new Error('Unable to generate unique code');
  } while (recentCodes.has(code));

  return code;
}

export function createWashCode(
  washType: WashType,
  expiresAt: Date,
  existingCodes: WashCode[],
  customerPhone: string,
  price: number,
): WashCode {
  return {
    id: crypto.randomUUID(),
    code: generateUniqueCode(washType, existingCodes),
    washType,
    customerPhone,
    price,
    createdAt: new Date(),
    expiresAt,
    used: false,
    totalWashes: 1,
    washesUsed: 0,
  };
}

export function isCodeExpired(code: WashCode): boolean {
  return new Date() > new Date(code.expiresAt);
}

export function getCodeStatus(code: WashCode): 'active' | 'used' | 'expired' {
  if (code.totalWashes > 1) {
    // Multi-wash: used only when all washes consumed
    if (code.washesUsed >= code.totalWashes) return 'used';
    if (isCodeExpired(code)) return 'expired';
    return 'active';
  }
  if (code.used) return 'used';
  if (isCodeExpired(code)) return 'expired';
  return 'active';
}

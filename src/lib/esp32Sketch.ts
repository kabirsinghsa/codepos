// Generates the ESP32 relay sketch for one site / bay.
const TEMPLATE = `/*
  GES Code Controller - Bay Relay (ESP32)
  Site: __SITE_NAME__   Bay: __BAY_ID__
  ---------------------------------------
  Polls the GES Code Controller table 'wash_bay_status' for ONE bay.
  When a new wash starts (status = 'washing' with a new current_code),
  it pulses the relay for that wash type. The relay contacts go to the
  Delta PLC inputs that select/start the wash programme.

  The app tells the ESP32 WHICH relay to pulse for each wash
  (set per wash on the site's Washes & Relays page), so changing
  the wash menu never needs a new sketch.

  This site uses __RELAY_COUNT__ relay(s):
__RELAY_MAP__

  Board: __BOARD_NAME__
  Arduino IDE board setting: __BOARD_IDE__   Libraries: ArduinoJson (v7) by Benoit Blanchon
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_task_wdt.h>

// ================== SETTINGS - CHANGE THESE ==================
const char* WIFI_SSID     = "__WIFI_SSID__";
const char* WIFI_PASSWORD = "__WIFI_PASSWORD__";

const int   BAY_ID = __BAY_ID__;   // __SITE_NAME__ (kiosk link ?site_id=__BAY_ID__)

// Relay output pins (safe ESP32 GPIOs)
const int RELAY_COUNT = __RELAY_COUNT__;        // relays used at this site (1-8)
const int RELAY_PINS[8] = { __RELAY_PINS__ };   // relay 1..8 for this board

// Most cheap relay boards switch ON when the pin goes LOW. Set false if yours is active-high.
const bool RELAY_ACTIVE_LOW = __ACTIVE_LOW__;

const unsigned long RELAY_PULSE_MS = __PULSE_MS__;  // default pulse; the app can override per site
const unsigned long POLL_MS        = __POLL_MS__;  // how often to check Supabase

// ---- Machine busy input (PLC "cycle running" output) ----
// Wire the PLC output through an optocoupler or interposing relay contact to BUSY_PIN and GND.
// While the machine is busy the kiosk refuses new codes, so a second car can't start a wash.
const bool USE_BUSY_INPUT  = __USE_BUSY__;
const int  BUSY_PIN        = __BUSY_PIN__;      // input with internal pull-up
const bool BUSY_ACTIVE_LOW = true;   // true = contact CLOSED (pin to GND) means busy
const char* DEVICE_KEY     = "__DEVICE_KEY__";   // this site's secret key - keep private
// ============================================================

// GES Code Controller project (public anon key - read-only access to bay status)
const char* SUPABASE_URL = "__SUPABASE_URL__";
const char* SUPABASE_ANON_KEY =
  "__SUPABASE_KEY__";

const int STATUS_LED = __STATUS_LED__;          // on-board LED: on = WiFi connected (-1 = none)
const int WDT_TIMEOUT_S = 30;      // reboot if the loop ever hangs

Preferences prefs;
String lastCode = "";              // last wash ID we triggered (survives reboots)
unsigned long lastPoll = 0;
unsigned long wifiRetryAt = 0;
unsigned long wifiBackoff = 1000;

void relayWrite(int idx, bool on) {
  digitalWrite(RELAY_PINS[idx], (on ^ RELAY_ACTIVE_LOW) ? HIGH : LOW);
}

int relayForWashType(const String& t) {
  if (t == "basic")    return 0;
  if (t == "standard") return 1;
  if (t == "premium")  return 2;
  if (t == "ultimate") return 3;
  return -1;
}

void pulseRelay(int idx, unsigned long ms) {
  Serial.printf("[RELAY] Pulsing relay %d (GPIO %d) for %lu ms\\n", idx + 1, RELAY_PINS[idx], ms);
  relayWrite(idx, true);
  unsigned long start = millis();
  while (millis() - start < ms) { esp_task_wdt_reset(); delay(10); }
  relayWrite(idx, false);
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (STATUS_LED >= 0) digitalWrite(STATUS_LED, HIGH);
    wifiBackoff = 1000;
    return;
  }
  if (STATUS_LED >= 0) digitalWrite(STATUS_LED, LOW);
  if (millis() < wifiRetryAt) return;
  Serial.println("[WIFI] Connecting...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  wifiRetryAt = millis() + wifiBackoff;
  wifiBackoff = min(wifiBackoff * 2, 30000UL);   // back off up to 30 s
}

void pollBay() {
  WiFiClientSecure client;
  client.setInsecure();            // skips certificate check; fine for a read-only status poll
  HTTPClient http;
  http.setTimeout(5000);

  String url = String(SUPABASE_URL) + "/rest/v1/wash_bay_status?select=status,current_wash_type,current_code,current_relay,pulse_ms&id=eq." + BAY_ID;
  if (!http.begin(client, url)) { Serial.println("[HTTP] begin failed"); return; }
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  int code = http.GET();
  if (code != 200) {
    Serial.printf("[HTTP] Error %d\\n", code);
    http.end();
    return;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err || !doc.is<JsonArray>() || doc.size() == 0) {
    Serial.println("[JSON] No bay row found - check BAY_ID");
    return;
  }

  String status   = doc[0]["status"] | "";
  String washType = doc[0]["current_wash_type"] | "";
  String washCode = doc[0]["current_code"] | "";
  int relayNum    = doc[0]["current_relay"] | 0;                       // 1-based, set by the app
  unsigned long pulseMs = doc[0]["pulse_ms"] | (int)RELAY_PULSE_MS;
  if (pulseMs < 100 || pulseMs > 30000) pulseMs = RELAY_PULSE_MS;

  // New wash = status 'washing' with a wash ID we haven't triggered before
  if (status == "washing" && washCode.length() > 0 && washCode != lastCode) {
    // Older washes without a relay number fall back to Basic=1 .. Ultimate=4
    int relay = relayNum >= 1 ? relayNum - 1 : relayForWashType(washType);
    if (relay < 0 || relay >= RELAY_COUNT) relay = 0;               // out of range -> relay 1
    Serial.printf("[BAY %d] New wash: %s -> relay %d\\n", BAY_ID, washCode.c_str(), relay + 1);
    pulseRelay(relay, pulseMs);
    lastCode = washCode;
    prefs.putString("lastCode", lastCode);   // don't re-trigger after a power cut
  }
}

// ---- Busy input reporting ----
bool busyState = false, busyCandidate = false, busySent = false, busyEverSent = false;
unsigned long busyChangedAt = 0, lastBusyReport = 0;

bool readBusyPin() {
  bool level = digitalRead(BUSY_PIN) == HIGH;
  return BUSY_ACTIVE_LOW ? !level : level;
}

bool reportBusy(bool busy) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(5000);
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/report_bay_busy";
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  String body = String("{\\"p_bay\\":") + BAY_ID + ",\\"p_key\\":\\"" + DEVICE_KEY + "\\",\\"p_busy\\":" + (busy ? "true" : "false") + "}";
  int code = http.POST(body);
  String resp = http.getString();
  http.end();
  Serial.printf("[BUSY] Reported %s -> HTTP %d\\n", busy ? "BUSY" : "READY", code);
  if (code == 200 && resp.indexOf("false") >= 0) Serial.println("[BUSY] Rejected - check BAY_ID / DEVICE_KEY");
  return code == 200 && resp.indexOf("true") >= 0;
}

void handleBusyInput() {
  if (!USE_BUSY_INPUT) return;
  bool now = readBusyPin();
  if (now != busyCandidate) { busyCandidate = now; busyChangedAt = millis(); }
  if (millis() - busyChangedAt >= 300) busyState = busyCandidate;   // 300 ms debounce
  bool changed = !busyEverSent || busyState != busySent;
  bool heartbeat = millis() - lastBusyReport >= 20000;                // every 20 s so the app knows we're online
  if ((changed || heartbeat) && WiFi.status() == WL_CONNECTED) {
    lastBusyReport = millis();
    if (reportBusy(busyState)) { busySent = busyState; busyEverSent = true; }
  }
}

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < RELAY_COUNT; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    relayWrite(i, false);                     // all relays OFF at power-up
  }
  if (STATUS_LED >= 0) pinMode(STATUS_LED, OUTPUT);
  if (USE_BUSY_INPUT) pinMode(BUSY_PIN, INPUT_PULLUP);

  prefs.begin("codepos", false);
  lastCode = prefs.getString("lastCode", "");

  esp_task_wdt_config_t wdt = { .timeout_ms = WDT_TIMEOUT_S * 1000, .idle_core_mask = 0, .trigger_panic = true };
  esp_task_wdt_reconfigure(&wdt);
  esp_task_wdt_add(NULL);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  Serial.printf("GES Code Controller relay - Bay %d\\n", BAY_ID);
}

void loop() {
  esp_task_wdt_reset();
  ensureWiFi();
  if (WiFi.status() == WL_CONNECTED && millis() - lastPoll >= POLL_MS) {
    lastPoll = millis();
    pollBay();
  }
  handleBusyInput();
  delay(20);
}
`;

export interface SketchOptions {
  siteName: string;
  bayId: number;
  wifiSsid?: string;
  wifiPassword?: string;
  activeLow?: boolean;
  pollSeconds?: number;
  relayCount?: number;
  pulseMs?: number;
  relayMap?: string[];   // e.g. ["Relay 1: Quick Wash, Full Wash", ...]
  useBusyInput?: boolean;
  deviceKey?: string;
  board?: BoardId;
}

export type BoardId = 'generic' | 'waveshare6';

// Pin maps per supported relay board
export const BOARDS: Record<BoardId, {
  label: string; ide: string; pins: number[]; maxRelays: number; statusLed: number; busyPin: number; activeLow: boolean; note: string;
}> = {
  generic: {
    label: 'ESP32 relay board / ESP32 Dev + relay module',
    ide: 'ESP32 Dev Module',
    pins: [26, 27, 32, 33, 25, 14, 13, 23], maxRelays: 8, statusLed: 2, busyPin: 4, activeLow: true,
    note: 'Relays on GPIO 26, 27, 32, 33, 25, 14, 13, 23. Busy input on GPIO 4.',
  },
  waveshare6: {
    label: 'Waveshare ESP32-S3-Relay-6CH (Micro Robotics W26756)',
    ide: 'ESP32S3 Dev Module',
    pins: [1, 2, 41, 42, 45, 46, 1, 1], maxRelays: 6, statusLed: -1, busyPin: 4, activeLow: false,
    note: 'Relays CH1-CH6 = GPIO 1, 2, 41, 42, 45, 46 (fixed on the board). Power 7-36 V DC or USB-C. Busy input: GPIO 4 on the Pico header.',
  },
};

// Escape text for a C string literal / block comment
const cStr = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const cComment = (v: string) => v.replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');

export function buildEsp32Sketch(o: SketchOptions): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const poll = Math.max(1, Math.round(o.pollSeconds || 1)) * 1000;
  return TEMPLATE
    .split('__WIFI_SSID__').join(cStr(o.wifiSsid || 'YOUR_WIFI_NAME'))
    .split('__WIFI_PASSWORD__').join(cStr(o.wifiPassword || 'YOUR_WIFI_PASSWORD'))
    .split('__BAY_ID__').join(String(o.bayId))
    .split('__SITE_NAME__').join(cComment(o.siteName))
    .split('__ACTIVE_LOW__').join(o.activeLow === false ? 'false' : 'true')
    .split('__POLL_MS__').join(String(poll))
    .split('__SUPABASE_URL__').join(url)
    .split('__SUPABASE_KEY__').join(key)
    .split('__USE_BUSY__').join(o.useBusyInput ? 'true' : 'false')
    .split('__DEVICE_KEY__').join(cStr(o.deviceKey || ''))
    .split('__BOARD_NAME__').join(cComment(BOARDS[o.board || 'generic'].label))
    .split('__BOARD_IDE__').join(cComment(BOARDS[o.board || 'generic'].ide))
    .split('__RELAY_PINS__').join(BOARDS[o.board || 'generic'].pins.join(', '))
    .split('__BUSY_PIN__').join(String(BOARDS[o.board || 'generic'].busyPin))
    .split('__STATUS_LED__').join(String(BOARDS[o.board || 'generic'].statusLed))
    .split('__RELAY_COUNT__').join(String(Math.min(BOARDS[o.board || 'generic'].maxRelays, Math.max(1, o.relayCount || 4))))
    .split('__PULSE_MS__').join(String(o.pulseMs || 1000))
    .split('__RELAY_MAP__').join((o.relayMap && o.relayMap.length ? o.relayMap : ['(no washes set up yet)'])
      .map(l => '    ' + cComment(l)).join('\n'));
}

export function sketchFileName(siteName: string, bayId: number) {
  const slug = siteName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'site';
  return `bay${bayId}_${slug}.ino`;
}

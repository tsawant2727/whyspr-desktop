# Whyspr

Real-time AI sales copilot for medical TC (teleconsultation) follow-up calls. Listens to the call, transcribes both sides, and suggests live replies the sales rep can say back to the patient. Like Parakeet AI, but trained for CureMeAbroad's medical-tourism sales playbook.

## How it works

1. Sales rep starts the app and joins a Zoom/Meet call with the patient.
2. App captures **system audio** (patient voice from the call) + **mic audio** (sales rep voice), mixes them, downsamples to 16kHz PCM.
3. Audio streams to **Deepgram Nova-3** for real-time multi-language transcription with speaker diarization.
4. When the patient finishes speaking (utterance-end event), the last ~60s of transcript is sent to **Claude Haiku 4.5** with your custom system prompt.
5. Suggested reply streams into the always-on-top overlay window. Sales rep reads it out loud (in their own words).

## Tech stack

- **Electron 33** + **electron-vite** — cross-platform desktop shell
- **React 18** + **Tailwind** — overlay and settings UI
- **Deepgram SDK** — streaming STT (`multi`/`nova-3` for code-switched Hindi+English)
- **Anthropic SDK** — Claude Haiku 4.5 streaming responses
- **electron-store** — encrypted local settings (API keys, system prompt)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get API keys

- **Deepgram**: https://console.deepgram.com — sign up, create a project, copy the API key. Free $200 credit covers ~700 hours of streaming.
- **Anthropic**: https://console.anthropic.com — create an API key with access to Claude Haiku 4.5.

Paste both into the Settings window the first time you run the app (Cmd/Ctrl+, from the overlay).

### 3. Run in dev mode

```bash
npm run dev
```

The overlay window appears top-right. Click **Settings** to paste API keys and customize the system prompt.

### 4. Build a distributable

```bash
npm run build:mac   # produces .dmg in dist/
npm run build:win   # produces NSIS installer
```

## Using it on a real call

1. Start the app — overlay window appears.
2. Click **Start**. Browser asks you to share a screen/tab — pick the Zoom/Meet tab and **enable "Share audio"** (the checkbox at the bottom of the share dialog). This is what gives the app access to the patient's voice.
3. Microphone is requested separately — accept.
4. Join the call. Conversation transcript fills the overlay. After each patient turn, a suggestion appears.
5. Click **Copy** if you want the suggestion in clipboard, or just read it in your own words.

### Platform notes

**macOS 13+**: System audio capture works natively via ScreenCaptureKit (built into modern Electron). Grant Screen Recording permission when prompted (System Settings → Privacy & Security → Screen Recording).

**macOS 12 or older**: ScreenCaptureKit unavailable — install [BlackHole](https://existential.audio/blackhole/) virtual audio device and route your call audio through it, then share that as the "screen" source.

**Windows 10/11**: WASAPI loopback works out of the box. No extra setup. When sharing in the dialog, pick **Entire screen** or the **Zoom/Meet window**, ensure "Share system audio" is checked.

## Customizing the AI

Everything the AI knows about your sales playbook lives in **one big system prompt**. Open Settings → System Prompt. Paste:

- Product details (treatments, hospitals, doctors)
- Common objections and how to handle each one
- Pricing guidance
- Tone/style examples
- Words to avoid (medical promises, guarantees)
- Patient persona info if you have it

There's no upper limit — Claude Haiku 4.5 has a 200K token context. Realistically, keep it under ~20K characters for fast responses.

## Cost estimate (per 30-minute call)

| Service | Usage | Cost |
|---|---|---|
| Deepgram Nova-3 multi | 30 min streaming | ~$0.13 |
| Claude Haiku 4.5 | ~20 suggestions, ~5K input + 100 output tokens each | ~$0.05 |
| **Total** | | **~$0.18** |

## Project structure

```
sales-copilot/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # App entry, IPC, tray
│   │   ├── session.ts           # Glues STT + LLM + transcript state
│   │   ├── windows/             # Overlay + Settings BrowserWindow factories
│   │   ├── stt/deepgram.ts      # Deepgram streaming client
│   │   ├── llm/claude.ts        # Claude streaming client
│   │   └── store/settings.ts    # Encrypted electron-store
│   ├── preload/index.ts         # contextBridge API
│   ├── renderer/
│   │   ├── overlay.html / settings.html
│   │   └── src/
│   │       ├── overlay/         # React app for overlay window
│   │       ├── settings/        # React app for settings window
│   │       └── audio-capture.ts # getDisplayMedia + getUserMedia mixer
│   └── shared/types.ts          # Shared TS types
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

## Roadmap

- [ ] Call recording + post-call summary (clinical questions to flag for doctor follow-up)
- [ ] Per-patient context (auto-pull TC notes from CDP backend)
- [ ] Multiple prompt presets (different products / treatments)
- [ ] Performance scoring (objection handling effectiveness)
- [ ] Coaching mode (highlight missed opportunities, not just suggest)

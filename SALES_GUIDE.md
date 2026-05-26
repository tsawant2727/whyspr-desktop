# Whyspr — Quick Start Guide

Yeh app aapke TC follow-up calls me real-time AI suggestions deta hai. Patient kuch puchhe, AI turant ek reply suggest karega jo aap apne style me bol sakte ho.

## First-time setup (sirf ek baar)

### Step 1: Install karo

**Mac users:**
1. `Whyspr.dmg` file download karo (admin se mile)
2. Double-click karke open karo
3. App icon ko Applications folder me drag karo
4. **⚠️ IMPORTANT (unsigned build fix):** Terminal kholo (Cmd+Space → "Terminal" type karo → Enter), aur yeh command paste karke Enter:
   ```bash
   xattr -cr "/Applications/Whyspr.app"
   ```
   Yeh Apple ki "damaged" wali fake error hata deta hai (yeh isliye aati hai kyunki app abhi Apple-signed nahi hai)
5. Applications folder se Whyspr launch karo
6. Agar phir bhi "unidentified developer" warning aaye:
   - Right-click app → **Open** → confirm dialog me **Open** click karo, OR
   - System Settings → Privacy & Security → niche scroll karke "Open Anyway" click karo

**Windows users:**
1. `Whyspr Setup.exe` download karo
2. Double-click karo
3. Agar Windows SmartScreen warning aaye → **More info** → **Run anyway**
4. Install wizard complete karo → Start menu se launch

### Step 2: Permissions de do

App pehli baar chalega to 2 popups aayenge:

**Mac:**
- **Microphone access** — Allow karo (yeh aapki awaaz capture karta hai)
- **Screen Recording** — Allow karo (yeh Zoom/Meet ki awaaz capture karta hai)
- ⚠️ Screen Recording allow karne ke baad **app quit karke restart karna padega** (Cmd+Q se quit karo, dobara open karo)

**Windows:**
- **Microphone access** popup aaye → Allow

### Step 3: Settings configure karo

1. App khulne ke baad top-right me chota overlay window dikhega
2. **Settings** button click karo (overlay ke header me)
3. Admin se 2 keys lo aur paste karo:
   - **Deepgram API Key** (audio-to-text ke liye)
   - **Anthropic API Key** (AI suggestions ke liye)
4. **Language:** "Multi (Hindi/English/regional)" select karo
5. Niche **System Prompt** me already CureMeAbroad ka context bhara hua hai — agar koi specific objection handling add karna ho to wahan likho
6. **Save** click karo

Settings window band kar do — wapas overlay pe aa jao.

---

## Har call ke pehle (10 seconds)

1. Zoom/Google Meet open karo, patient ka link join karo (ya hosting kar rahe ho to start karo)
2. Whyspr overlay window screen ke top-right me dikhega (agar nahi to system tray/menu bar me icon dhundo → **Show Overlay**)
3. Overlay me **Start** button click karo
4. **Screen Sharing dialog aayega** — yeh sirf audio capture ke liye hai, koi screen actually share nahi hogi (overlay automatically hide rehta hai patient se):
   - **Mac:** Native picker me apni screen select karo → **Share** click karo
   - **Windows:** ⚠️ **CRITICAL** — "Entire Screen" select karo aur **bottom me "Share system audio" checkbox MUST be ON karna hai**, varna patient ki awaaz capture nahi hogi. Phir **Share** click karo.
5. Top par green dot dikhne lagega + status active hoga

Ab ready ho. Call shuru karo normally.

## Call ke dauran

- **Aapka transcript** "SALES" label ke saath dikhega
- **Patient ka transcript** "PATIENT" label ke saath dikhega
- Jab patient kuch puchhe / objection raise kare, ~1 second baad **Suggested reply** box me AI ki suggestion stream hoke aayegi
- Aap us suggestion ko padh ke apne words me bol sakte ho — robot ki tarah word-by-word mat padhna, bas ideas lo
- Agar suggestion pasand nahi to **Regenerate** click karo — naya suggestion banega
- Suggestion copy karna ho to **Copy** button

### Tips

- Suggestion ko apna banao — patient ka naam use karo, apna tone rakho. AI sirf direction deti hai.
- Suggestion 1-2 sentences me hi hogi. Aap usse expand kar sakte ho.
- Medical questions par AI defer karegi doctor pe — usse aage doctor ki appointment book karne wali baat karo.
- Hindi me patient bola to Hindi me suggestion aayegi; English bola to English; mix kiya to Hinglish.

## Call ke baad

1. Overlay me **Stop** button click karo
2. Screen sharing automatically band ho jayegi
3. Transcript local me save nahi hota (privacy ke liye) — agar yaad rakhna hai to manually note kar lo

## Common issues

### "System audio not captured" error

**Mac:** System Settings → Privacy & Security → Screen & System Audio Recording → Whyspr ko enable karo, phir app **quit karke restart** karo (sirf window close mat karo, Cmd+Q).

**Windows:** Screen share dialog me "Share system audio" checkbox missed kiya hoga — Stop karke phir Start karo, is baar checkbox enable karo.

### Suggestions slow aa rahe hain (5+ seconds)

Internet check karo. AI ko Anthropic ke server tak request bhejni hoti hai, slow net pe lag aata hai. Mobile hotspot pe try mat karo, WiFi use karo.

### Transcript me galat shabd aa rahe hain

- Patient ke saath bolne ka time alag-alag karo (overlap mat hone do as much as possible)
- Background noise kam karo
- Settings me Language "Hindi" set karke try karo agar mostly Hindi me hi baat ho rahi hai

### Overlay window kaha gaya?

System tray (Windows) ya menu bar (Mac top-right) me Whyspr icon dhundo → click → **Show Overlay**

### App band karna hai pura

Tray icon → **Quit**. Sirf × button hide karta hai (background me chalta rehta hai).

---

## Privacy

- Aapki calls **record nahi hoti** — sirf live transcript chalti hai, aur woh bhi save nahi hota
- Patient ka data Anthropic (AI provider) ko jata hai sirf during call, no storage
- API keys aapke laptop me encrypted form me save hain — koi aur access nahi kar sakta

## Support

Koi issue ho to admin ko message karo with:
- Error message (screenshot bhejo agar dikhe)
- Kaunsa OS — Mac ya Windows
- Kab hua — call ke pehle ya beech me

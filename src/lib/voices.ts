import type { TwinLanguage, VoiceProviderId } from '../types';

export interface VoiceOption {
  id: string;
  label: string;
  languageHint: TwinLanguage | 'Multilingual';
  style: string;
}

export const FREE_HINDI_VOICES: VoiceOption[] = [
  {
    id: 'hi-IN-MadhurNeural',
    label: 'Madhur Neural — Natural Male (Hindi / Hinglish)',
    languageHint: 'Hindi',
    style: 'Warm, grounded studio male',
  },
  {
    id: 'hi-IN-SwaraNeural',
    label: 'Swara Neural — Natural Female (Hindi / Hinglish)',
    languageHint: 'Hindi',
    style: 'Clear, expressive editorial female',
  },
  {
    id: 'en-IN-PrabhatNeural',
    label: 'Prabhat Neural — Indian Male (Hinglish / English)',
    languageHint: 'Hinglish',
    style: 'Conversational Indian founder cadence',
  },
  {
    id: 'en-IN-NeerjaNeural',
    label: 'Neerja Neural — Indian Female (Hinglish / English)',
    languageHint: 'English',
    style: 'Crisp, approachable Indian presenter',
  },
];

export const GEMINI_STUDIO_VOICES: VoiceOption[] = [
  {
    id: 'Charon',
    label: 'Charon (Deep Editorial Male)',
    languageHint: 'Multilingual',
    style: 'Authoritative bass cadence',
  },
  {
    id: 'Puck',
    label: 'Puck (Energetic Conversational)',
    languageHint: 'Multilingual',
    style: 'Lively creator hook delivery',
  },
  {
    id: 'Kore',
    label: 'Kore (Clear Studio Female)',
    languageHint: 'Multilingual',
    style: 'Warm articulate explainer',
  },
  {
    id: 'Fenrir',
    label: 'Fenrir (Warm Baritone)',
    languageHint: 'Multilingual',
    style: 'Calm documentary narrator',
  },
  {
    id: 'Zephyr',
    label: 'Zephyr (Articulate Neutral)',
    languageHint: 'Multilingual',
    style: 'Clean balanced pace',
  },
  {
    id: 'Aoede',
    label: 'Aoede (Expressive Storytelling Female)',
    languageHint: 'Multilingual',
    style: 'Melodic narrative phrasing',
  },
  {
    id: 'Leda',
    label: 'Leda (Youthful Conversational)',
    languageHint: 'Multilingual',
    style: 'Fast-paced reels cadence',
  },
  {
    id: 'Orus',
    label: 'Orus (Structured Presenter)',
    languageHint: 'Multilingual',
    style: 'Sharp analytical tone',
  },
];

export function defaultVoiceForProvider(
  provider: VoiceProviderId,
  language: TwinLanguage = 'Hindi'
): string {
  if (provider === 'free_hindi_neural') {
    if (language === 'English') return 'en-IN-PrabhatNeural';
    if (language === 'Hinglish') return 'hi-IN-MadhurNeural';
    return 'hi-IN-MadhurNeural';
  }
  if (provider === 'ambient_studio') return 'Studio Beat';
  return 'Charon';
}

export function samplePreviewText(language: TwinLanguage): string {
  if (language === 'Hindi') {
    return 'नमस्ते, मैं आपका डिजिटल ट्विन हूँ। अब आप बिल्कुल मुफ़्त में प्राकृतिक हिंदी आवाज़ और कम से कम तीस सेकंड के वीडियो बना सकते हैं।';
  }
  if (language === 'Hinglish') {
    return 'Namaste, main aapka digital twin hoon. Ab aap free tier mein natural Hindi aur Hinglish voice ke saath minimum thirty second videos bana sakte hain.';
  }
  return 'Hello, I am your digital twin. Your studio renders minimum thirty-second videos with natural voice pacing and multi-scene motion.';
}

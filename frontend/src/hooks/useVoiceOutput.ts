import { useState, useEffect, useRef, useCallback } from 'react';

interface VoiceOutputOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
  voiceName?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  onPause?: () => void;
  onResume?: () => void;
}

interface VoiceOutputReturn {
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  voices: SpeechSynthesisVoice[];
  currentVoice: SpeechSynthesisVoice | null;
  speak: (text: string, options?: Partial<VoiceOutputOptions>) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setVoice: (voice: SpeechSynthesisVoice | null) => void;
  getEstimatedDuration: (text: string) => number;
}

export const useVoiceOutput = (defaultOptions: VoiceOutputOptions = {}): VoiceOutputReturn => {
  const {
    rate = 0.9,
    pitch = 1,
    volume = 1,
    lang = 'en-US',
    voiceName,
    onStart,
    onEnd,
    onError,
    onPause,
    onResume
  } = defaultOptions;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [currentVoice, setCurrentVoice] = useState<SpeechSynthesisVoice | null>(null);

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
      setIsSupported(true);

      // Load available voices
      const loadVoices = () => {
        const availableVoices = synthRef.current?.getVoices() || [];
        setVoices(availableVoices);

        // Set default voice
        if (!currentVoice && availableVoices.length > 0) {
          const preferredVoice = voiceName
            ? availableVoices.find(voice => voice.name === voiceName)
            : availableVoices.find(voice => voice.lang.startsWith(lang.split('-')[0])) ||
              availableVoices.find(voice => voice.default) ||
              availableVoices[0];

          setCurrentVoice(preferredVoice || null);
        }
      };

      // Load voices immediately
      loadVoices();

      // Load voices when they change (some browsers load asynchronously)
      if (synthRef.current) {
        synthRef.current.addEventListener('voiceschanged', loadVoices);
      }

      return () => {
        if (synthRef.current) {
          synthRef.current.removeEventListener('voiceschanged', loadVoices);
        }
      };
    }
  }, [lang, voiceName, currentVoice]);

  // Monitor speaking state
  useEffect(() => {
    const checkSpeakingState = () => {
      if (synthRef.current) {
        setIsSpeaking(synthRef.current.speaking && !synthRef.current.paused);
        setIsPaused(synthRef.current.paused);
      }
    };

    const interval = setInterval(checkSpeakingState, 100);
    return () => clearInterval(interval);
  }, []);

  const speak = useCallback((text: string, options: Partial<VoiceOutputOptions> = {}) => {
    if (!synthRef.current || !isSupported) {
      onError?.(new Error('Speech synthesis not supported'));
      return;
    }

    // Stop current speech
    if (synthRef.current.speaking) {
      synthRef.current.cancel();
    }

    // Clean and prepare text
    const cleanText = cleanTextForSpeech(text);
    if (!cleanText.trim()) {
      return;
    }

    // Create utterance
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Apply voice settings
    utterance.rate = options.rate ?? rate;
    utterance.pitch = options.pitch ?? pitch;
    utterance.volume = options.volume ?? volume;
    utterance.lang = options.lang ?? lang;

    if (currentVoice) {
      utterance.voice = currentVoice;
    }

    // Set up event handlers
    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
      console.log('Speech started');
      onStart?.();
      options.onStart?.();
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      currentUtteranceRef.current = null;
      console.log('Speech ended');
      onEnd?.();
      options.onEnd?.();
    };

    utterance.onerror = (event) => {
      setIsSpeaking(false);
      setIsPaused(false);
      currentUtteranceRef.current = null;
      const error = new Error(`Speech synthesis error: ${event.error}`);
      console.error('Speech synthesis error:', event);
      onError?.(error);
      options.onError?.(error);
    };

    utterance.onpause = () => {
      setIsPaused(true);
      onPause?.();
      options.onPause?.();
    };

    utterance.onresume = () => {
      setIsPaused(false);
      onResume?.();
      options.onResume?.();
    };

    // Store reference and speak
    currentUtteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  }, [rate, pitch, volume, lang, currentVoice, isSupported, onStart, onEnd, onError, onPause, onResume]);

  const pause = useCallback(() => {
    if (synthRef.current && synthRef.current.speaking && !synthRef.current.paused) {
      synthRef.current.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (synthRef.current && synthRef.current.paused) {
      synthRef.current.resume();
    }
  }, []);

  const stop = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
      currentUtteranceRef.current = null;
    }
  }, []);

  const setVoice = useCallback((voice: SpeechSynthesisVoice | null) => {
    setCurrentVoice(voice);
  }, []);

  const getEstimatedDuration = useCallback((text: string): number => {
    // Estimate reading time based on average speaking rate
    const wordsPerMinute = 150; // Average speaking rate
    const words = cleanTextForSpeech(text).split(/\s+/).length;
    return (words / wordsPerMinute) * 60 * 1000; // Return milliseconds
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  return {
    isSpeaking,
    isPaused,
    isSupported,
    voices,
    currentVoice,
    speak,
    pause,
    resume,
    stop,
    setVoice,
    getEstimatedDuration
  };
};

// Helper function to clean text for speech synthesis
const cleanTextForSpeech = (text: string): string => {
  return text
    // Remove markdown formatting
    .replace(/[*_`~]/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
};

// Hook for managing voice settings
export const useVoiceSettings = () => {
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('voiceSettings');
    return saved ? JSON.parse(saved) : {
      rate: 0.9,
      pitch: 1,
      volume: 1,
      autoRead: false,
      preferredVoice: null,
      language: 'en-US'
    };
  });

  const updateSettings = useCallback((newSettings: Partial<typeof settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('voiceSettings', JSON.stringify(updated));
  }, [settings]);

  return {
    settings,
    updateSettings
  };
};

// Hook for text chunking (for long texts)
export const useTextChunking = () => {
  const chunkText = useCallback((text: string, maxLength: number = 200): string[] => {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (currentChunk.length + trimmedSentence.length + 1 <= maxLength) {
        currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk + '.');
        }
        currentChunk = trimmedSentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk + '.');
    }

    return chunks;
  }, []);

  return { chunkText };
}; 
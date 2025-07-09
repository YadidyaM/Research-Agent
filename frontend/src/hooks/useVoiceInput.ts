import { useState, useEffect, useRef, useCallback } from 'react';

// Extend the Window interface to include webkitSpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface VoiceInputOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

interface VoiceInputReturn {
  isRecording: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  confidence: number;
  error: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  resetTranscript: () => void;
}

export const useVoiceInput = (options: VoiceInputOptions = {}): VoiceInputReturn => {
  const {
    language = 'en-US',
    continuous = false,
    interimResults = true,
    maxAlternatives = 1,
    onTranscript,
    onError,
    onStart,
    onEnd
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check browser support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  // Initialize speech recognition
  const initializeRecognition = useCallback(() => {
    if (!isSupported) return null;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = language;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = maxAlternatives;

    recognition.onstart = () => {
      console.log('Voice recognition started');
      setIsRecording(true);
      setError(null);
      onStart?.();
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += transcript;
          setConfidence(result[0].confidence || 0);
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript);
        onTranscript?.(finalTranscript, true);
      }

      if (interimTranscript) {
        setInterimTranscript(interimTranscript);
        onTranscript?.(interimTranscript, false);
      }

      // Auto-stop after 3 seconds of silence
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        if (isRecording) {
          recognition.stop();
        }
      }, 3000);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      const errorMessage = getErrorMessage(event.error);
      setError(errorMessage);
      setIsRecording(false);
      onError?.(errorMessage);
    };

    recognition.onend = () => {
      console.log('Voice recognition ended');
      setIsRecording(false);
      setInterimTranscript('');
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      onEnd?.();
    };

    return recognition;
  }, [language, continuous, interimResults, maxAlternatives, onTranscript, onError, onStart, onEnd, isSupported, isRecording]);

  const startRecording = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition is not supported in this browser');
      return;
    }

    if (isRecording) {
      return;
    }

    try {
      if (!recognitionRef.current) {
        recognitionRef.current = initializeRecognition();
      }

      if (recognitionRef.current) {
        recognitionRef.current.start();
      }
    } catch (err) {
      console.error('Failed to start voice recognition:', err);
      setError('Failed to start voice recognition');
    }
  }, [isSupported, isRecording, initializeRecognition]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
  }, [isRecording]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setConfidence(0);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isRecording,
    isSupported,
    transcript,
    interimTranscript,
    confidence,
    error,
    startRecording,
    stopRecording,
    resetTranscript
  };
};

// Helper function to get user-friendly error messages
const getErrorMessage = (error: string): string => {
  switch (error) {
    case 'no-speech':
      return 'No speech detected. Please try again.';
    case 'audio-capture':
      return 'Microphone not accessible. Please check permissions.';
    case 'not-allowed':
      return 'Microphone permission denied. Please allow microphone access.';
    case 'network':
      return 'Network error occurred during speech recognition.';
    case 'service-not-allowed':
      return 'Speech recognition service not allowed.';
    case 'bad-grammar':
      return 'Speech recognition grammar error.';
    case 'language-not-supported':
      return 'Language not supported for speech recognition.';
    default:
      return `Speech recognition error: ${error}`;
  }
};

// Voice command detection hook
export const useVoiceCommands = (commands: Record<string, () => void>) => {
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  const processTranscript = useCallback((transcript: string, isFinal: boolean) => {
    if (!isFinal) return;

    const normalizedTranscript = transcript.toLowerCase().trim();
    
    for (const [command, action] of Object.entries(commands)) {
      if (normalizedTranscript.includes(command.toLowerCase())) {
        setLastCommand(command);
        action();
        break;
      }
    }
  }, [commands]);

  return {
    lastCommand,
    processTranscript,
    clearLastCommand: () => setLastCommand(null)
  };
}; 
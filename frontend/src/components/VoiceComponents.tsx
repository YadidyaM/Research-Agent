import React from 'react';
import styled, { keyframes, css } from 'styled-components';

// Animations
const pulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
`;

const wave = keyframes`
  0%, 100% { height: 4px; }
  50% { height: 20px; }
`;

const ripple = keyframes`
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  100% {
    transform: scale(2.4);
    opacity: 0;
  }
`;

// Voice Button Component
interface VoiceButtonProps {
  isActive?: boolean;
  isRecording?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary' | 'minimal';
  title?: string;
  children?: React.ReactNode;
}

const StyledVoiceButton = styled.button<VoiceButtonProps>`
  position: relative;
  width: ${props => 
    props.size === 'small' ? '32px' : 
    props.size === 'large' ? '56px' : '40px'
  };
  height: ${props => 
    props.size === 'small' ? '32px' : 
    props.size === 'large' ? '56px' : '40px'
  };
  border-radius: 50%;
  border: 2px solid ${props => 
    props.isActive ? '#dc2626' : 
    props.variant === 'minimal' ? 'transparent' :
    '#e5e5e7'
  };
  background: ${props => 
    props.isActive ? '#dc2626' : 
    props.variant === 'minimal' ? 'transparent' :
    '#ffffff'
  };
  color: ${props => 
    props.isActive ? '#ffffff' : 
    props.variant === 'minimal' ? '#666666' :
    '#666666'
  };
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  font-size: ${props => 
    props.size === 'small' ? '14px' : 
    props.size === 'large' ? '24px' : '16px'
  };
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: ${props => props.disabled ? 0.5 : 1};

  &:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  ${props => props.isRecording && css`
    animation: ${pulse} 1.5s infinite;
    
    &::before {
      content: '';
      position: absolute;
      top: -4px;
      left: -4px;
      right: -4px;
      bottom: -4px;
      border-radius: 50%;
      border: 2px solid #dc2626;
      animation: ${ripple} 1.5s infinite;
    }
  `}
`;

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  isActive,
  isRecording,
  onClick,
  disabled,
  size = 'medium',
  variant = 'primary',
  title,
  children
}) => {
  return (
    <StyledVoiceButton
      isActive={isActive}
      isRecording={isRecording}
      onClick={onClick}
      disabled={disabled}
      size={size}
      variant={variant}
      title={title}
    >
      {children || (isRecording ? '🎙️' : '🎤')}
    </StyledVoiceButton>
  );
};

// Voice Waveform Component
interface VoiceWaveformProps {
  isActive: boolean;
  barCount?: number;
  height?: string;
}

const WaveformContainer = styled.div<{ height: string }>`
  display: flex;
  align-items: center;
  gap: 2px;
  height: ${props => props.height};
`;

const WaveformBar = styled.span<{ isActive: boolean; delay: number }>`
  width: 3px;
  min-height: 4px;
  height: ${props => props.isActive ? '20px' : '4px'};
  background: #dc2626;
  border-radius: 2px;
  transition: height 0.1s ease;
  
  ${props => props.isActive && css`
    animation: ${wave} 1s infinite;
    animation-delay: ${props.delay}s;
  `}
`;

export const VoiceWaveform: React.FC<VoiceWaveformProps> = ({
  isActive,
  barCount = 5,
  height = '24px'
}) => {
  return (
    <WaveformContainer height={height}>
      {Array.from({ length: barCount }, (_, i) => (
        <WaveformBar
          key={i}
          isActive={isActive}
          delay={i * 0.1}
        />
      ))}
    </WaveformContainer>
  );
};

// Voice Status Indicator
interface VoiceStatusProps {
  status: 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
  message?: string;
}

const StatusContainer = styled.div<{ status: string }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 20px;
  background: ${props => {
    switch (props.status) {
      case 'listening': return '#fef3c7';
      case 'processing': return '#dbeafe';
      case 'speaking': return '#d1fae5';
      case 'error': return '#fee2e2';
      default: return '#f9fafb';
    }
  }};
  border: 1px solid ${props => {
    switch (props.status) {
      case 'listening': return '#f59e0b';
      case 'processing': return '#3b82f6';
      case 'speaking': return '#10b981';
      case 'error': return '#ef4444';
      default: return '#e5e7eb';
    }
  }};
  font-size: 12px;
  color: ${props => {
    switch (props.status) {
      case 'listening': return '#92400e';
      case 'processing': return '#1e40af';
      case 'speaking': return '#047857';
      case 'error': return '#dc2626';
      default: return '#6b7280';
    }
  }};
`;

const StatusIcon = styled.span`
  font-size: 14px;
`;

const StatusText = styled.span`
  font-weight: 500;
`;

export const VoiceStatus: React.FC<VoiceStatusProps> = ({ status, message }) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'listening': return '👂';
      case 'processing': return '🧠';
      case 'speaking': return '🗣️';
      case 'error': return '❌';
      default: return '🔇';
    }
  };

  const getStatusText = () => {
    if (message) return message;
    
    switch (status) {
      case 'listening': return 'Listening...';
      case 'processing': return 'Processing...';
      case 'speaking': return 'Speaking...';
      case 'error': return 'Error occurred';
      default: return 'Voice inactive';
    }
  };

  return (
    <StatusContainer status={status}>
      <StatusIcon>{getStatusIcon()}</StatusIcon>
      <StatusText>{getStatusText()}</StatusText>
    </StatusContainer>
  );
};

// Voice Controls Panel
interface VoiceControlsProps {
  isRecording: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onStopSpeaking: () => void;
  onPauseSpeaking: () => void;
  onResumeSpeaking: () => void;
  disabled?: boolean;
}

const ControlsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
`;

const ControlButton = styled.button<{ active?: boolean }>`
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: ${props => props.active ? '#dc2626' : 'transparent'};
  color: ${props => props.active ? '#ffffff' : '#6b7280'};
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: ${props => props.active ? '#b91c1c' : '#f3f4f6'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  isRecording,
  isSpeaking,
  isPaused,
  onStartRecording,
  onStopRecording,
  onStopSpeaking,
  onPauseSpeaking,
  onResumeSpeaking,
  disabled
}) => {
  return (
    <ControlsContainer>
      {/* Recording Controls */}
      {!isRecording ? (
        <ControlButton
          onClick={onStartRecording}
          disabled={disabled}
          title="Start voice input"
        >
          🎤 Start
        </ControlButton>
      ) : (
        <ControlButton
          active
          onClick={onStopRecording}
          title="Stop voice input"
        >
          ⏹️ Stop
        </ControlButton>
      )}

      {/* Speaking Controls */}
      {isSpeaking && (
        <>
          {!isPaused ? (
            <ControlButton
              onClick={onPauseSpeaking}
              title="Pause speech"
            >
              ⏸️ Pause
            </ControlButton>
          ) : (
            <ControlButton
              onClick={onResumeSpeaking}
              title="Resume speech"
            >
              ▶️ Resume
            </ControlButton>
          )}
          <ControlButton
            onClick={onStopSpeaking}
            title="Stop speech"
          >
            🔇 Stop
          </ControlButton>
        </>
      )}
    </ControlsContainer>
  );
};

// Voice Settings Component
interface VoiceSettingsProps {
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  volume: number;
  onVoiceChange: (voice: SpeechSynthesisVoice | null) => void;
  onRateChange: (rate: number) => void;
  onPitchChange: (pitch: number) => void;
  onVolumeChange: (volume: number) => void;
}

const SettingsContainer = styled.div`
  padding: 16px;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const SettingsTitle = styled.h3`
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
`;

const SettingGroup = styled.div`
  margin-bottom: 16px;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const SettingLabel = styled.label`
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
`;

const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  background: #ffffff;
  color: #1f2937;

  &:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 1px #dc2626;
  }
`;

const Slider = styled.input`
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 2px;
  background: #e5e7eb;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #dc2626;
    cursor: pointer;
  }

  &::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #dc2626;
    cursor: pointer;
    border: none;
  }
`;

const SliderValue = styled.span`
  font-size: 12px;
  color: #6b7280;
  margin-left: 8px;
`;

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({
  voices,
  selectedVoice,
  rate,
  pitch,
  volume,
  onVoiceChange,
  onRateChange,
  onPitchChange,
  onVolumeChange
}) => {
  return (
    <SettingsContainer>
      <SettingsTitle>Voice Settings</SettingsTitle>
      
      <SettingGroup>
        <SettingLabel>Voice</SettingLabel>
        <Select
          value={selectedVoice?.name || ''}
          onChange={(e) => {
            const voice = voices.find(v => v.name === e.target.value) || null;
            onVoiceChange(voice);
          }}
        >
          <option value="">Default Voice</option>
          {voices.map((voice) => (
            <option key={voice.name} value={voice.name}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </Select>
      </SettingGroup>

      <SettingGroup>
        <SettingLabel>
          Rate <SliderValue>{rate.toFixed(1)}x</SliderValue>
        </SettingLabel>
        <Slider
          type="range"
          min="0.1"
          max="2"
          step="0.1"
          value={rate}
          onChange={(e) => onRateChange(parseFloat(e.target.value))}
        />
      </SettingGroup>

      <SettingGroup>
        <SettingLabel>
          Pitch <SliderValue>{pitch.toFixed(1)}</SliderValue>
        </SettingLabel>
        <Slider
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={pitch}
          onChange={(e) => onPitchChange(parseFloat(e.target.value))}
        />
      </SettingGroup>

      <SettingGroup>
        <SettingLabel>
          Volume <SliderValue>{Math.round(volume * 100)}%</SliderValue>
        </SettingLabel>
        <Slider
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        />
      </SettingGroup>
    </SettingsContainer>
  );
};

// Floating Voice Button for Mobile
interface FloatingVoiceButtonProps {
  isRecording: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const FloatingButton = styled.button<{ isRecording: boolean }>`
  position: fixed;
  bottom: 80px;
  right: 20px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  background: ${props => props.isRecording ? '#dc2626' : '#1f2937'};
  color: white;
  font-size: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: all 0.3s ease;
  z-index: 1000;

  &:hover:not(:disabled) {
    transform: scale(1.1);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (min-width: 768px) {
    display: none;
  }

  ${props => props.isRecording && css`
    animation: ${pulse} 1.5s infinite;
  `}
`;

export const FloatingVoiceButton: React.FC<FloatingVoiceButtonProps> = ({
  isRecording,
  onClick,
  disabled
}) => {
  return (
    <FloatingButton
      isRecording={isRecording}
      onClick={onClick}
      disabled={disabled}
      title={isRecording ? 'Stop recording' : 'Start voice input'}
    >
      {isRecording ? '🎙️' : '🎤'}
    </FloatingButton>
  );
}; 
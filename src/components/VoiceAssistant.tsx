import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Mic, MicOff, Volume2, VolumeX, Bot, Loader2, 
  Radio
} from 'lucide-react';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { useAudioPlayback } from '@/hooks/useAudioPlayback';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';

interface VoiceAssistantProps {
  onTranscript: (text: string) => void;
  isProcessing?: boolean;
}

interface GeminiAssistantResponse {
  reply: string;
}

export const VoiceAssistant = ({ onTranscript, isProcessing = false }: VoiceAssistantProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const { isRecording, startRecording, stopRecording } = useVoiceRecording();
  const { playAudio, stopAudio } = useAudioPlayback();
  const { toast } = useToast();

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";


  useEffect(() => {
    if (isRecording) {
      const interval = setInterval(() => {
        setAudioLevel(Math.random() * 100);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setAudioLevel(0);
    }
  }, [isRecording]);

  const handleStartListening = async () => {
    try {
      await startRecording();
      setIsListening(true);
      toast({
        title: "Listening...",
        description: "Speak clearly into your microphone",
      });
    } catch (error) {
      toast({
        title: "Microphone Error",
        description: "Unable to access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const handleStopListening = async () => {
    try {
      const audioData = await stopRecording();
      setIsListening(false);

      if (audioData) {
        const simulatedTranscript = "I need help with an emergency situation";
        onTranscript(simulatedTranscript);

        toast({
          title: "Processing request...",
          description: "Contacting AI rescue assistant",
        });

        const { data } = await axios.post<GeminiAssistantResponse>(
          `${BACKEND_URL}/api/gemini-assistant`,
          { input: simulatedTranscript }
        );

        if (data && data.reply) {
          toast({
            title: "AI Assistant",
            description: data.reply,
            duration: 8000,
          });
        } else {
          toast({
            title: "AI Assistant",
            description: "No response from AI rescue assistant.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      const message =
        (error as { isAxiosError?: boolean }).isAxiosError

          ? error.response?.data?.error || error.message
          : "Failed to reach backend.";
      toast({
        title: "AI Assistant Error",
        description: message,
        variant: "destructive",
      });
    }
  };

  const toggleListening = () => {
    if (isListening) {
      handleStopListening();
    } else {
      handleStartListening();
    }
  };

  return (
    <Card className="border-sky-100 bg-gradient-to-br from-white to-sky-50">
      <CardContent className="p-6">
        <div className="flex flex-col items-center space-y-6">
          {/* Voice Assistant Status */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-full flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">AI Voice Assistant</h3>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-green-600">Ready</span>
                <Badge className="bg-sky-100 text-sky-700 ml-2">
                  <Radio className="h-3 w-3 mr-1" />
                  24/7 Active
                </Badge>
              </div>
            </div>
          </div>

          {/* Audio Visualization */}
          {isListening && (
            <div className="flex items-center space-x-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-2 bg-sky-500 rounded-full transition-all duration-100"
                  style={{
                    height: `${Math.max(8, audioLevel + Math.random() * 20)}px`,
                    opacity: 0.7 + Math.random() * 0.3,
                  }}
                />
              ))}
            </div>
          )}

          {/* Main Controls */}
          <div className="flex space-x-4">
            <Button
              onClick={toggleListening}
              disabled={isProcessing}
              className={`w-20 h-20 rounded-full ${
                isListening
                  ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200"
                  : "bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 shadow-lg shadow-sky-200"
              } transition-all duration-200`}
            >
              {isProcessing ? (
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              ) : isListening ? (
                <MicOff className="h-8 w-8 text-white" />
              ) : (
                <Mic className="h-8 w-8 text-white" />
              )}
            </Button>

            <Button
              variant="outline"
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-16 h-16 rounded-full border-sky-300 hover:bg-sky-50"
            >
              {isPlaying ? (
                <VolumeX className="h-6 w-6 text-sky-600" />
              ) : (
                <Volume2 className="h-6 w-6 text-sky-600" />
              )}
            </Button>
          </div>

          {/* Status Text */}
          <div className="text-center">
            {isListening ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-600">🎤 Listening...</p>
                <p className="text-xs text-gray-500">Tap the red button to stop</p>
              </div>
            ) : isProcessing ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-sky-600">🤖 Processing...</p>
                <p className="text-xs text-gray-500">AI is analyzing your request</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-700">Press to speak</p>
                <p className="text-xs text-gray-500">Hold or tap the blue button to start</p>
              </div>
            )}
          </div>

          {/* Voice Commands Help */}
          <div className="w-full pt-4 border-t border-sky-100">
            <p className="text-xs text-gray-600 text-center mb-2">💡 Voice Commands:</p>
            <div className="grid grid-cols-1 gap-1 text-xs text-gray-500">
              <div>"Help me" - Emergency assistance</div>
              <div>"I'm trapped" - Rescue request</div>
              <div>"Medical emergency" - Health emergency</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

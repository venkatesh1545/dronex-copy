import { useEffect, useRef, useState } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Square, AlertTriangle, Loader2, Signal, Shield, Video } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DetectedObject {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}

type RekognitionLabel = {
  Name: string;
  Confidence?: number;
  Instances?: Array<{
    BoundingBox: {
      Width: number;
      Height: number;
      Left: number;
      Top: number;
    };
    Confidence?: number;
  }>;
};

interface LiveStreamBroadcastProps {
  streamId: string;
  isAdmin: boolean;
  onStop: () => void;
  quality: 'SD' | 'HD' | '4K';
}

export const LiveStreamBroadcast = ({ streamId, isAdmin, onStop, quality }: LiveStreamBroadcastProps) => {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const broadcastCanvasRef = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [detections, setDetections] = useState<DetectedObject[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastCount, setBroadcastCount] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>();
  const broadcastIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameNumberRef = useRef(0);

  // Video recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // AWS Rekognition detection state
  const [rekognitionLabels, setRekognitionLabels] = useState<RekognitionLabel[]>([]);
  const [isRekognitionDetecting, setIsRekognitionDetecting] = useState(false);
  const rekognitionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const REKOGNITION_BACKEND_URL = 'https://disastermanagementrekognition.onrender.com/api/rekognition/detect';

  useEffect(() => {
    if (isAdmin) {
      initializeStream();
    }

    return () => {
      cleanup();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (model && isStreaming && isAdmin && videoRef.current) {
      startObjectDetection();
      startRekognitionDetection();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      stopRekognitionDetection();
    };
  }, [model, isStreaming, isAdmin]);

  const initializeStream = async () => {
    try {
      await startStream();
      await loadModel();
      setTimeout(() => {
        startBroadcasting();
        startRecording(); // Start recording
      }, 2000);
    } catch (error) {
      console.error('❌ Error initializing stream:', error);
    }
  };

  const loadModel = async () => {
    try {
      setIsModelLoading(true);
      console.log('🔄 Loading COCO-SSD model...');
      const loadedModel = await cocoSsd.load({
        base: 'lite_mobilenet_v2'
      });
      setModel(loadedModel);
      console.log('✅ Model loaded successfully');
    } catch (error) {
      console.error('❌ Error loading detection model:', error);
    } finally {
      setIsModelLoading(false);
    }
  };

  const startStream = async () => {
    try {
      const constraints = {
        video: {
          width: { ideal: quality === '4K' ? 1920 : (quality === 'HD' ? 1280 : 640) },
          height: { ideal: quality === '4K' ? 1080 : (quality === 'HD' ? 720 : 480) },
          facingMode: 'user'
        },
        audio: true // Enable audio for recording
      };

      console.log('📹 Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsStreaming(true);
          console.log('✅ Stream started successfully');
        };
      }
    } catch (error) {
      console.error('❌ Error starting stream:', error);
      throw error;
    }
  };

  // --- VIDEO RECORDING ---
  const startRecording = () => {
    if (!streamRef.current) return;

    try {
      console.log('🎥 Starting video recording...');
      recordedChunksRef.current = [];

      const options = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000 // 2.5 Mbps
      };

      const mediaRecorder = new MediaRecorder(streamRef.current, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('🎬 Recording stopped, uploading...');
        await uploadRecording();
      };

      mediaRecorder.start(1000); // Collect data every second
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      console.log('✅ Recording started');
    } catch (error) {
      console.error('❌ Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('⏹️ Stopping recording...');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadRecording = async () => {
    if (recordedChunksRef.current.length === 0) {
      console.log('⚠️ No recorded data to upload');
      return;
    }

    setIsUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const fileName = `${streamId}-${Date.now()}.webm`;

      console.log(`📤 Uploading: ${fileName} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);

      const { error: uploadError } = await supabase.storage
        .from('stream-recordings')
        .upload(fileName, blob, {
          contentType: 'video/webm',
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('stream-recordings')
        .getPublicUrl(fileName);

      console.log('✅ Uploaded to:', publicUrl);

      // Use Record type instead of any
      const { error: updateError } = await supabase
        .from('drone_streams')
        .update({
          recording_url: publicUrl,
          is_recorded: true
        } as Record<string, unknown>)
        .eq('id', streamId);

      if (updateError) throw updateError;

      console.log('✅ Recording saved');

      toast({
        title: "Recording Saved",
        description: "Stream has been saved successfully",
      });
    } catch (error) {
      console.error('❌ Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };



  const startBroadcasting = () => {
    if (!isAdmin) return;

    console.log('📡 Starting frame broadcast...');
    setIsBroadcasting(true);
    
    broadcastIntervalRef.current = setInterval(() => {
      broadcastFrame();
    }, 200);

    console.log('✅ Broadcasting started');
  };

  const broadcastFrame = async () => {
    if (!videoRef.current || !broadcastCanvasRef.current) return;

    const video = videoRef.current;
    const canvas = broadcastCanvasRef.current;

    if (video.readyState !== 4) return;

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameData = canvas.toDataURL('image/jpeg', 0.7);

      frameNumberRef.current++;
      
      const { error } = await supabase
        .from('stream_frames')
        .insert({
          stream_id: streamId,
          frame_data: frameData,
          frame_number: frameNumberRef.current
        });

      if (!error) {
        setBroadcastCount(prev => prev + 1);
        if (frameNumberRef.current % 10 === 0) {
          console.log(`✅ Successfully broadcasted ${frameNumberRef.current} frames`);
        }
      }
    } catch (error) {
      console.error('❌ Exception in broadcastFrame:', error);
    }
  };

  // --- AWS REKOGNITION DETECTION ---
  const startRekognitionDetection = () => {
    if (!isAdmin) return;
    if (rekognitionIntervalRef.current) return;

    console.log('🔍 Starting AWS Rekognition detection (every 3 seconds)...');
    setIsRekognitionDetecting(true);

    rekognitionIntervalRef.current = setInterval(() => {
      performRekognitionDetection();
    }, 3000);
  };

  const stopRekognitionDetection = () => {
    if (rekognitionIntervalRef.current) {
      clearInterval(rekognitionIntervalRef.current);
      rekognitionIntervalRef.current = null;
      setIsRekognitionDetecting(false);
      setRekognitionLabels([]);
      console.log('🛑 AWS Rekognition detection stopped');
    }
  };

  const performRekognitionDetection = async () => {
    if (!broadcastCanvasRef.current) return;

    try {
      const canvas = broadcastCanvasRef.current;
      const base64Frame = canvas.toDataURL('image/jpeg', 0.7);

      const res = await fetch(REKOGNITION_BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64Frame }),
      });

      if (!res.ok) return;

      const json = await res.json();
      const labels = json.labels || [];
      setRekognitionLabels(labels);

      const criticalDetection = labels.some(
        (l: RekognitionLabel) =>
          l.Name === 'Person' || l.Name === 'Human' || l.Name === 'Emergency'
      );

      if (criticalDetection) {
        console.log('🚨 CRITICAL DETECTION: Person/Emergency detected by AWS Rekognition!');
      }
    } catch (error) {
      console.error('❌ AWS Rekognition detection error:', error);
    }
  };

  const startObjectDetection = () => {
    if (!model || !videoRef.current || !canvasRef.current) return;

    const detectFrame = async () => {
      if (videoRef.current && videoRef.current.readyState === 4 && model) {
        try {
          const predictions = await model.detect(videoRef.current);
          setDetections(predictions as DetectedObject[]);
          drawDetections(predictions as DetectedObject[]);
        } catch (error) {
          console.error('Detection error:', error);
        }
      }

      animationFrameRef.current = requestAnimationFrame(detectFrame);
    };

    detectFrame();
  };

  const drawDetections = (predictions: DetectedObject[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    predictions.forEach((prediction) => {
      const [x, y, width, height] = prediction.bbox;
      
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      ctx.fillStyle = '#FF0000';
      const text = `${prediction.class} ${Math.round(prediction.score * 100)}%`;
      ctx.font = '18px Arial';
      const textWidth = ctx.measureText(text).width;
      ctx.fillRect(x, y > 30 ? y - 30 : y, textWidth + 10, 30);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(text, x + 5, y > 30 ? y - 8 : y + 20);
    });
  };

  const cleanup = () => {
    console.log('🧹 Cleaning up stream...');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (broadcastIntervalRef.current) {
      clearInterval(broadcastIntervalRef.current);
    }
    stopRekognitionDetection();
    stopRecording();
    setIsStreaming(false);
    setIsBroadcasting(false);
  };

  const handleStop = async () => {
    console.log('🛑 Stopping stream and saving recording...');
    
    stopRecording(); // This will trigger upload
    cleanup();
    
    // Wait a bit for upload to start
    setTimeout(() => {
      onStop();
    }, 1000);
  };

  return (
    <Card className="border-sky-100">
      <CardContent className="p-4">
        <div className="relative">
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              playsInline
              muted
            />
            
            <canvas ref={broadcastCanvasRef} className="hidden" />
            
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ objectFit: 'cover' }}
            />

            {(isModelLoading || isUploading) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-white text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                  <p className="text-sm">{isUploading ? 'Saving Recording...' : 'Loading AI Detection...'}</p>
                </div>
              </div>
            )}

            <div className="absolute top-4 left-4 flex gap-2 flex-wrap">
              <Badge className="bg-red-500 text-white">
                <span className="animate-pulse mr-1">●</span>
                LIVE
              </Badge>
              {isBroadcasting && (
                <Badge className="bg-purple-500 text-white">
                  <Signal className="h-3 w-3 mr-1 animate-pulse" />
                  Broadcasting
                </Badge>
              )}
              {isRecording && (
                <Badge className="bg-red-600 text-white">
                  <Video className="h-3 w-3 mr-1 animate-pulse" />
                  Recording
                </Badge>
              )}
              {model && (
                <Badge className="bg-green-500 text-white">
                  <Eye className="h-3 w-3 mr-1" />
                  AI Active
                </Badge>
              )}
              {isRekognitionDetecting && (
                <Badge className="bg-orange-500 text-white animate-pulse">
                  <Shield className="h-3 w-3 mr-1" />
                  AWS Detection ON
                </Badge>
              )}
            </div>

            {rekognitionLabels.length > 0 && (
              <div className="absolute top-4 right-4 space-y-1 max-h-48 overflow-y-auto">
                {rekognitionLabels.slice(0, 5).map((label, idx) => (
                  <Badge key={`aws-${idx}`} className="bg-orange-600 text-white block">
                    <Shield className="h-3 w-3 mr-1" />
                    {label.Name} {label.Confidence && `${Math.round(label.Confidence)}%`}
                  </Badge>
                ))}
              </div>
            )}

            {detections.length > 0 && rekognitionLabels.length === 0 && (
              <div className="absolute top-4 right-4 space-y-1 max-h-48 overflow-y-auto">
                {Array.from(new Set(detections.map(d => d.class))).slice(0, 5).map((cls, idx) => (
                  <Badge key={idx} className="bg-green-500 text-white block">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {cls} detected
                  </Badge>
                ))}
              </div>
            )}

            <div className="absolute bottom-4 left-4">
              <Button onClick={handleStop} variant="destructive" size="sm" disabled={isUploading}>
                <Square className="h-4 w-4 mr-2" />
                {isUploading ? 'Saving...' : 'Stop Stream'}
              </Button>
            </div>

            <div className="absolute bottom-4 right-4 space-y-1">
              <div className="bg-black/70 text-white px-3 py-1 rounded text-sm">
                Local: {detections.length}
              </div>
              <div className="bg-orange-600/90 text-white px-3 py-1 rounded text-sm">
                AWS: {rekognitionLabels.length}
              </div>
              <div className="bg-black/70 text-white px-3 py-1 rounded text-sm">
                Frames: {frameNumberRef.current}
              </div>
              {isBroadcasting && broadcastCount > 0 && (
                <div className="bg-purple-600/90 text-white px-3 py-1 rounded text-sm">
                  📡 Sent: {broadcastCount}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

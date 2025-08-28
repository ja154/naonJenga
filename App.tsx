/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback, useEffect } from 'react';
import { analyzeVideoFrame, startVideoGeneration, checkVideoGenerationStatus } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import { MagicWandIcon } from './components/icons';
import StartScreen from './components/StartScreen';
import DescribePanel from './components/DescribePanel';
import type { AnalysisResult } from './types';

// Helper to extract a single frame from a video file as a data URL
const extractFrame = (videoFile: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(videoFile);
        video.muted = true;
        video.crossOrigin = "anonymous"; // Handle potential CORS issues with canvas

        const cleanup = () => {
            URL.revokeObjectURL(video.src);
            video.remove();
        };

        video.onloadeddata = () => {
            // Seek to roughly the middle of the video for a representative frame
            video.currentTime = video.duration / 2;
        };

        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                cleanup();
                return reject(new Error('Could not get canvas context'));
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg');
            cleanup();
            resolve(dataUrl);
        };

        video.onerror = (e) => {
            cleanup();
            // FIX: Properly handle the `onerror` event, which can be a string or an Event.
            // Accessing `e.target` is unsafe as `e` could be a string.
            // It's more direct to check `video.error` and handle the string case for `e`.
            const error = video.error || new Error(typeof e === 'string' ? e : 'Video loading failed');
            reject(new Error(`Failed to load video for frame extraction: ${error?.message || 'Unknown error'}`));
        };
        
        // Start loading the video
        video.load();
    });
};

const LoadingOverlay: React.FC<{ message: string }> = ({ message }) => (
    <div className="absolute inset-0 bg-black/80 z-30 flex flex-col items-center justify-center gap-6 animate-fade-in backdrop-blur-sm">
        <Spinner />
        <h3 className="text-xl text-gray-200 font-semibold text-center max-w-sm">{message}</h3>
    </div>
);

const App: React.FC = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [editablePrompt, setEditablePrompt] = useState<string>('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState<boolean>(false);
  const [isLoadingGeneration, setIsLoadingGeneration] = useState<boolean>(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Effect to manage object URLs for the uploaded video
  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoUrl(null);
    }
  }, [videoFile]);

  // Effect to clean up the generated video's object URL
  useEffect(() => {
    return () => {
      if (generatedVideoUrl) {
        URL.revokeObjectURL(generatedVideoUrl);
      }
    };
  }, [generatedVideoUrl]);

  const handleVideoUpload = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) {
        setError('Please upload a valid video file.');
        return;
    }
    setError(null);
    setAnalysisResult(null);
    setEditablePrompt('');
    setGeneratedVideoUrl(null);
    setVideoFile(file);
  }, []);

  const handleAnalyzeVideo = useCallback(async () => {
    if (!videoFile) {
      setError('No video loaded to analyze.');
      return;
    }
    
    setIsLoadingAnalysis(true);
    setError(null);
    setAnalysisResult(null);
    
    try {
        const frameDataUrl = await extractFrame(videoFile);
        const result = await analyzeVideoFrame(frameDataUrl);
        setAnalysisResult(result);
        setEditablePrompt(result.cinematicPrompt);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to analyze the video. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoadingAnalysis(false);
    }
  }, [videoFile]);

  const handleGenerateVideo = useCallback(async () => {
    if (!editablePrompt.trim()) {
        setError("Please generate or enter a prompt first.");
        return;
    }
    
    setIsLoadingGeneration(true);
    setGenerationMessage("Initializing video generation...");
    if (generatedVideoUrl) URL.revokeObjectURL(generatedVideoUrl);
    setGeneratedVideoUrl(null);
    setError(null);

    try {
        let operation = await startVideoGeneration(editablePrompt);
        setGenerationMessage("AI is crafting your masterpiece. This can take several minutes...");

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
            setGenerationMessage("Checking progress on your video...");
            operation = await checkVideoGenerationStatus(operation);
        }

        if (operation.error) {
            throw new Error(operation.error.message || "An unknown error occurred during video generation.");
        }
        
        setGenerationMessage("Video generated! Preparing for download...");
        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error("Video generation finished, but no video URL was found in the response.");
        }
        
        // The URI requires the API key to be fetched. We fetch it as a blob to create a local URL.
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!response.ok) {
            throw new Error(`Failed to download the generated video: ${response.statusText}`);
        }
        const videoBlob = await response.blob();
        const newVideoUrl = URL.createObjectURL(videoBlob);
        setGeneratedVideoUrl(newVideoUrl);

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to generate the video. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoadingGeneration(false);
        setGenerationMessage(null);
    }
  }, [editablePrompt, generatedVideoUrl]);
  
  const handleUploadNew = useCallback(() => {
      setVideoFile(null);
      setVideoUrl(null);
      setError(null);
      setAnalysisResult(null);
      setEditablePrompt('');
      if (generatedVideoUrl) URL.revokeObjectURL(generatedVideoUrl);
      setGeneratedVideoUrl(null);
  }, [generatedVideoUrl]);

  const handleDownload = useCallback(() => {
      if (generatedVideoUrl) {
          const link = document.createElement('a');
          link.href = generatedVideoUrl;
          link.download = `vidgen-ai-${Date.now()}.mp4`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
  }, [generatedVideoUrl]);
  
  const renderContent = () => {
    if (error) {
       return (
           <div className="text-center animate-fade-in bg-red-500/10 border border-red-500/20 p-8 rounded-lg max-w-2xl mx-auto flex flex-col items-center gap-4">
            <h2 className="text-2xl font-bold text-red-300">An Error Occurred</h2>
            <p className="text-md text-red-400">{error}</p>
            <button
                onClick={() => setError(null)}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg text-md transition-colors"
              >
                Try Again
            </button>
          </div>
        );
    }
    
    if (!videoUrl) {
      return <StartScreen onFileSelect={(files) => files && handleVideoUpload(files[0])} />;
    }

    return (
      <div className="w-full max-w-6xl mx-auto flex flex-col items-center gap-6 animate-fade-in relative">
        {isLoadingGeneration && <LoadingOverlay message={generationMessage || 'Processing...'} />}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            <div className="flex flex-col gap-2">
                <h2 className="text-xl font-bold text-center text-gray-300">Your Original Video</h2>
                <video key={videoUrl} controls className="w-full aspect-video rounded-lg bg-black shadow-lg" src={videoUrl}></video>
            </div>
            <div className="flex flex-col gap-2">
                <h2 className="text-xl font-bold text-center text-gray-300">AI Generated Video</h2>
                <div className="w-full aspect-video rounded-lg bg-black/40 shadow-lg flex items-center justify-center">
                    {generatedVideoUrl ? (
                        <video key={generatedVideoUrl} controls className="w-full h-full" src={generatedVideoUrl}></video>
                    ) : (
                        <p className="text-gray-400">Your generated video will appear here.</p>
                    )}
                </div>
            </div>
        </div>

        <div className="w-full bg-gray-800/70 border border-gray-700/80 rounded-lg p-4 flex flex-col gap-4 backdrop-blur-sm">
            <DescribePanel
                onGenerateDescription={handleAnalyzeVideo}
                isLoading={isLoadingAnalysis}
                description={analysisResult ? JSON.stringify(analysisResult, null, 2) : null}
            />

            {analysisResult && (
              <div className="w-full flex flex-col gap-4 pt-4 animate-fade-in">
                  <label htmlFor="prompt-textarea" className="font-semibold text-lg text-gray-300">
                      Editable Cinematic Prompt
                  </label>
                  <textarea
                      id="prompt-textarea"
                      value={editablePrompt}
                      onChange={(e) => setEditablePrompt(e.target.value)}
                      placeholder="The generated cinematic prompt will appear here. You can edit it or write your own."
                      className="w-full h-24 bg-gray-900 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:opacity-60 text-base resize-none"
                      disabled={isLoadingGeneration}
                  />
                  <button
                      onClick={handleGenerateVideo}
                      disabled={!editablePrompt.trim() || isLoadingGeneration}
                      className="w-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                  >
                      <MagicWandIcon className="w-5 h-5 mr-3" />
                      2. Generate New Video
                  </button>
              </div>
            )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
            <button 
                onClick={handleUploadNew}
                className="text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
            >
                Upload New Video
            </button>
            <button 
                onClick={handleDownload}
                disabled={!generatedVideoUrl}
                className="bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:from-green-800 disabled:to-green-700 disabled:shadow-none"
            >
                Download Generated Video
            </button>
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen text-gray-100 flex flex-col">
      <Header />
      <main className={`flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex justify-center ${videoFile ? 'items-start' : 'items-center'}`}>
        {renderContent()}
      </main>
    </div>
  );
};

export default App;

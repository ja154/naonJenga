/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { DocumentTextIcon } from './icons';

interface DescribePanelProps {
  onGenerateDescription: () => void;
  isLoading: boolean;
  description: string | null;
}

const DescribePanel: React.FC<DescribePanelProps> = ({ onGenerateDescription, isLoading, description }) => {
  const [copyButtonText, setCopyButtonText] = useState('Copy');

  useEffect(() => {
    if (copyButtonText === 'Copied!') {
      const timer = setTimeout(() => setCopyButtonText('Copy'), 2000);
      return () => clearTimeout(timer);
    }
  }, [copyButtonText]);

  const handleCopy = () => {
    if (description) {
      navigator.clipboard.writeText(description);
      setCopyButtonText('Copied!');
    }
  };

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-6 flex flex-col items-center gap-4 animate-fade-in backdrop-blur-sm">
      <h3 className="text-xl font-semibold text-center text-gray-200">AI Video Analysis</h3>
      <p className="text-md text-gray-400 text-center max-w-2xl">
        The AI has analyzed a frame from your video and generated a structured JSON description. Use the cinematic prompt below to generate a new video, or write your own.
      </p>

      {description ? (
        <div className="w-full mt-4 animate-fade-in flex flex-col gap-4">
          <div className="relative bg-black/30 rounded-lg p-4 border border-gray-600">
            <pre className="text-left text-sm text-gray-300 whitespace-pre-wrap overflow-x-auto max-h-60">
              <code>{description}</code>
            </pre>
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 text-xs rounded-md transition-colors"
                aria-label="Copy JSON to clipboard"
            >
                {copyButtonText}
            </button>
          </div>
          <button
            onClick={onGenerateDescription}
            disabled={isLoading}
            className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
          >
            {isLoading ? 'Analyzing...' : 'Re-analyze Video Frame'}
          </button>
        </div>
      ) : (
        <button
          onClick={onGenerateDescription}
          disabled={isLoading}
          className="mt-4 flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-8 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-lg disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
        >
          <DocumentTextIcon className="w-6 h-6 mr-3" />
          {isLoading ? 'AI is analyzing the video...' : '1. Analyze Video Frame'}
        </button>
      )}
    </div>
  );
};

export default DescribePanel;

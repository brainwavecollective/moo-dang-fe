// src/App.tsx
import React, { useState } from 'react';
import './App.css';
import Cartesia, { WebPlayer } from "@cartesia/cartesia-js";
import { Client } from "@langchain/langgraph-sdk";

const App: React.FC = () => {
  const [assistants, setAssistants] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // LangChain LangGraph Client
  const client = new Client({ apiUrl: "http://209.137.198.194:8123" });
  const indexID = "65eff59e6dc02a0c6004a058";

  // OpenAI narration generation function
  const generateOpenAINarration = async (content: string): Promise<string> => {
    try {
      const response = await fetch('http://localhost:5000/generate-narration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      const data = await response.json();
      const narration = data.narration || 'No narration available.';
      setMessages(prevMessages => [...prevMessages, `OpenAI Narration: ${narration}`]);

      return narration;
    } catch (error) {
      console.error('Error generating OpenAI narration:', error);
      setMessages(prevMessages => [...prevMessages, 'Error generating OpenAI narration.']);
      return 'Error generating narration.';
    }
  };

  // Cartesia TTS function
  const generateCartesiaAudio = async (text: string): Promise<void> => {
    const cartesia = new Cartesia({
      apiKey: '03a50233-d770-4b31-9cac-8106d6ec1bfd', // Replace with your actual API key
    });

    // Initialize the WebSocket with specified output format
    const websocket = cartesia.tts.websocket({
      container: 'raw',
      encoding: 'pcm_f32le',
      sampleRate: 44100,
    });

    try {
      await websocket.connect();

      // Send the text for TTS processing
      const response = await websocket.send({
        model_id: 'sonic-english',
        voice: {
          mode: 'id',
          id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
        },
        transcript: text,
      });

      // Use WebPlayer for audio playback with required bufferDuration
      console.log("Playing stream...");
      const player = new WebPlayer({ bufferDuration: 2000 }); // Example bufferDuration in milliseconds, adjust as needed
      await player.play(response.source); // Pass response.source to play
      console.log("Done playing.");
    } catch (error) {
      console.error('Error with Cartesia WebSocket:', error);
      setMessages(prevMessages => [...prevMessages, 'Error with Cartesia WebSocket.']);
    }
  };

  // Initialize LangGraph Chat
  const initializeLangGraphChat = async () => {
    if (!inputValue.trim() || isProcessing) return;

    setIsProcessing(true);
    let storedAgentName = '';

    try {
      const narration = await generateOpenAINarration(inputValue);
      setMessages(prev => [
        ...prev,
        {
          sender: 'openai',
          text: narration,
          link: '',
          linkText: 'Narration by OpenAI',
          twelveText: narration,
          asrTest: '',
          lameText: '',
          question: ''
        }
      ]);

      // List available assistants
      const assistantsList = await client.assistants.search();
      setAssistants(assistantsList);

      // Get the first assistant
      const assistant = assistantsList[0];

      // Create a new thread
      const thread = await client.threads.create();

      // List runs on this thread
      const runs = await client.runs.list(thread.thread_id);

      const input = {
        chat_history: [{ type: "user", content: `${indexID} ${inputValue}` }],
      };

      // Stream handling
      for await (const event of client.runs.stream(
        thread.thread_id,
        assistant.assistant_id,
        { input, streamMode: "messages" }
      )) {
        if (event.event === "metadata") {
          console.log('Event', event);
        } else if (event.event === "messages/partial") {
          for (const dataItem of event?.data) {
            if ("role" in dataItem && dataItem.role === "user") {
              console.log(`Human: ${dataItem.content}`);
            } else {
              console.log('item', dataItem);
              const content = dataItem.content || "";
              const responseMetadata = dataItem.response_metadata || {};

              if (responseMetadata) {
                try {
                  const functionCallArgs = dataItem.additional_kwargs?.function_call?.arguments || '';
                  const currentAgentName = extractAgentName(functionCallArgs);
                  if (currentAgentName) {
                    storedAgentName = currentAgentName;
                  }
                } catch (error) {
                  console.error("Error with function arguments:", error);
                }

                const finishReason = responseMetadata.finish_reason || "N/A";
                console.log(`Response Metadata: Finish Reason - ${finishReason}`);

                if (finishReason === 'stop') {
                  console.log(`${storedAgentName} ${content}`);

                  setMessages(prev => {
                    // Check if this message already exists
                    const messageExists = prev.some(msg => 
                      msg.text === content && msg.linkText === storedAgentName
                    );
                    
                    if (messageExists) return prev;
                    
                    return [...prev, {
                      sender: 'ai',
                      text: content,
                      link: '',
                      linkText: storedAgentName,
                      twelveText: content,
                      asrTest: '',
                      lameText: '',
                      question: inputValue
                    }];
                  });
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in chat initialization:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Extract Agent Name Helper Function
  const extractAgentName = (str: string) => {
    const match = str.match(/"next_worker"\s*:\s*"([^"]+)"/);
    return match ? match[1] : '';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  // Handle Generate Audio and LangGraph Chat
  const handleGenerateAudioAndChat = async () => {
    if (inputValue.trim() && !isProcessing) {
      setIsProcessing(true);
      try {
        // Generate narration and Cartesia audio
        const narration = await generateOpenAINarration(inputValue);
        await generateCartesiaAudio(narration);

        // Initialize LangGraph Chat
        await initializeLangGraphChat();
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="input-container" style={{ 
          marginBottom: '20px',
          width: '100%',
          maxWidth: '800px',
          padding: '0 20px',
          alignSelf: 'flex-start',
          display: 'flex',
          justifyContent: 'flex-start'
        }}>
          <div style={{
            display: 'flex',
            gap: '10px',
            maxWidth: '800px',
            width: '100%'
          }}>
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="Enter your message..."
              style={{
                padding: '12px 16px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                width: '100%',
                maxWidth: '500px',
                fontSize: '16px',
                color: '#000000',
                backgroundColor: '#ffffff'
              }}
            />
            <button
              onClick={handleGenerateAudioAndChat}
              disabled={isProcessing}
              style={{
                padding: '12px 24px',
                borderRadius: '4px',
                backgroundColor: isProcessing ? '#cccccc' : '#61dafb',
                border: 'none',
                color: 'white',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                whiteSpace: 'nowrap',
                minWidth: 'fit-content'
              }}
            >
              {isProcessing ? 'Processing...' : 'Generate Audio & Chat'}
            </button>
          </div>
        </div>
        
        {messages.map((message, index) => (
          <div key={index} style={{
            margin: '10px',
            padding: '20px',
            backgroundColor: 'rgba(97, 218, 251, 0.1)',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '800px',
            alignSelf: 'flex-start',
            wordBreak: 'break-word',
            boxSizing: 'border-box'
          }}>
            <div style={{ 
              fontWeight: 'bold', 
              marginBottom: '10px',
              textAlign: 'left',
              fontSize: '0.9em',
              color: '#61dafb'
            }}>
              {message.linkText && message.text && message.linkText}
            </div>
            <div style={{
              textAlign: 'left',
              lineHeight: '1.5',
              fontSize: '0.9em',
              whiteSpace: 'pre-wrap'
            }}>
              {message.text}
            </div>
          </div>
        ))}
        </header>
      </div>
    );
  };
  
  export default App;
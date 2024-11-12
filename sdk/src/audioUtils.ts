export async function playAudioData(audioDataChunks: ArrayBuffer[]) {
    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      for (const chunk of audioDataChunks) {
        const audioBuffer = await audioContext.decodeAudioData(chunk);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
      }
    } catch (error) {
      console.error("Error playing audio data:", error);
    }
  }
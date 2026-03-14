import { useState, useRef, useEffect } from 'react';
import { parseTraits } from '../utils/parser';

const WitnessInterview = ({ advancePhase, onDataChange, data, apiKey }) => {
  const messages = data.messages || [];
  const uploadedImage = data.sourceImage || null;
  const setUploadedImage = (img) => onDataChange({ sourceImage: img });
  
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onDataChange({
          sourceImage: reader.result,
          messages: [...messages, { id: Date.now(), text: `[Image Attached: ${file.name}]`, sender: 'user' }]
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    
    // Add user message
    const newMessages = [...messages, { id: Date.now(), text: input, sender: 'user' }];
    onDataChange({ messages: newMessages });
    const currentInput = input;
    setInput('');
    setIsTyping(true);

    // Simulate AI response & extraction
    setTimeout(async () => {
      const result = await parseTraits(currentInput, apiKey, data.structuredTraits || {});
      setIsTyping(false);
      
      const aiResponse = (!result || result.error) 
        ? { id: Date.now() + 1, text: `I'm having trouble connecting: ${result?.error || 'Unknown Error'}`, sender: 'ai' }
        : { id: Date.now() + 1, text: result.extractedAnyNewInfo ? "I've analyzed those details and updated our reconstruction profile." : "I've noted that, though it seems consistent with what we already have.", sender: 'ai' };

      const newTraits = result?.traits || {};
      
      onDataChange({
        faceDescription: (data.faceDescription || "") + " " + currentInput,
        structuredTraits: { ...(data.structuredTraits || {}), ...newTraits },
        messages: [...newMessages, aiResponse]
      });
    }, 1500);
  };

  const traits = data.structuredTraits || {};
  const needsClarification = Object.values(traits).some(t => t.confidence < 0.6);
  const lowConfidenceTraits = Object.entries(traits)
    .filter(([_, t]) => t.confidence < 0.6)
    .map(([key]) => key.replaceAll('_', ' '));

  return (
    <div className="glass-panel animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '80vh' }}>
      <div style={{ borderBottom: '1px solid var(--surface-border)', paddingBottom: '16px', marginBottom: '16px' }}>
        <h2>Witness Interview</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>Please describe the subject in natural language.</p>
      </div>

      {/* Chat Area */}
      <div ref={scrollRef} style={{ flex: '1 1 400px', minHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '12px', marginBottom: '8px' }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ 
            alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '95%',
            background: msg.sender === 'user' ? 'var(--primary)' : 'rgba(255, 255, 255, 0.12)',
            border: msg.sender === 'ai' ? '1px solid rgba(255, 255, 255, 0.2)' : 'none',
            padding: '14px 18px',
            borderRadius: msg.sender === 'user' ? '18px 18px 0 18px' : '18px 18px 18px 0',
            color: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            {msg.text}
          </div>
        ))}
        {isTyping && (
          <div className="animate-pulse" style={{ alignSelf: 'flex-start', background: 'rgba(255, 255, 255, 0.05)', padding: '12px 16px', borderRadius: '16px 16px 16px 0', border: '1px solid var(--surface-border)' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--text-secondary)', borderRadius: '50%', marginRight: '4px' }}></span>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--text-secondary)', borderRadius: '50%', marginRight: '4px' }}></span>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--text-secondary)', borderRadius: '50%' }}></span>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--surface-border)', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <input 
          type="file" 
          id="imageUpload" 
          accept="image/*" 
          style={{ display: 'none' }} 
          onChange={handleImageUpload} 
        />
        <label htmlFor="imageUpload" className="btn" style={{ cursor: 'pointer', padding: '8px 12px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          📷
        </label>
        <input 
          className="input-glass"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. He had a crooked nose, dark hair, and maybe a sharp jawline..."
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={handleSend}>Send</button>
      </div>

      {/* Image Preview Area */}
      {uploadedImage && (
        <div className="animate-fade-in" style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
           <img src={uploadedImage} alt="Uploaded evidence" style={{ height: '40px', width: '40px', objectFit: 'cover', borderRadius: '4px' }} />
           <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1 }}>Reference Image Attached</span>
           <button onClick={() => {
             setUploadedImage(null);
             onDataChange({ ...data, sourceImage: null });
           }} style={{ background: 'none', border: 'none', color: 'var(--warning)', cursor: 'pointer', fontSize: '0.85rem' }}>✕ Remove</button>
        </div>
      )}
      
      {/* Schema Live View & Actions */}
      {Object.keys(data.structuredTraits).length > 0 && (
        <div className="animate-fade-in" style={{ 
          marginTop: '24px', 
          background: 'rgba(0,0,0,0.3)', 
          padding: '16px', 
          borderRadius: '12px', 
          border: '1px solid rgba(16, 185, 129, 0.2)',
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', minHeight: '64px' }}>
            <h4 style={{ color: 'var(--success)', margin: 0, paddingTop: '8px' }}>Extracted Structured Schema</h4>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              <button 
                className="btn btn-primary" 
                onClick={advancePhase}
                disabled={Object.keys(traits).length === 0 || needsClarification}
                style={{ 
                  opacity: (Object.keys(traits).length > 0 && !needsClarification) ? 1 : 0.5,
                  minWidth: '180px',
                  height: '40px'
                }}
              >
                {needsClarification ? '🔒 Locked' : 'Generate Candidates →'}
              </button>
              {needsClarification && (
                <span style={{ fontSize: '0.7rem', color: 'var(--warning)', maxWidth: '200px', textAlign: 'right', animation: 'fade-in 0.3s ease' }}>
                  Please clarify: <b>{lowConfidenceTraits[0]}</b>
                </span>
              )}
            </div>
          </div>
            {Object.entries(data.structuredTraits).map(([key, trait]) => {
              const isLow = trait.confidence < 0.6;
              return (
                <div key={key} style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'minmax(100px, 140px) minmax(80px, 120px) 1fr 60px', 
                  alignItems: 'center', 
                  gap: '12px', 
                  background: 'rgba(255,255,255,0.05)', 
                  padding: '10px 16px', 
                  borderRadius: '10px',
                  position: 'relative',
                  borderLeft: isLow ? '3px solid var(--warning)' : '3px solid transparent',
                  minWidth: 0
                }}>
                  <div style={{ fontWeight: 500, textTransform: 'capitalize', fontSize: '0.9rem' }}>
                    {key.replaceAll('_', ' ')}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {trait.value}
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={trait.confidence * 100}
                    onChange={(e) => {
                      const newConfidence = parseInt(e.target.value) / 100;
                      onDataChange({
                        ...data,
                        structuredTraits: {
                          ...data.structuredTraits,
                          [key]: { ...trait, confidence: newConfidence }
                        }
                      });
                    }}
                    style={{ cursor: 'pointer', width: '100%' }}
                  />
                  <div style={{ textAlign: 'right', fontWeight: 'bold', color: isLow ? 'var(--warning)' : 'var(--success)', fontSize: '0.9rem' }}>
                    {Math.round(trait.confidence * 100)}%
                  </div>
                  {isLow && (
                    <div style={{ 
                      position: 'absolute', 
                      bottom: '-4px', 
                      left: '136px', 
                      fontSize: '0.65rem', 
                      color: 'var(--warning)', 
                      background: 'var(--surface)', 
                      padding: '0 4px',
                      borderRadius: '4px'
                    }}>
                      Clarification suggested
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default WitnessInterview;
